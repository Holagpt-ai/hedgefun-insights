#!/usr/bin/env node
/**
 * Apply Radar V22 migrations needed for replace_radar_v22_candidates_v1 integration tests.
 * Uses the same disposable URL as screener sync tests (SCREENER_SYNC_PG_TEST_URL).
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

const migrationsDir = join(process.cwd(), "supabase", "migrations");

const RADAR_V22_MIGRATION_CHAIN = [
  "20260901150000_radar_v22_persistence_v2.sql",
  "20260923160000_radar_v22_momentum_metrics.sql",
  "20260923180000_radar_v22_scanner_events.sql",
  "20260923190000_radar_v22_scanner_events_rpc_fix.sql",
  "20260923210000_radar_v22_market_feed_telemetry_v1.sql",
  "20260924181500_radar_v22_feed_session_date_v1.sql",
  "20260925180000_radar_v22_previous_session_facts_v1.sql",
  "20260926011500_radar_v22_closed_session_snapshot_v1.sql",
  "20260926130200_scanner_intelligence_stack_replace_rpc_v1.sql",
  "20261013170000_radar_carryover_watch_v1.sql",
  "20261015143000_radar_v22_replace_rpc_set_based_events_v1.sql",
  "20261020143000_radar_v22_replace_rpc_statement_timeout_v1.sql",
  "20261110193000_radar_v22_cross_date_candidate_delete_v1.sql",
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

console.log("Radar V22 PG test bootstrap…");
for (const file of RADAR_V22_MIGRATION_CHAIN) {
  runSql(file, join(migrationsDir, file));
}
console.log("\nRadar V22 bootstrap complete.");
