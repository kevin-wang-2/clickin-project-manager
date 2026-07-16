/**
 * Global setup for the standalone migration test CI job (npm run test:migration).
 *
 * Unlike the standard global-setup.ts, this setup does NOT auto-apply the
 * migration — migration.test.ts detects the old schema and applies it itself,
 * which is required for invariance testing (capture before → migrate → verify after).
 *
 * Expected CI environment:
 *   - DB loaded with the OLD seed (pre-migration schema, ci-pre-migration.sql)
 *   - After test:migration passes, the new CI seed is exported and uploaded
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { getPool } from "@/lib/pg";

export async function setup() {
  // Verify the DB is reachable
  await getPool().query("SELECT 1");
}

export async function teardown() {
  await getPool().end();
}
