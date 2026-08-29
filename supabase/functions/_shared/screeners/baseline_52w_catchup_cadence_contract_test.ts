// Static contract checks for the 52w overnight catch-up cron cadence.
// Reads migration SQL only.

import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { BASELINE_DATES_PER_INVOCATION } from "../markets/baseline-window.ts";

const CADENCE_MIGRATION_REL =
  "../../../migrations/20260829120200_screener_52w_baseline_catchup_cadence_v1.sql";

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

function acquireFunctionBody(sql: string): string {
  const start = sql.indexOf(
    "CREATE OR REPLACE FUNCTION public.try_acquire_screener_52w_baseline_run_lease_v1",
  );
  assert(start >= 0, "missing acquire function");
  const begin = sql.indexOf("AS $fn$", start);
  const end = sql.indexOf("$fn$;", begin + 1);
  assert(begin >= 0 && end > begin, "missing acquire body delimiters");
  return sql.slice(begin, end);
}

Deno.test("static: hour windows do not overlap; durable TTL lease guards successive invocations", async () => {
  const sql = await load();
  assert(sql.includes("*/5 22-23 * * 1-5"), "evening Mon-Fri 22-23 UTC");
  assert(sql.includes("*/5 0-5 * * 2-6"), "overnight Tue-Sat 00-05 UTC");
  assert(
    sql.includes("https://zcjptaolpumhtlwhlemq.supabase.co/functions/v1/sync-screener-52w-baselines"),
  );
  assert(sql.includes("vault.decrypted_secrets"));
  assert(sql.includes("sync_secret"));
  assertEquals(BASELINE_DATES_PER_INVOCATION, 4);
  assert(sql.includes("CREATE TABLE IF NOT EXISTS public.screener_52w_baseline_run_lease"));
  assert(sql.includes("try_acquire_screener_52w_baseline_run_lease_v1"));
  assert(sql.includes("release_screener_52w_baseline_run_lease_v1"));
  assert(sql.includes("AND holder_id = p_holder_id"));
  assert(sql.includes("LEAST(COALESCE(p_ttl_ms, 360000), 480000)"));
  const leaseIdx = sql.indexOf("try_acquire_screener_52w_baseline_run_lease_v1");
  const cronIdx = sql.indexOf("cron.schedule(\n    'sync-screener-52w-baselines-after-close'");
  assert(leaseIdx >= 0 && cronIdx > leaseIdx, "lease installs before cadence schedule");
});

Deno.test("static: lease acquire is a single INSERT ON CONFLICT statement", async () => {
  const sql = await load();
  const body = acquireFunctionBody(sql);
  assert(body.includes("INSERT INTO public.screener_52w_baseline_run_lease"));
  assert(body.includes("ON CONFLICT (lease_key)"));
  assert(body.includes("DO UPDATE"));
  assert(
    body.includes(
      "WHERE public.screener_52w_baseline_run_lease.holder_id = EXCLUDED.holder_id",
    ),
    "same holder may renew",
  );
  assert(
    body.includes(
      "OR public.screener_52w_baseline_run_lease.expires_at <= v_now",
    ),
    "expired lease may be taken over",
  );
  assert(body.includes("RETURNING public.screener_52w_baseline_run_lease.lease_key"));
  assert(body.includes("RETURN v_got IS NOT NULL"));
  assertFalse(
    body.includes("FOR UPDATE"),
    "absent-row SELECT FOR UPDATE + INSERT is racy",
  );
  assertFalse(
    body.includes("unique_violation"),
    "ON CONFLICT must absorb the empty-table race; no unique_violation path",
  );
  assertEquals(
    (body.match(/INSERT INTO public\.screener_52w_baseline_run_lease/g) ?? [])
      .length,
    1,
    "acquire must be one INSERT, not SELECT-then-INSERT",
  );
});
