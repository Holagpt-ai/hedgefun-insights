// Static contract checks for bounded 14-day cron.job_run_details retention.
// Reads migration SQL only.

import {
  assert,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const RETENTION_MIGRATION_REL =
  "../../../migrations/20260829120200_cron_job_run_details_14d_retention_v1.sql";

async function load(): Promise<string> {
  const raw = await Deno.readTextFile(
    new URL(RETENTION_MIGRATION_REL, import.meta.url),
  );
  return raw.replaceAll("\r\n", "\n");
}

function functionBody(sql: string): string {
  const start = sql.indexOf(
    "CREATE OR REPLACE FUNCTION public.prune_cron_job_run_details_v1()",
  );
  assert(start >= 0, "missing prune function");
  const begin = sql.indexOf("AS $fn$", start);
  const end = sql.indexOf("$fn$;", begin + 1);
  assert(begin >= 0 && end > begin, "missing function body");
  return sql.slice(begin, end);
}

Deno.test("static: prune is bounded, completed-only, oldest-first, and idempotent", async () => {
  const sql = await load();
  const body = functionBody(sql);
  assert(sql.includes("SECURITY DEFINER"));
  assert(sql.includes("SET search_path = ''"));
  assert(body.includes("interval '14 days'"));
  assert(body.includes("LIMIT 5000"));
  assert(body.includes("ORDER BY d.runid"));
  assert(body.includes("d.status IN ('succeeded', 'failed')"));
  assert(body.includes("d.end_time IS NOT NULL"));
  assert(body.includes("d.end_time < v_cutoff"));
  assert(body.includes("pg_try_advisory_xact_lock"));
  assertFalse(body.includes("TRUNCATE"));
  assertFalse(body.includes("VACUUM FULL"));
  assertFalse(/DELETE FROM cron\.job_run_details\s*;/.test(body));
  assert(
    sql.includes("REVOKE ALL ON FUNCTION public.prune_cron_job_run_details_v1()"),
  );
  assert(sql.includes("FROM PUBLIC"));
  assert(sql.includes("FROM anon"));
  assert(sql.includes("FROM authenticated"));
});

Deno.test("static: privilege blocker is explicit and cadence gradually drains", async () => {
  const sql = await load();
  assert(sql.includes("has_table_privilege('cron.job_run_details', 'SELECT')"));
  assert(sql.includes("has_table_privilege('cron.job_run_details', 'DELETE')"));
  assert(sql.includes("without inventing grants"));
  assert(sql.includes("'prune-cron-job-run-details-14d'"));
  assert(sql.includes("'*/15 * * * *'"));
  assert(sql.includes("VACUUM (ANALYZE) cron.job_run_details"));
  assertFalse(sql.includes("GRANT EXECUTE ON FUNCTION public.prune_cron_job_run_details_v1()"));
});
