/**
 * Vitest config for the standalone migration CI job.
 *
 * Run with: npm run test:migration
 *
 * Expected DB state: old schema (pre-migration). The test itself applies
 * the migration after capturing a pre-migration invariance snapshot.
 * After the tests pass, export and upload the new CI seed:
 *   npm run seed:schema
 *   npm run seed:ci-export -- "我们的星星" "供养2.0"
 */
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
  test: {
    globals: true,
    environment: "node",
    testTimeout: 60_000,
    globalSetup: "./tests/global-setup-migration.ts",
    include: ["tests/migration.test.ts"],
    fileParallelism: false,
  },
});
