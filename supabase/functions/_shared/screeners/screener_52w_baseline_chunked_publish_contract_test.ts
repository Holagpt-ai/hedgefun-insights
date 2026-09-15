// Static contract checks for chunked 52-week baseline publication V1.
// Reads migration SQL only. Does not apply migrations.

import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const MIGRATION_REL =
  "../../../migrations/20260915200000_screener_52w_baseline_chunked_publish_v1.sql";
const ELIGIBILITY_REL =
  "../../../migrations/20260915180000_screener_prerequisite_eligibility_v1.sql";

const START_RPC = "start_screener_52w_baseline_publish_v1";
const APPEND_ROWS_RPC = "append_screener_52w_baseline_rows_v1";
const APPEND_EXCL_RPC = "append_screener_52w_baseline_exclusions_v1";
const FINALIZE_RPC = "finalize_screener_52w_baseline_publish_v1";
const REPLACE_WITH_EXCLUSIONS_RPC =
  "replace_screener_52w_baseline_generation_with_exclusions_v1";

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

Deno.test("static: chunked publish migration does not redefine exclusion-aware replace", async () => {
  const sql = await load(MIGRATION_REL);
  assertFalse(
    sql.includes(
      `CREATE OR REPLACE FUNCTION public.${REPLACE_WITH_EXCLUSIONS_RPC}`,
    ),
  );
  const eligibility = await load(ELIGIBILITY_REL);
  assert(
    eligibility.includes(
      `CREATE OR REPLACE FUNCTION public.${REPLACE_WITH_EXCLUSIONS_RPC}(`,
    ),
  );
});

Deno.test("static: staging tables preserve full BaselineRow and exclusion contracts", async () => {
  const sql = await load(MIGRATION_REL);
  assert(sql.includes("CREATE TABLE IF NOT EXISTS public.screener_52w_baseline_publish_job"));
  assert(sql.includes("CREATE TABLE IF NOT EXISTS public.screener_52w_baseline_publish_rows"));
  assert(sql.includes("CREATE TABLE IF NOT EXISTS public.screener_52w_baseline_publish_exclusions"));
  assert(sql.includes("expected_baseline_count integer NOT NULL"));
  assert(sql.includes("expected_exclusion_count integer NOT NULL"));
  assert(sql.includes("CHECK (status IN ('staging'))"));
  assertFalse(sql.includes("CHECK (status IN ('staging', 'failed'))"));
  assert(sql.includes("high_candidates jsonb NOT NULL"));
  assert(sql.includes("low_candidates jsonb NOT NULL"));
  assert(sql.includes("jsonb_array_length(high_candidates) >= 1"));
  assert(sql.includes("jsonb_array_length(low_candidates) >= 1"));
  assert(sql.includes("PRIMARY KEY (generation_id, symbol)"));
  assert(sql.includes("reason IN ('insufficient_sessions')"));
});

Deno.test("static: staging tables are RLS + service_role only", async () => {
  const sql = await load(MIGRATION_REL);
  for (const table of [
    "screener_52w_baseline_publish_job",
    "screener_52w_baseline_publish_rows",
    "screener_52w_baseline_publish_exclusions",
  ]) {
    assert(sql.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`));
    assert(sql.includes(`REVOKE ALL ON TABLE public.${table} FROM PUBLIC`));
    assert(sql.includes(`REVOKE ALL ON TABLE public.${table} FROM anon`));
    assert(sql.includes(`REVOKE ALL ON TABLE public.${table} FROM authenticated`));
    assert(sql.includes(`GRANT ALL ON TABLE public.${table} TO service_role`));
  }
});

Deno.test("static: staged RPCs are SECURITY DEFINER, empty search_path, service_role execute", async () => {
  const sql = await load(MIGRATION_REL);
  for (const rpc of [START_RPC, APPEND_ROWS_RPC, APPEND_EXCL_RPC, FINALIZE_RPC]) {
    const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${rpc}`);
    assert(start >= 0, `missing ${rpc}`);
    const header = sql.slice(start, sql.indexOf("AS $fn$", start));
    assert(header.includes("SECURITY DEFINER"));
    assert(header.includes("SET search_path = ''"));
    assert(sql.includes(`GRANT EXECUTE ON FUNCTION public.${rpc}`));
    assert(sql.includes(`REVOKE ALL ON FUNCTION public.${rpc}`));
    assert(sql.includes(`FROM PUBLIC`));
  }
});

