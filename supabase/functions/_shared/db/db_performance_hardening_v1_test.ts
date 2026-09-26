import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const REQUIRED_INDEXES = [
  "daily_briefs_type_date_uidx",
  "catalyst_events_verified_event_date_idx",
  "catalyst_events_symbol_verified_published_idx",
  "earnings_calendar_symbol_report_date_idx",
  "earnings_calendar_report_date_idx",
  "screener_results_tab_id_volume_idx",
  "radar_v22_closed_snapshot_date_kind_volume_idx",
  "radar_v22_events_symbol_event_at_idx",
  "radar_v22_events_trading_session_event_at_idx",
  "late_session_handoffs_window_source_ts_idx",
  "late_session_handoffs_valid_through_idx",
];

const migrationUrl = new URL(
  "../../../migrations/20260926200000_db_performance_hardening_v1.sql",
  import.meta.url,
);

Deno.test("DB performance migration defines expected hot-path indexes", async () => {
  const migration = await Deno.readTextFile(migrationUrl);
  for (const name of REQUIRED_INDEXES) {
    assertEquals(migration.includes(name), true, `missing index ${name}`);
  }
  assertEquals(migration.includes("CREATE OR REPLACE FUNCTION"), false);
  assertEquals(migration.includes("DROP TABLE"), false);
});
