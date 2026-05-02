import { type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { getProductionMemberContext, savePageMap } from "@/lib/db";
import { hasPermission } from "@/lib/roles";
import { getPool } from "@/lib/pg";
import { computePageMap } from "@/lib/script-page";

export type ScriptBlockSearchResult = {
  blockId: string;
  label: string;       // e.g. "p.2", "1-1", "1-1A", "p.1-3", "1-1A-2"
  description?: string; // scene name, or content preview for block-level results
};

type Ctx = { params: Promise<{ id: string }> };

// Content preview for a block row
function blockDesc(r: { type: string; content: string; char_names: string }): string {
  const preview = r.content.slice(0, 40);
  return r.type === "dialogue" && r.char_names ? `${r.char_names}: ${preview}` : preview;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id: productionId } = await ctx.params;
  const session = getSession(req.cookies);
  if (!session) return Response.json({ error: "未登录" }, { status: 401 });

  const { memberRoles, overrides } = await getProductionMemberContext(
    session.openId, session.isAdmin, productionId
  );
  if (!hasPermission("script:read", session.isAdmin, memberRoles, overrides))
    return Response.json({ error: "权限不足" }, { status: 403 });

  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (!q) return Response.json({ results: [] });

  const pool = getPool();
  const results: ScriptBlockSearchResult[] = [];
  const dedup = (r: ScriptBlockSearchResult[]) => {
    const seen = new Set<string>();
    return r.filter(x => seen.has(x.blockId) ? false : (seen.add(x.blockId), true));
  };

  async function getPageMap(): Promise<Record<string, number>> {
    const pmRes = await pool.query<{ page_map: Record<string, Record<string, number>> | null }>(
      "SELECT page_map FROM production WHERE id = $1", [productionId]
    );
    const stored = pmRes.rows[0]?.page_map?.["a4"];
    if (stored && Object.keys(stored).length > 0) return stored;

    // page_map missing — compute on-demand and persist non-blocking
    const blocksRes = await pool.query<{ id: string; type: string; content: string; scene_id: string | null }>(
      "SELECT id, type, content, scene_id FROM script WHERE production_id = $1 ORDER BY sort_key",
      [productionId]
    );
    const ids = blocksRes.rows.map(r => r.id);
    const charRes = ids.length > 0
      ? await pool.query<{ script_id: string; character_id: string }>(
          "SELECT script_id, character_id FROM script_character WHERE script_id = ANY($1::text[]) ORDER BY script_id, position",
          [ids]
        )
      : { rows: [] };
    const charMap = new Map<string, string[]>();
    for (const r of charRes.rows) {
      if (!charMap.has(r.script_id)) charMap.set(r.script_id, []);
      charMap.get(r.script_id)!.push(r.character_id);
    }
    const blocks = blocksRes.rows.map(r => ({
      id: r.id,
      type: r.type === "stage" ? "stage" as const : "dialogue" as const,
      content: r.content,
      sceneId: r.scene_id,
      characterIds: charMap.get(r.id) ?? [],
      characterAnnotations: {} as Record<string, string>,
      lyric: false,
      rehearsalMark: null,
    }));
    const computed = computePageMap(blocks);
    savePageMap(productionId, { a4: computed }).catch(() => {});
    return computed;
  }

  // Fetch block rows with character names for block-level drill results
  async function fetchBlocks(
    where: string, params: unknown[]
  ): Promise<{ id: string; type: string; content: string; char_names: string }[]> {
    const res = await pool.query<{ id: string; type: string; content: string; char_names: string }>(
      `SELECT s.id, s.type, s.content,
         COALESCE((
           SELECT string_agg(ch.name, ', ' ORDER BY sc.position)
           FROM script_character sc JOIN character ch ON ch.id = sc.character_id
           WHERE sc.script_id = s.id
         ), '') AS char_names
       FROM script s
       WHERE ${where}
       ORDER BY s.sort_key LIMIT 15`,
      params
    );
    return res.rows;
  }

  // ─── Drill-down mode: query ends with '-' ─────────────────────────────────────
  if (q.endsWith("-")) {
    const base = q.slice(0, -1); // strip trailing dash

    // p.N- → list blocks on page N
    const pageDrill = base.match(/^p\.(\d+)$/i);
    if (pageDrill) {
      const pageNum = parseInt(pageDrill[1]);
      const pageMap = await getPageMap();
      const blockIds = Object.entries(pageMap).filter(([, p]) => p === pageNum).map(([id]) => id);
      if (blockIds.length > 0) {
        const rows = await fetchBlocks(
          "s.id = ANY($1) AND s.production_id = $2",
          [blockIds, productionId]
        );
        return Response.json({ results: rows.map((r, i) => ({
          blockId: r.id,
          label: `p.${pageNum}-${i + 1}`,
          description: blockDesc(r),
        })) });
      }
      return Response.json({ results: [] });
    }

    // S+M- → list blocks in scene+mark section
    const spmDrill = base.match(/^(\d[\d.\-]*)([A-Za-z]+)$/);
    if (spmDrill) {
      const [, sceneQuery, mark] = spmDrill;
      const sceneRes = await pool.query<{ id: string; num: string }>(
        `SELECT id, num FROM scene WHERE production_id = $1 AND num ILIKE $2 ORDER BY sort_order LIMIT 1`,
        [productionId, `${sceneQuery}%`]
      );
      if (sceneRes.rows[0]) {
        const scene = sceneRes.rows[0];
        const markStartRes = await pool.query<{ sort_key: string }>(
          `SELECT sort_key FROM script WHERE production_id = $1 AND scene_id = $2 AND rehearsal_mark ILIKE $3 ORDER BY sort_key LIMIT 1`,
          [productionId, scene.id, mark]
        );
        if (markStartRes.rows[0]) {
          const markSortKey = markStartRes.rows[0].sort_key;
          const nextMarkRes = await pool.query<{ sort_key: string }>(
            `SELECT sort_key FROM script
             WHERE production_id = $1 AND scene_id = $2
               AND rehearsal_mark IS NOT NULL AND rehearsal_mark NOT ILIKE $3
               AND sort_key > $4
             ORDER BY sort_key LIMIT 1`,
            [productionId, scene.id, mark, markSortKey]
          );
          const nextSortKey = nextMarkRes.rows[0]?.sort_key ?? null;
          const rows = nextSortKey
            ? await fetchBlocks(
                "s.production_id = $1 AND s.scene_id = $2 AND s.sort_key >= $3 AND s.sort_key < $4",
                [productionId, scene.id, markSortKey, nextSortKey]
              )
            : await fetchBlocks(
                "s.production_id = $1 AND s.scene_id = $2 AND s.sort_key >= $3",
                [productionId, scene.id, markSortKey]
              );
          const prefix = `${scene.num}${mark.toUpperCase()}`;
          return Response.json({ results: rows.map((r, i) => ({
            blockId: r.id,
            label: `${prefix}-${i + 1}`,
            description: blockDesc(r),
          })) });
        }
      }
      return Response.json({ results: [] });
    }

    // S- → child scenes if they exist; otherwise blocks in scene
    const sceneDrill = base.match(/^[\d.\-]+$/);
    if (sceneDrill) {
      const childRes = await pool.query<{ id: string; num: string; name: string }>(
        `SELECT id, num, name FROM scene
         WHERE production_id = $1 AND num ILIKE $2
         ORDER BY sort_order LIMIT 8`,
        [productionId, `${base}-%`]
      );
      if (childRes.rows.length > 0) {
        for (const scene of childRes.rows) {
          const fb = await pool.query<{ id: string }>(
            "SELECT id FROM script WHERE production_id = $1 AND scene_id = $2 ORDER BY sort_key LIMIT 1",
            [productionId, scene.id]
          );
          if (fb.rows[0]) {
            results.push({ blockId: fb.rows[0].id, label: scene.num, description: scene.name || undefined });
          }
        }
        return Response.json({ results: dedup(results) });
      }

      // No child scenes → show blocks in the exact scene
      const exactSceneRes = await pool.query<{ id: string }>(
        "SELECT id FROM scene WHERE production_id = $1 AND num = $2 LIMIT 1",
        [productionId, base]
      );
      if (exactSceneRes.rows[0]) {
        const rows = await fetchBlocks(
          "s.production_id = $1 AND s.scene_id = $2",
          [productionId, exactSceneRes.rows[0].id]
        );
        return Response.json({ results: rows.map((r, i) => ({
          blockId: r.id,
          label: `${base}-${i + 1}`,
          description: blockDesc(r),
        })) });
      }
      return Response.json({ results: [] });
    }
  }

  // ─── Page reference: p.N ─────────────────────────────────────────────────────
  const pageMatch = q.match(/^p\.(\d+)$/i);
  if (pageMatch) {
    const pageNum = parseInt(pageMatch[1]);
    const pageMap = await getPageMap();
    const blockIds = Object.entries(pageMap)
      .filter(([, p]) => p === pageNum)
      .map(([id]) => id);
    if (blockIds.length > 0) {
      const blockRes = await pool.query<{ id: string }>(
        "SELECT id FROM script WHERE id = ANY($1) AND production_id = $2 ORDER BY sort_key LIMIT 1",
        [blockIds, productionId]
      );
      if (blockRes.rows[0]) {
        results.push({ blockId: blockRes.rows[0].id, label: `p.${pageNum}`, description: `第${pageNum}页` });
      }
    }
    return Response.json({ results });
  }

  // ─── Scene+mark: digits + letters, e.g. "1-1A" ───────────────────────────────
  const scenePlusMark = q.match(/^(\d[\d.\-]*)([A-Za-z]+)$/);
  if (scenePlusMark) {
    const [, sceneQuery, mark] = scenePlusMark;
    const sceneRes = await pool.query<{ id: string; num: string; name: string }>(
      `SELECT id, num, name FROM scene
       WHERE production_id = $1 AND num ILIKE $2
       ORDER BY sort_order LIMIT 4`,
      [productionId, `${sceneQuery}%`]
    );
    for (const scene of sceneRes.rows) {
      const blockRes = await pool.query<{ id: string }>(
        `SELECT id FROM script
         WHERE production_id = $1 AND scene_id = $2 AND rehearsal_mark ILIKE $3
         ORDER BY sort_key LIMIT 1`,
        [productionId, scene.id, mark]
      );
      if (blockRes.rows[0]) {
        results.push({
          blockId: blockRes.rows[0].id,
          label: `${scene.num}${mark.toUpperCase()}`,
          description: scene.name || undefined,
        });
      }
    }
    return Response.json({ results: dedup(results).slice(0, 8) });
  }

  // ─── Scene only: digits/dashes, e.g. "1-1" ───────────────────────────────────
  const sceneOnly = q.match(/^[\d.\-]+$/);
  if (sceneOnly) {
    const sceneRes = await pool.query<{ id: string; num: string; name: string }>(
      `SELECT id, num, name FROM scene
       WHERE production_id = $1 AND (num ILIKE $2 OR name ILIKE $2)
       ORDER BY sort_order LIMIT 5`,
      [productionId, `${q}%`]
    );
    for (const scene of sceneRes.rows) {
      const firstBlock = await pool.query<{ id: string }>(
        "SELECT id FROM script WHERE production_id = $1 AND scene_id = $2 ORDER BY sort_key LIMIT 1",
        [productionId, scene.id]
      );
      if (firstBlock.rows[0]) {
        results.push({
          blockId: firstBlock.rows[0].id,
          label: scene.num,
          description: scene.name || undefined,
        });
      }
      const marksRes = await pool.query<{ id: string; rehearsal_mark: string }>(
        `SELECT DISTINCT ON (rehearsal_mark) id, rehearsal_mark FROM script
         WHERE production_id = $1 AND scene_id = $2 AND rehearsal_mark IS NOT NULL
         ORDER BY rehearsal_mark, sort_key LIMIT 5`,
        [productionId, scene.id]
      );
      for (const m of marksRes.rows) {
        results.push({
          blockId: m.id,
          label: `${scene.num}${m.rehearsal_mark}`,
          description: scene.name || undefined,
        });
      }
    }
    return Response.json({ results: dedup(results).slice(0, 8) });
  }

  // ─── Mark only: letters, e.g. "A" ────────────────────────────────────────────
  const markOnly = q.match(/^[A-Za-z]+$/);
  if (markOnly) {
    const res = await pool.query<{
      id: string; rehearsal_mark: string; scene_num: string; scene_name: string
    }>(
      `SELECT DISTINCT ON (s.scene_id, s.rehearsal_mark)
         s.id, s.rehearsal_mark, sc.num AS scene_num, sc.name AS scene_name
       FROM script s
       LEFT JOIN scene sc ON sc.id = s.scene_id
       WHERE s.production_id = $1 AND s.rehearsal_mark ILIKE $2
       ORDER BY s.scene_id, s.rehearsal_mark, s.sort_key
       LIMIT 8`,
      [productionId, `${q}%`]
    );
    for (const r of res.rows) {
      results.push({
        blockId: r.id,
        label: `${r.scene_num}${r.rehearsal_mark}`,
        description: r.scene_name || undefined,
      });
    }
    return Response.json({ results: dedup(results) });
  }

  // ─── Text search: scene name ──────────────────────────────────────────────────
  const sceneTextRes = await pool.query<{ id: string; num: string; name: string }>(
    `SELECT id, num, name FROM scene
     WHERE production_id = $1 AND (name ILIKE $2 OR num ILIKE $2)
     ORDER BY sort_order LIMIT 6`,
    [productionId, `%${q}%`]
  );
  for (const scene of sceneTextRes.rows) {
    const firstBlock = await pool.query<{ id: string }>(
      "SELECT id FROM script WHERE production_id = $1 AND scene_id = $2 ORDER BY sort_key LIMIT 1",
      [productionId, scene.id]
    );
    if (firstBlock.rows[0]) {
      results.push({
        blockId: firstBlock.rows[0].id,
        label: scene.num,
        description: scene.name || undefined,
      });
    }
  }
  return Response.json({ results: dedup(results).slice(0, 8) });
}
