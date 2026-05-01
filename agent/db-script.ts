import { getScriptEditorPool } from "./db";

export type ScriptBlockRow = {
  id:            string;
  lineNum:       number;
  pageNum:       number | null; // null when no page map requested
  type:          "dialogue" | "stage" | "lyric";
  content:       string;
  rehearsalMark: string | null;
  sceneName:     string | null;
  sceneNumber:   string | null;
  characters:    string[];
};

// ── Page map computation (mirrors lib/script-page.ts, no lib imports) ─────────

const LINE_HEIGHT         = 28;
const FONT_SIZE           = 14;
const CHAR_NAME_HEIGHT    = 22;
const SCENE_HEADER_HEIGHT = 44;

// Usable content height per layout (height - marginTop - marginBottom)
const LAYOUT_CONTENT_H: Record<string, number> = {
  "a4":          1123 - 90 - 90,
  "letter":      1056 - 90 - 90,
  "a3-2col":     1123 - 90 - 90,
  "tablet-2col": 1056 - 90 - 90,
};
// Content width per layout (width - 2*marginX)
const LAYOUT_CONTENT_W: Record<string, number> = {
  "a4":          794  - 150,
  "letter":      816  - 150,
  "a3-2col":     794  - 150,
  "tablet-2col": 816  - 150,
};

type LightBlock = {
  id: string; type: "dialogue" | "stage"; lyric: boolean;
  content: string; sceneId: string | null; characterIds: string[];
};

function estimateLines(text: string, upl: number): number {
  if (!text.trim()) return 1;
  let total = 0;
  for (const para of text.split("\n")) {
    let units = 0, lineCount = 1;
    for (const ch of para) {
      units += /[⺀-⿿　-鿿豈-﫿︰-﹏]/.test(ch) ? 1 : 0.5;
      if (units > upl) { lineCount++; units = /[⺀-⿿　-鿿豈-﫿︰-﹏]/.test(ch) ? 1 : 0.5; }
    }
    total += lineCount;
  }
  return total || 1;
}

function sameChars(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a); return b.every(x => s.has(x));
}

function computePageMapFromBlocks(
  blocks: LightBlock[],
  layout = "a4",
): Record<string, number> {
  const maxH = LAYOUT_CONTENT_H[layout] ?? LAYOUT_CONTENT_H["a4"];
  const upl  = Math.floor((LAYOUT_CONTENT_W[layout] ?? LAYOUT_CONTENT_W["a4"]) / FONT_SIZE);
  const map: Record<string, number> = {};
  let page = 1, used = 0;

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i], prev = i > 0 ? blocks[i - 1] : null;
    if (b.sceneId && b.sceneId !== prev?.sceneId) {
      if (used > 0 && used + SCENE_HEADER_HEIGHT > maxH) { page++; used = 0; }
      used += SCENE_HEADER_HEIGHT;
    }
    const hideCharName = !!(
      prev && prev.type === "dialogue" && b.type === "dialogue" &&
      b.characterIds.length > 0 && prev.lyric !== b.lyric && sameChars(prev.characterIds, b.characterIds)
    );
    const charH = b.type === "dialogue" && b.characterIds.length > 0 && !hideCharName ? CHAR_NAME_HEIGHT : 0;
    // Strip markdown markers for line estimation
    const text = b.content.replace(/\*\*/g, "").replace(/__/g, "").replace(/\n/g, "\n");
    const h = charH + estimateLines(text, upl) * LINE_HEIGHT + 8;
    if (used > 0 && used + h > maxH) { page++; used = 0; }
    map[b.id] = page;
    used += h;
  }
  return map;
}

export async function getPageMapForProduction(
  productionId: string,
  layout = "a4",
): Promise<Record<string, number>> {
  const pool = getScriptEditorPool();
  const blocksRes = await pool.query<{
    id: string; type: string; content: string; scene_id: string | null;
  }>(
    `SELECT id, type, content, scene_id FROM script WHERE production_id = $1 ORDER BY sort_key`,
    [productionId],
  );
  if ((blocksRes.rowCount ?? 0) === 0) return {};
  const ids = blocksRes.rows.map(r => r.id);
  const charRes = await pool.query<{ script_id: string; character_id: string }>(
    `SELECT script_id, character_id FROM script_character WHERE script_id = ANY($1::text[]) ORDER BY script_id, position`,
    [ids],
  );
  const charMap = new Map<string, string[]>();
  for (const r of charRes.rows) {
    if (!charMap.has(r.script_id)) charMap.set(r.script_id, []);
    charMap.get(r.script_id)!.push(r.character_id);
  }
  const blocks: LightBlock[] = blocksRes.rows.map(r => ({
    id: r.id,
    type: r.type === "stage" ? "stage" : "dialogue",
    lyric: r.type === "lyric",
    content: r.content,
    sceneId: r.scene_id,
    characterIds: charMap.get(r.id) ?? [],
  }));
  return computePageMapFromBlocks(blocks, layout);
}

