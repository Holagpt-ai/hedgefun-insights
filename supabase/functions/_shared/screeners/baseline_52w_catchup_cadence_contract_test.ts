// Static contract checks for the 52w overnight catch-up cron cadence.
// Reads migration SQL only.

import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { BASELINE_DATES_PER_INVOCATION } from "../markets/baseline-window.ts";

const CADENCE_MIGRATION_REL =
  "../../../migrations/20260829120100_screener_52w_baseline_catchup_cadence_v1.sql";

async function load(): Promise<string> {
  const raw = await Deno.readTextFile(new URL(CADENCE_MIGRATION_REL, import.meta.url));
  return raw.replaceAll("\r\n", "\n");
}

Deno.test("static: after-close and overnight jobs replace the 21:30-only cadence", async () => {
  const sql = await load();
  assert(sql.includes("cron.unschedule(v_job_id)"));
  assert(sql.includes("sync-screener-52w-baselines-after-close"));
  assert(sql.includes("sync-screener-52w-baselines-overnight"));
  assert(sql.includes("'%/functions/v1/sync-screener-52w-baselines%'"));
  assert(sql.includes("cron.schedule(\n    'sync-screener-52w-baselines-after-close'"));
  assert(sql.includes("cron.schedule(\n    'sync-screener-52w-baselines-overnight'"));
  assert(sql.includes("'*/5 22-23 * * 1-5'"));
  assert(sql.includes("'*/5 0-5 * * 2-6'"));
  assertFalse(sql.includes("30 21 * *"), "must not keep 21:30-only weekday cadence");
});

Deno.test("static: catch-up window is after close, spans midnight, and does not overlap", async () => {
  const sql = await load();
  assert(sql.includes("*/5 22-23 * * 1-5"), "evening Mon-Fri 22-23 UTC");
  assert(sql.includes("*/5 0-5 * * 2-6"), "overnight Tue-Sat 00-05 UTC");
  assert(
    sql.includes("https://zcjptaolpumhtlwhlemq.supabase.co/functions/v1/sync-screener-52w-baselines"),
  );
  assert(sql.includes("vault.decrypted_secrets"));
  assert(sql.includes("sync_secret"));
  assertEquals(BASELINE_DATES_PER_INVOCATION, 4);
});
