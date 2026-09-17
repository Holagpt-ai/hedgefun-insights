// Static contract checks for set-based 52-week staged finalizer V1.
// Reads migration SQL only. Does not apply migrations.

import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const MIGRATION_REL =
  "../../../migrations/20260916010000_screener_52w_set_based_finalizer_v1.sql";
const CHUNKED_REL =
  "../../../migrations/20260915200000_screener_52w_baseline_chunked_publish_v1.sql";

const FINALIZE_RPC = "finalize_screener_52w_baseline_publish_v1";
const REPLACE_WITH_EXCLUSIONS_RPC =
  "replace_screener_52w_baseline_generation_with_exclusions_v1";
const REPLACE_RPC = "replace_screener_52w_baseline_generation_v1";

const SIGNATURE =
  "public.finalize_screener_52w_baseline_publish_v1(\n  p_generation_id uuid\n)";

async function load(rel: string): Promise<string> {
  const raw = await Deno.readTextFile(new URL(rel, import.meta.url));
  return raw.replaceAll("\r\n", "\n");
}

function functionBody(sql: string, rpcName: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${rpcName}`);
  assert(start >= 0, `missing CREATE OR REPLACE for ${rpcName}`);
  const begin = sql.indexOf("AS $fn$", start);
  const end = sql.indexOf("$fn$;", begin + 1);
  assert(begin >= 0 && end > begin, `missing body delimiters for ${rpcName}`);
  return sql.slice(begin, end);
}

Deno.test("static: set-based finalizer is the latest publish-finalize definition", async () => {
  const migrationsDir = new URL("../../../migrations/", import.meta.url);
  const defs: string[] = [];
  for await (const entry of Deno.readDir(migrationsDir)) {
    if (!entry.isFile || !entry.name.endsWith(".sql")) continue;
    const sql = await Deno.readTextFile(new URL(entry.name, migrationsDir));
    if (sql.includes(`CREATE OR REPLACE FUNCTION public.${FINALIZE_RPC}`)) {
      defs.push(entry.name);
    }
  }
  defs.sort();
  assertEquals(defs, [
    "20260915200000_screener_52w_baseline_chunked_publish_v1.sql",
    "20260916010000_screener_52w_set_based_finalizer_v1.sql",
    "20260917180000_screener_daily_volume_baseline_v1.sql",
  ]);
});

Deno.test("static: set-based finalizer preserves signature, grants, and search_path", async () => {
  const sql = await load(MIGRATION_REL);
  assert(sql.includes(`CREATE OR REPLACE FUNCTION ${SIGNATURE}`));
  assert(sql.includes("RETURNS integer"));
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${FINALIZE_RPC}`);
  const header = sql.slice(start, sql.indexOf("AS $fn$", start));
  assert(header.includes("SECURITY DEFINER"));
  assert(header.includes("SET search_path = ''"));
  assert(
    sql.includes(
      `GRANT EXECUTE ON FUNCTION public.${FINALIZE_RPC}(uuid)\n  TO service_role`,
    ),
  );
  assert(
    sql.includes(
      `REVOKE ALL ON FUNCTION public.${FINALIZE_RPC}(uuid)\n  FROM PUBLIC`,
    ),
  );
  assert(
    sql.includes(
      `REVOKE ALL ON FUNCTION public.${FINALIZE_RPC}(uuid)\n  FROM anon`,
    ),
  );
  assert(
    sql.includes(
      `REVOKE ALL ON FUNCTION public.${FINALIZE_RPC}(uuid)\n  FROM authenticated`,
    ),
  );
});

Deno.test("static: set-based finalizer does not reconstruct JSONB or call replace", async () => {
  const sql = await load(MIGRATION_REL);
  const body = functionBody(sql, FINALIZE_RPC);
  assertFalse(body.includes("jsonb_agg"));
  assertFalse(body.includes("jsonb_build_object"));
  assertFalse(body.includes("v_rows jsonb"));
  assertFalse(body.includes("v_exclusions jsonb"));
  assertFalse(body.includes(`public.${REPLACE_WITH_EXCLUSIONS_RPC}`));
  assertFalse(body.includes(`${REPLACE_WITH_EXCLUSIONS_RPC}(`));
  assertFalse(body.includes(`public.${REPLACE_RPC}(`));
  assertFalse(body.includes(`${REPLACE_RPC}(`));
});

Deno.test("static: historical chunked finalize still documents the JSONB path", async () => {
  const sql = await load(CHUNKED_REL);
  const body = functionBody(sql, FINALIZE_RPC);
  assert(body.includes("jsonb_agg"));
  assert(body.includes(`public.${REPLACE_WITH_EXCLUSIONS_RPC}(`));
});

