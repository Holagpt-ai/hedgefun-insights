#!/usr/bin/env node
/**
 * Bootstrap disposable Postgres for Batch 190 integration tests.
 *
 * Usage:
 *   SCREENER_SYNC_PG_TEST_URL=postgresql://postgres:pass@127.0.0.1:5432/postgres \
 *     node scripts/supabase/screener-sync-pg-test-setup.mjs
 *
 * Never point at Lovable production or shared databases.
 */

import { join } from "node:path";
import { spawnSync } from "node:child_process";

const url = process.env.SCREENER_SYNC_PG_TEST_URL;
if (!url) {
  console.error("Set SCREENER_SYNC_PG_TEST_URL to a disposable database.");
  process.exit(1);
}
if (/lovable|supabase\.co|zcjptaolpumhtlwhlemq/i.test(url)) {
  console.error("Refusing to run against production-like host.");
  process.exit(1);
}

const cwd = process.cwd();
const migrationsDir = join(cwd, "supabase", "migrations");
const bootstrap = join(cwd, "supabase", "tests", "screener-sync-pg", "00-bootstrap.sql");

/** Publication RPC deps + Batch 190 migrations (exact order). */
const MIGRATION_CHAIN = [
  "20260914200000_screener_tab_evaluation_evidence_v1.sql",
  "20260917180200_screener_rvol20d_results_rpc_v1.sql",
  "20261028200000_screener_sync_generation_staging_v1.sql",
  "20261028210000_screener_sync_staging_rpc_v1.sql",
  "20261028220000_screener_sync_staging_hardening_v1.sql",
  "20261028230000_screener_sync_staging_recovery_v1.sql",
  "20261030183000_screener_sync_staging_advance_acl_v1.sql",
];

function runSql(label, filePath) {
  const psql = spawnSync(
    "psql",
    [url, "-v", "ON_ERROR_STOP=1", "-f", filePath],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  if (psql.status !== 0) {
    console.error(`Failed on ${label}:\n${psql.stderr || psql.stdout}`);
    process.exit(psql.status ?? 1);
  }
  process.stdout.write(".");
}

console.log("Screener sync PG test bootstrap…");
runSql("00-bootstrap", bootstrap);
for (const file of MIGRATION_CHAIN) {
  runSql(file, join(migrationsDir, file));
}
console.log("\nBootstrap complete.");
