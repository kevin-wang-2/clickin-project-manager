/**
 * Pre-migration snapshot utilities for invariance testing.
 *
 * Captures the state of all open_id FK columns before migrate-internal-user-id.sql
 * runs. After migration, the snapshot lets us verify that every row's new user_id
 * resolves through feishu_user back to the original open_id — the core invariance
 * property that schema/integrity tests alone cannot catch.
 */
import os from "os";
import path from "path";
import type { Pool } from "pg";

/** Path where global-setup writes the snapshot before applying migration. */
export const SNAPSHOT_PATH = path.join(
  os.tmpdir(),
  "migration-invariance-snapshot.json"
);

// ─── Types ────────────────────────────────────────────────────────────────────

/** One (composite-key, open_id) pair sampled from a pre-migration table. */
export type FkRow = { key: string; openId: string };

export type PreMigrationSnapshot = {
  /** Row counts for every migrated table — verifies no rows were dropped. */
  counts: Record<string, number>;
  /**
   * Sampled open_id FK rows per table.
   * After migration: join via user_id → feishu_user.open_id must equal openId.
   */
  rows: {
    productionMember:    FkRow[];  // key = "productionId:openId"
    cueList:             FkRow[];  // key = id
    productionEvent:     FkRow[];  // key = id
    comment:             FkRow[];  // key = id
    eventReport:         FkRow[];  // key = id
    eventReportNote:     FkRow[];  // key = id
    asset:               FkRow[];  // key = id
    assetMount:          FkRow[];  // key = id
  };
  /** JSONB invariance: list of (table, rowId, openIds[]) before migration. */
  jsonbMentions: Array<{ table: string; rowId: string; openIds: string[] }>;
};

// ─── Helper ───────────────────────────────────────────────────────────────────

function asKey(...parts: string[]) { return parts.join(":"); }

// ─── Capture ──────────────────────────────────────────────────────────────────

/**
 * Queries pre-migration tables and returns a snapshot.
 * Must be called BEFORE migrate-internal-user-id.sql runs.
 */
export async function capturePreMigrationSnapshot(pool: Pool): Promise<PreMigrationSnapshot> {
  // Fetch all rows — real datasets are small enough; this avoids sampling bias.
  const [pm, cl, pe, co, er, ern, as_, am] = await Promise.all([
    pool.query<{ production_id: string; open_id: string }>(
      "SELECT production_id, open_id FROM production_member"
    ),
    pool.query<{ id: string; created_by: string }>(
      "SELECT id, created_by FROM cue_list"
    ),
    pool.query<{ id: string; created_by: string }>(
      "SELECT id, created_by FROM production_event"
    ),
    pool.query<{ id: string; open_id: string }>(
      "SELECT id, open_id FROM comment"
    ),
    pool.query<{ id: string; created_by: string }>(
      "SELECT id, created_by FROM event_report"
    ),
    pool.query<{ id: string; author_open_id: string }>(
      "SELECT id, author_open_id FROM event_report_note"
    ),
    pool.query<{ id: string; uploader_open_id: string }>(
      "SELECT id, uploader_open_id FROM asset"
    ),
    pool.query<{ id: string; created_by: string }>(
      "SELECT id, created_by FROM asset_mount"
    ),
  ]);

  // JSONB mentions: tables that have a mentions JSONB column with { openId } objects
  const mentionTables = ["comment", "event_report", "event_report_note", "event_report_reply"];
  const jsonbMentions: PreMigrationSnapshot["jsonbMentions"] = [];
  for (const table of mentionTables) {
    const { rows } = await pool.query<{ id: string; mentions: Array<{ openId?: string }> }>(`
      SELECT id, mentions FROM "${table}"
      WHERE mentions IS NOT NULL AND jsonb_array_length(mentions) > 0
    `);
    for (const row of rows) {
      const openIds = row.mentions
        .map((m) => m.openId)
        .filter((id): id is string => !!id);
      if (openIds.length > 0) {
        jsonbMentions.push({ table, rowId: row.id, openIds });
      }
    }
  }

  return {
    counts: {
      production_member:            pm.rowCount ?? 0,
      cue_list:                     cl.rowCount ?? 0,
      production_event:             pe.rowCount ?? 0,
      comment:                      co.rowCount ?? 0,
      event_report:                 er.rowCount ?? 0,
      event_report_note:            ern.rowCount ?? 0,
      asset:                        as_.rowCount ?? 0,
      asset_mount:                  am.rowCount ?? 0,
    },
    rows: {
      productionMember: pm.rows.map((r) => ({
        key: asKey(r.production_id, r.open_id), openId: r.open_id,
      })),
      cueList:          cl.rows.map((r) => ({ key: r.id, openId: r.created_by })),
      productionEvent:  pe.rows.map((r) => ({ key: r.id, openId: r.created_by })),
      comment:          co.rows.map((r) => ({ key: r.id, openId: r.open_id })),
      eventReport:      er.rows.map((r) => ({ key: r.id, openId: r.created_by })),
      eventReportNote:  ern.rows.map((r) => ({ key: r.id, openId: r.author_open_id })),
      asset:            as_.rows.map((r) => ({ key: r.id, openId: r.uploader_open_id })),
      assetMount:       am.rows.map((r) => ({ key: r.id, openId: r.created_by })),
    },
    jsonbMentions,
  };
}

/** Returns true if the DB still has the pre-migration schema (open_id column on production_member). */
export async function isPreMigrationSchema(pool: Pool): Promise<boolean> {
  const { rows } = await pool.query(`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'production_member' AND column_name = 'open_id'
  `);
  return rows.length > 0;
}