Deno.test("static: set-based inserts publish from staging tables", async () => {
  const sql = await load(MIGRATION_REL);
  const body = functionBody(sql, FINALIZE_RPC);
  assert(body.includes("INSERT INTO public.screener_52w_baselines"));
  assert(body.includes("FROM public.screener_52w_baseline_publish_rows"));
  assert(body.includes("INSERT INTO public.screener_52w_baseline_exclusions"));
  assert(body.includes("FROM public.screener_52w_baseline_publish_exclusions"));
  assert(body.includes("updated_at"));
  assert(body.includes("v_job.provider_as_of"));
});

Deno.test("static: set-based finalize preserves validations and policy write", async () => {
  const sql = await load(MIGRATION_REL);
  const body = functionBody(sql, FINALIZE_RPC);
  assert(body.includes("generation_id required"));
  assert(body.includes("expected/actual baseline count mismatch"));
  assert(body.includes("expected/actual exclusion count mismatch"));
  assert(body.includes("exclusion symbol overlaps baseline"));
  assert(body.includes("invalid baseline session counts"));
  assert(body.includes("invalid exclusion session counts"));
  assert(body.includes("sessions_observed < v_job.min_sessions"));
  assert(body.includes("sessions_observed >= v_job.min_sessions"));
  assert(body.includes("'insufficient_sessions'"));
  assert(body.includes("generation metadata mismatch"));
  assert(body.includes("period_start IS DISTINCT FROM v_job.period_start"));
  assert(body.includes("period_end IS DISTINCT FROM v_job.period_end"));
  assert(body.includes("provider_as_of IS DISTINCT FROM v_job.provider_as_of"));
  assert(body.includes("invalid baseline row structure"));
  assert(body.includes("policy_min_sessions"));
  assert(body.includes("policy_excluded_count"));
  assert(body.includes("v_job.min_sessions"));
  assert(body.includes("high_candidates"));
  assert(body.includes("low_candidates"));
});

Deno.test("static: cleanup happens after insert and state flip", async () => {
  const sql = await load(MIGRATION_REL);
  const body = functionBody(sql, FINALIZE_RPC);
  const insertBaseAt = body.indexOf("INSERT INTO public.screener_52w_baselines");
  const insertExclAt = body.indexOf(
    "INSERT INTO public.screener_52w_baseline_exclusions",
  );
  const stateAt = body.indexOf("INSERT INTO public.screener_52w_baseline_state");
  const deleteOldBaseAt = body.indexOf(
    "DELETE FROM public.screener_52w_baselines\n  WHERE generation_id IS DISTINCT FROM p_generation_id",
  );
  const deleteOldExclAt = body.indexOf(
    "DELETE FROM public.screener_52w_baseline_exclusions\n  WHERE generation_id IS DISTINCT FROM p_generation_id",
  );
  const deleteStagedRowsAt = body.indexOf(
    "DELETE FROM public.screener_52w_baseline_publish_rows",
  );
  const deleteStagedExclAt = body.indexOf(
    "DELETE FROM public.screener_52w_baseline_publish_exclusions",
  );
  const deleteJobAt = body.indexOf(
    "DELETE FROM public.screener_52w_baseline_publish_job",
  );
  assert(insertBaseAt >= 0 && insertExclAt > insertBaseAt, "exclusions after baselines");
  assert(stateAt > insertExclAt, "state after inserts");
  assert(deleteOldBaseAt > stateAt, "old baselines after state pointer");
  assert(deleteOldExclAt > stateAt, "old exclusions after state pointer");
  assert(deleteStagedRowsAt > deleteOldBaseAt, "staging cleanup after old delete");
  assert(deleteStagedExclAt > deleteOldExclAt, "staged exclusions after old exclusions");
  assert(deleteJobAt > deleteStagedRowsAt, "job cleanup last");
  assert(body.includes("AND generation_id = p_generation_id"));
  assertFalse(
    body.includes(
      "DELETE FROM public.screener_52w_baseline_publish_job\n  WHERE job_key = 'current';",
    ),
  );
});

Deno.test("static: lost-response replay and wrong-generation are preserved", async () => {
  const sql = await load(MIGRATION_REL);
  const body = functionBody(sql, FINALIZE_RPC);
  assert(body.includes("Lost-response replay"));
  assert(body.includes("wrong generation"));
  assert(body.includes("policy_min_sessions IS NOT NULL"));
  assert(body.includes("policy_excluded_count IS NOT NULL"));
  assert(body.includes("status IN ('available', 'empty')"));
  assert(body.includes("RETURN v_state.symbol_count"));
  assert(body.includes("FOR UPDATE"));
  assertFalse(body.includes("COMMIT"));
  assertFalse(body.includes("status = 'failed'"));
  assert(body.includes("job stays status='staging'"));

  const replayAt = body.indexOf("Lost-response replay");
  const insertAt = body.indexOf("INSERT INTO public.screener_52w_baselines");
  const wrongAt = body.lastIndexOf("wrong generation");
  assert(replayAt >= 0 && replayAt < insertAt, "replay before publish");
  assert(wrongAt >= 0 && wrongAt < insertAt, "wrong-generation before publish");
});
