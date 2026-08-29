// Static contract checks for the 52w run lease and overnight catch-up cadence.
// Reads migration SQL only.

import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { BASELINE_DATES_PER_INVOCATION } from "../markets/baseline-window.ts";

const LEASE_MIGRATION_NAME =
  "20260829120200_screener_52w_baseline_run_lease_v1.sql";
const CADENCE_MIGRATION_NAME =
  "20260829120300_screener_52w_baseline_catchup_cadence_v1.sql";
const APPLY_MIGRATION_NAME =
  "20260829120000_screener_52w_baseline_apply_day_set_based_v1.sql";
const RETENTION_MIGRATION_NAME =
  "20260829120100_cron_job_run_details_14d_retention_v1.sql";

const LEASE_MIGRATION_REL = `../../../migrations/${LEASE_MIGRATION_NAME}`;
const CADENCE_MIGRATION_REL = `../../../migrations/${CADENCE_MIGRATION_NAME}`;

async function loadRel(rel: string): Promise<string> {
  const raw = await Deno.readTextFile(new URL(rel, import.meta.url));
  return raw.replaceAll("\r\n", "\n");
}

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

Deno.test("static: PR #18 activation order is apply, retention, lease, then cadence", () => {
  const names = [
    APPLY_MIGRATION_NAME,
    RETENTION_MIGRATION_NAME,
    LEASE_MIGRATION_NAME,
    CADENCE_MIGRATION_NAME,
  ];
  const sorted = [...names].sort();
  assertEquals(sorted, names);
  assertEquals(LEASE_MIGRATION_NAME < CADENCE_MIGRATION_NAME, true);
});

Deno.test("static: lease install does not activate catch-up cadence", async () => {
  const sql = await loadRel(LEASE_MIGRATION_REL);
  assert(sql.includes("CREATE TABLE IF NOT EXISTS public.screener_52w_baseline_run_lease"));
  assert(sql.includes("try_acquire_screener_52w_baseline_run_lease_v1"));
  assert(sql.includes("release_screener_52w_baseline_run_lease_v1"));
  assert(sql.includes("AND holder_id = p_holder_id"));
  assert(sql.includes("LEAST(COALESCE(p_ttl_ms, 360000), 480000)"));
  assertFalse(sql.includes("cron.schedule"), "lease install must not schedule cron");
  assertFalse(sql.includes("cron.unschedule"), "lease install must not unschedule cron");
  assertFalse(sql.includes("sync-screener-52w-baselines-after-close"));
  assertFalse(sql.includes("sync-screener-52w-baselines-overnight"));
});

Deno.test("static: lease acquire is a single INSERT ON CONFLICT statement", async () => {
  const sql = await loadRel(LEASE_MIGRATION_REL);
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

Deno.test("static: after-close and overnight jobs replace the 21:30-only cadence", async () => {
  const sql = await loadRel(CADENCE_MIGRATION_REL);
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

Deno.test("static: hour windows do not overlap; 4 dates per 5-minute invocation", async () => {
  const sql = await loadRel(CADENCE_MIGRATION_REL);
  assert(sql.includes("*/5 22-23 * * 1-5"), "evening Mon-Fri 22-23 UTC");
  assert(sql.includes("*/5 0-5 * * 2-6"), "overnight Tue-Sat 00-05 UTC");
  assert(
    sql.includes("https://zcjptaolpumhtlwhlemq.supabase.co/functions/v1/sync-screener-52w-baselines"),
  );
  assert(sql.includes("vault.decrypted_secrets"));
  assert(sql.includes("sync_secret"));
  assertEquals(BASELINE_DATES_PER_INVOCATION, 4);
});

Deno.test("static: cadence activation contains no lease schema or RPC creation", async () => {
  const sql = await loadRel(CADENCE_MIGRATION_REL);
  assertFalse(sql.includes("CREATE TABLE IF NOT EXISTS public.screener_52w_baseline_run_lease"));
  assertFalse(sql.includes("CREATE TABLE public.screener_52w_baseline_run_lease"));
  assertFalse(
    sql.includes(
      "CREATE OR REPLACE FUNCTION public.try_acquire_screener_52w_baseline_run_lease_v1",
    ),
  );
  assertFalse(
    sql.includes(
      "CREATE OR REPLACE FUNCTION public.release_screener_52w_baseline_run_lease_v1",
    ),
  );
});