Deno.test("static: finalize reconstructs payloads and delegates to exclusion-aware replace", async () => {
  const sql = await load(MIGRATION_REL);
  const body = functionBody(sql, FINALIZE_RPC);
  assertFalse(body.includes("COMMIT"));
  assert(body.includes("wrong generation"));
  assert(body.includes("expected/actual baseline count mismatch"));
  assert(body.includes("expected/actual exclusion count mismatch"));
  assert(body.includes("exclusion symbol overlaps baseline"));
  assert(body.includes("invalid baseline session counts"));
  assert(body.includes("invalid exclusion session counts"));
  assert(body.includes("sessions_observed < v_job.min_sessions"));
  assert(body.includes("sessions_observed >= v_job.min_sessions"));
  assert(body.includes("'insufficient_sessions'"));
  assert(body.includes("high_candidates"));
  assert(body.includes("low_candidates"));
  assert(body.includes(`public.${REPLACE_WITH_EXCLUSIONS_RPC}(`));
  assertFalse(body.includes("replace_screener_52w_baseline_generation_v1("));

  const replaceAt = body.indexOf(`public.${REPLACE_WITH_EXCLUSIONS_RPC}(`);
  const deleteRowsAt = body.indexOf(
    "DELETE FROM public.screener_52w_baseline_publish_rows",
  );
  const deleteJobAt = body.indexOf(
    "DELETE FROM public.screener_52w_baseline_publish_job",
  );
  assert(replaceAt >= 0 && deleteRowsAt > replaceAt, "cleanup after replace");
  assert(deleteJobAt > replaceAt, "job cleanup after replace");
  assertFalse(body.includes("status = 'failed'"));
  assert(body.includes("job stays status='staging'"));
  assert(body.includes("Lost-response replay"));
  assert(body.includes("policy_min_sessions IS NOT NULL"));
  assert(body.includes("policy_excluded_count IS NOT NULL"));
  assert(body.includes("status IN ('available', 'empty')"));
  assert(body.includes("RETURN v_state.symbol_count"));
  const replayAt = body.indexOf("Lost-response replay");
  assert(replayAt >= 0 && replayAt < replaceAt, "replay check before replace");
  assertFalse(body.includes("DELETE FROM public.screener_52w_baseline_publish_job\n  WHERE job_key = 'current';"));
});

Deno.test("static: append RPCs reject conflicting retries and accept identical ones", async () => {
  const sql = await load(MIGRATION_REL);
  const rows = functionBody(sql, APPEND_ROWS_RPC);
  const excl = functionBody(sql, APPEND_EXCL_RPC);
  assert(rows.includes("wrong generation"));
  assert(excl.includes("wrong generation"));
  assert(rows.includes("ON CONFLICT (generation_id, symbol) DO NOTHING"));
  assert(excl.includes("ON CONFLICT (generation_id, symbol) DO NOTHING"));
  assertFalse(rows.includes("ON CONFLICT (generation_id, symbol) DO UPDATE"));
  assertFalse(excl.includes("ON CONFLICT (generation_id, symbol) DO UPDATE"));
  assert(rows.includes("conflicting staged baseline row"));
  assert(excl.includes("conflicting staged exclusion"));
  assert(rows.includes("high_candidates IS DISTINCT FROM"));
  assert(rows.includes("low_candidates IS DISTINCT FROM"));
  assert(excl.includes("sessions_observed IS DISTINCT FROM"));
  assert(rows.includes("row chunk exceeds limit"));
  assert(excl.includes("exclusion chunk exceeds limit"));
});
