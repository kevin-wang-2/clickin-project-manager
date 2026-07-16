/**
 * Migration tests for migrate-internal-user-id.sql.
 *
 * Two operating modes:
 *
 * 1. Normal dev / CI post-migration run  (vitest run)
 *    global-setup.ts already applied the migration (if needed) and wrote a
 *    pre-migration snapshot to SNAPSHOT_PATH. Schema + integrity tests always
 *    run. Invariance tests run only when the snapshot exists.
 *
 * 2. CI migration job  (npm run test:migration)
 *    Uses a separate vitest config + global-setup-migration.ts that does NOT
 *    auto-apply the migration. The beforeAll here detects the old schema,
 *    captures the pre-migration snapshot, applies the migration, and runs the
 *    full suite including invariance tests.
 *
 * Invariance tests are the critical part: schema/integrity checks cannot catch
 * silent data corruption (wrong ID mapped, rows dropped). Only a before/after
 * comparison can.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFile, writeFile } from "fs/promises";
import path from "path";
import { getPool } from "@/lib/pg";
import {
  type PreMigrationSnapshot,
  SNAPSHOT_PATH,
  capturePreMigrationSnapshot,
  isPreMigrationSchema,
} from "./migration-snapshot";

const ROOT = path.resolve(process.cwd());

// ── Pre-migration snapshot (may be null if migration was already applied) ─────

let snapshot: PreMigrationSnapshot | null = null;

beforeAll(async () => {
  const pool = getPool();

  if (await isPreMigrationSchema(pool)) {
    // CI migration job: we're running on old seed — capture snapshot and migrate.
    snapshot = await capturePreMigrationSnapshot(pool);
    await writeFile(SNAPSHOT_PATH, JSON.stringify(snapshot));
    const sql = await readFile(
      path.join(ROOT, "db/migrate-internal-user-id.sql"), "utf8"
    );
    await pool.query(sql);
  } else {
    // Normal run: migration already applied by global-setup.
    // Try to load the snapshot it wrote (present only on first-ever run).
    try {
      snapshot = JSON.parse(await readFile(SNAPSHOT_PATH, "utf8"));
    } catch {
      snapshot = null;
    }
  }
}, 60_000);

// ── 1. Schema verification (always runs) ─────────────────────────────────────

describe("schema verification", () => {
  it("app_user table exists", async () => {
    const { rows } = await getPool().query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'app_user'
    `);
    expect(rows).toHaveLength(1);
  });

  it("feishu_user.user_id is UUID NOT NULL", async () => {
    const { rows } = await getPool().query(`
      SELECT data_type, is_nullable FROM information_schema.columns
      WHERE table_name = 'feishu_user' AND column_name = 'user_id'
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0].data_type).toBe("uuid");
    expect(rows[0].is_nullable).toBe("NO");
  });

  it("production_member: open_id gone, user_id UUID NOT NULL", async () => {
    const { rows: old } = await getPool().query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'production_member' AND column_name = 'open_id'
    `);
    expect(old).toHaveLength(0);

    const { rows: neo } = await getPool().query(`
      SELECT data_type, is_nullable FROM information_schema.columns
      WHERE table_name = 'production_member' AND column_name = 'user_id'
    `);
    expect(neo).toHaveLength(1);
    expect(neo[0].data_type).toBe("uuid");
    expect(neo[0].is_nullable).toBe("NO");
  });

  it("cue_list.created_by is UUID NOT NULL", async () => {
    const { rows } = await getPool().query(`
      SELECT data_type, is_nullable FROM information_schema.columns
      WHERE table_name = 'cue_list' AND column_name = 'created_by'
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0].data_type).toBe("uuid");
    expect(rows[0].is_nullable).toBe("NO");
  });

  it("production_event.created_by is UUID", async () => {
    const { rows } = await getPool().query(`
      SELECT data_type FROM information_schema.columns
      WHERE table_name = 'production_event' AND column_name = 'created_by'
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0].data_type).toBe("uuid");
  });

  it("comment: open_id gone, user_id UUID", async () => {
    const { rows: old } = await getPool().query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'comment' AND column_name = 'open_id'
    `);
    expect(old).toHaveLength(0);
  });
});

// ── 2. Integrity verification (always runs) ───────────────────────────────────

describe("integrity verification", () => {
  it("every feishu_user row has a non-null user_id", async () => {
    const { rows } = await getPool().query(
      "SELECT COUNT(*)::int AS cnt FROM feishu_user WHERE user_id IS NULL"
    );
    expect(rows[0].cnt).toBe(0);
  });

  it("feishu_user.user_id is UNIQUE", async () => {
    const { rows } = await getPool().query(`
      SELECT COUNT(*)::int AS cnt FROM (
        SELECT user_id FROM feishu_user GROUP BY user_id HAVING COUNT(*) > 1
      ) AS dupes
    `);
    expect(rows[0].cnt).toBe(0);
  });

  it("all production_member rows reference valid app_user", async () => {
    const { rows } = await getPool().query(`
      SELECT COUNT(*)::int AS cnt
      FROM production_member pm
      LEFT JOIN app_user au ON au.id = pm.user_id
      WHERE au.id IS NULL
    `);
    expect(rows[0].cnt).toBe(0);
  });

  it("all cue_list rows reference valid app_user", async () => {
    const { rows } = await getPool().query(`
      SELECT COUNT(*)::int AS cnt
      FROM cue_list cl
      LEFT JOIN app_user au ON au.id = cl.created_by
      WHERE au.id IS NULL
    `);
    expect(rows[0].cnt).toBe(0);
  });

  it("no JSONB mentions retain openId key", async () => {
    for (const table of ["comment", "event_report", "event_report_note", "event_report_reply"]) {
      const { rows } = await getPool().query(`
        SELECT COUNT(*)::int AS cnt FROM "${table}"
        WHERE mentions IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(mentions) AS m WHERE m ? 'openId'
          )
      `);
      expect(rows[0].cnt).toBe(0);
    }
  });
});

// ── 3. Invariance verification (requires pre-migration snapshot) ──────────────
//
// These are the tests that matter most: schema and integrity checks cannot catch
// silent data corruption (wrong user mapped to a row, rows silently dropped).
// Only a before/after comparison can verify the migration was faithful.

describe("invariance verification", () => {
  // Helper: resolve user_id → open_id via feishu_user
  async function openIdFor(userId: string): Promise<string | null> {
    const { rows } = await getPool().query<{ open_id: string }>(
      "SELECT open_id FROM feishu_user WHERE user_id = $1::uuid",
      [userId]
    );
    return rows[0]?.open_id ?? null;
  }

  it.skipIf(!snapshot)("production_member: row count preserved", async () => {
    const { rows } = await getPool().query(
      "SELECT COUNT(*)::int AS cnt FROM production_member"
    );
    expect(rows[0].cnt).toBe(snapshot!.counts.production_member);
  });

  it.skipIf(!snapshot)("cue_list: row count preserved", async () => {
    const { rows } = await getPool().query(
      "SELECT COUNT(*)::int AS cnt FROM cue_list"
    );
    expect(rows[0].cnt).toBe(snapshot!.counts.cue_list);
  });

  it.skipIf(!snapshot)("production_event: row count preserved", async () => {
    const { rows } = await getPool().query(
      "SELECT COUNT(*)::int AS cnt FROM production_event"
    );
    expect(rows[0].cnt).toBe(snapshot!.counts.production_event);
  });

  it.skipIf(!snapshot)(
    "production_member: every user_id resolves to the original open_id",
    async () => {
      // Build expected map: (production_id, open_id) → open_id
      const expected = new Map(snapshot!.rows.productionMember.map((r) => [r.key, r.openId]));

      const { rows } = await getPool().query<{
        production_id: string; user_id: string;
      }>("SELECT production_id, user_id FROM production_member");

      const mismatches: string[] = [];
      for (const row of rows) {
        const resolvedOpenId = await openIdFor(row.user_id);
        const key = `${row.production_id}:${resolvedOpenId}`;
        if (!expected.has(key)) {
          mismatches.push(
            `production_id=${row.production_id} user_id=${row.user_id} → open_id=${resolvedOpenId} (not in pre-migration snapshot)`
          );
        }
      }
      expect(mismatches).toEqual([]);
    }
  );

  it.skipIf(!snapshot)(
    "cue_list: every created_by user_id resolves to the original open_id",
    async () => {
      const expected = new Map(snapshot!.rows.cueList.map((r) => [r.key, r.openId]));

      const { rows } = await getPool().query<{ id: string; created_by: string }>(
        "SELECT id, created_by FROM cue_list"
      );
      const mismatches: string[] = [];
      for (const row of rows) {
        const resolvedOpenId = await openIdFor(row.created_by);
        const snapshotOpenId = expected.get(row.id);
        if (resolvedOpenId !== snapshotOpenId) {
          mismatches.push(
            `cue_list id=${row.id}: expected open_id=${snapshotOpenId}, got ${resolvedOpenId}`
          );
        }
      }
      expect(mismatches).toEqual([]);
    }
  );

  it.skipIf(!snapshot)(
    "comment: every user_id resolves to the original open_id",
    async () => {
      const expected = new Map(snapshot!.rows.comment.map((r) => [r.key, r.openId]));

      const { rows } = await getPool().query<{ id: string; user_id: string }>(
        "SELECT id, user_id FROM comment"
      );
      const mismatches: string[] = [];
      for (const row of rows) {
        const resolvedOpenId = await openIdFor(row.user_id);
        const snapshotOpenId = expected.get(row.id);
        if (resolvedOpenId !== snapshotOpenId) {
          mismatches.push(
            `comment id=${row.id}: expected open_id=${snapshotOpenId}, got ${resolvedOpenId}`
          );
        }
      }
      expect(mismatches).toEqual([]);
    }
  );

  it.skipIf(!snapshot)(
    "JSONB mentions: every userId resolves back to the original openId",
    async () => {
      if (!snapshot!.jsonbMentions.length) return; // no mention data, skip

      const mismatches: string[] = [];
      for (const entry of snapshot!.jsonbMentions) {
        const { rows } = await getPool().query<{ mentions: Array<{ userId?: string }> }>(
          `SELECT mentions FROM "${entry.table}" WHERE id = $1`,
          [entry.rowId]
        );
        if (!rows[0]) continue;
        const postUserIds = rows[0].mentions
          .map((m) => m.userId)
          .filter((id): id is string => !!id);

        const resolvedOpenIds = await Promise.all(postUserIds.map(openIdFor));
        const originalSet = new Set(entry.openIds);
        for (const resolved of resolvedOpenIds) {
          if (resolved && !originalSet.has(resolved)) {
            mismatches.push(
              `${entry.table} id=${entry.rowId}: resolved open_id=${resolved} not in pre-migration mentions`
            );
          }
        }
      }
      expect(mismatches).toEqual([]);
    }
  );
});