// ── Query helpers ─────────────────────────────────────────────────────────────

// CTE that assigns 1-based line numbers to all blocks in a production.
const lineNumCTE = `
  WITH ordered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY sort_key) AS line_num
    FROM script WHERE production_id = $1
  )
`;

async function attachCharacters(
  pool: ReturnType<typeof getScriptEditorPool>,
  rows: Omit<ScriptBlockRow, "characters">[],
): Promise<ScriptBlockRow[]> {
  if (rows.length === 0) return [];
  const ids = rows.map(r => r.id);
  const res = await pool.query<{ script_id: string; char_name: string }>(
    `SELECT sc.script_id, c.name AS char_name
     FROM script_character sc
     JOIN character c ON c.id = sc.character_id
     WHERE sc.script_id = ANY($1::text[])
     ORDER BY sc.script_id, sc.position`,
    [ids],
  );
  const charMap = new Map<string, string[]>();
  for (const r of res.rows) {
    if (!charMap.has(r.script_id)) charMap.set(r.script_id, []);
    charMap.get(r.script_id)!.push(r.char_name);
  }
  return rows.map(r => ({ ...r, characters: charMap.get(r.id) ?? [] }));
}

type RawBlockRow = {
  id: string; line_num: string; type: string; content: string;
  rehearsal_mark: string | null; scene_name: string | null; scene_number: string | null;
};

function toBlockRow(r: RawBlockRow): Omit<ScriptBlockRow, "characters"> {
  return {
    id:            r.id,
    lineNum:       parseInt(r.line_num, 10),
    pageNum:       null,
    type:          r.type as ScriptBlockRow["type"],
    content:       r.content,
    rehearsalMark: r.rehearsal_mark,
    sceneName:     r.scene_name,
    sceneNumber:   r.scene_number,
  };
}

const selectCols = `s.id, o.line_num, s.type, s.content, s.rehearsal_mark,
  sc.name AS scene_name, sc.number AS scene_number`;
const joinClause = `JOIN ordered o ON o.id = s.id LEFT JOIN scene sc ON sc.id = s.scene_id`;

export async function getBlockById(
  productionId: string,
  blockId:      string,
): Promise<ScriptBlockRow | null> {
  const pool = getScriptEditorPool();
  const res = await pool.query<RawBlockRow>(
    `${lineNumCTE}
     SELECT ${selectCols} FROM script s ${joinClause}
     WHERE s.production_id = $1 AND s.id = $3`,
    [productionId, productionId, blockId],
  );
  if (res.rowCount === 0) return null;
  const [row] = await attachCharacters(pool, res.rows.map(toBlockRow));
  return row;
}

export async function getBlockByLine(
  productionId: string,
  lineNum:      number,
): Promise<ScriptBlockRow | null> {
  const pool = getScriptEditorPool();
  const res = await pool.query<RawBlockRow>(
    `${lineNumCTE}
     SELECT ${selectCols} FROM script s ${joinClause}
     WHERE s.production_id = $1 AND o.line_num = $2`,
    [productionId, lineNum],
  );
  if (res.rowCount === 0) return null;
  const [row] = await attachCharacters(pool, res.rows.map(toBlockRow));
  return row;
}

export async function searchBlocks(
  productionId: string,
  query:        string,
  page:         number | null = null,
  limit         = 20,
): Promise<ScriptBlockRow[]> {
  const pool = getScriptEditorPool();
  const res = await pool.query<RawBlockRow>(
    `${lineNumCTE}
     SELECT ${selectCols} FROM script s ${joinClause}
     WHERE s.production_id = $1 AND s.content ILIKE $2
     ORDER BY o.line_num LIMIT $3`,
    [productionId, `%${query}%`, limit * (page ? 5 : 1)],
  );
  const rows = await attachCharacters(pool, res.rows.map(toBlockRow));

  if (page === null) return rows;

  // Filter by page: compute page map and attach page numbers
  const pageMap = await getPageMapForProduction(productionId);
  const withPage = rows.map(r => ({ ...r, pageNum: pageMap[r.id] ?? null }));
  return withPage.filter(r => r.pageNum === page).slice(0, limit);
}

export async function getBlockCount(productionId: string): Promise<number> {
  const pool = getScriptEditorPool();
  const res = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM script WHERE production_id = $1`,
    [productionId],
  );
  return parseInt(res.rows[0].count, 10);
}
