import { config } from "dotenv";
config({ path: ".env.local" });

import { readFile } from "fs/promises";
import path from "path";
import { getPool } from "@/lib/pg";

// Fixed UUID for the test user — must match TEST_USER in helpers.ts
const TEST_USER = "00000000-0000-0000-0000-000000000001";

export async function setup() {
  const pool = getPool();

  // Apply the internal-user-id migration if it hasn't been run yet.
  // We check for the presence of app_user — if absent, the migration is needed.
  const { rows: tableCheck } = await pool.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'app_user'
  `);
  if (tableCheck.length === 0) {
    const migrationSql = await readFile(
      path.resolve(process.cwd(), "db/migrate-internal-user-id.sql"),
      "utf8"
    );
    await pool.query(migrationSql);
  }

  // app_user must exist before feishu_user (FK: feishu_user.user_id → app_user.id)
  await pool.query(
    `INSERT INTO app_user (id, created_at) VALUES ($1, NOW()) ON CONFLICT DO NOTHING`,
    [TEST_USER]
  );
  await pool.query(
    `INSERT INTO feishu_user (open_id, user_id, name, is_super_admin, created_at, updated_at)
     VALUES ('test-sys-feishu', $1, '测试系统用户', FALSE, NOW(), NOW())
     ON CONFLICT DO NOTHING`,
    [TEST_USER]
  );
}

export async function teardown() {
  const pool = getPool();
  // Explicit deletes for tables with RESTRICT FK to app_user (no ON DELETE CASCADE).
  // Tests may create cue_lists and production_events with TEST_USER as creator.
  await pool.query("DELETE FROM cue_list WHERE created_by = $1", [TEST_USER]);
  await pool.query("DELETE FROM production_event WHERE created_by = $1", [TEST_USER]);
  // Deleting app_user cascades to feishu_user, production_member, comment, etc.
  await pool.query("DELETE FROM app_user WHERE id = $1", [TEST_USER]);
  await pool.end();
}
