// Static contract checks for prerequisite-eligibility V1:
// exclusion table, state integrity columns, replace fail-closed reset,
// and finalizer persist/cleanup order. Reads migration SQL only.

import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const MIGRATION_REL =
  "../../../migrations/20260915180000_screener_prerequisite_eligibility_v1.sql";
const REPLACE_RPC = "replace_screener_52w_baseline_generation_v1";
const REPLACE_WITH_EXCLUSIONS_RPC =
  "replace_screener_52w_baseline_generation_with_exclusions_v1";
const FINALIZE_RPC = "finalize_screener_52w_baseline_job_v1";

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

Deno.test("static: eligibility migration is the latest replace and finalize definition", async () => {
  const migrationsDir = new URL("../../../migrations/", import.meta.url);
  const replaceDefs: string[] = [];
  const replaceWithExclusionsDefs: string[] = [];
  const finalizeDefs: string[] = [];
  for await (const entry of Deno.readDir(migrationsDir)) {
    if (!entry.isFile || !entry.name.endsWith(".sql")) continue;
    const sql = await Deno.readTextFile(new URL(entry.name, migrationsDir));
    if (sql.includes(`CREATE OR REPLACE FUNCTION public.${REPLACE_RPC}(`)) {
      replaceDefs.push(entry.name);
    }
    if (
      sql.includes(
        `CREATE OR REPLACE FUNCTION public.${REPLACE_WITH_EXCLUSIONS_RPC}(`,
      )
    ) {
      replaceWithExclusionsDefs.push(entry.name);
    }
    if (sql.includes(`CREATE OR REPLACE FUNCTION public.${FINALIZE_RPC}`)) {
      finalizeDefs.push(entry.name);
    }
  }
  replaceDefs.sort();
  replaceWithExclusionsDefs.sort();
  finalizeDefs.sort();
  assertEquals(replaceDefs[replaceDefs.length - 1], "20260915180000_screener_prerequisite_eligibility_v1.sql");
  assertEquals(replaceWithExclusionsDefs, [
    "20260915180000_screener_prerequisite_eligibility_v1.sql",
  ]);
  assertEquals(finalizeDefs, [
    "20260814180000_screener_52w_baseline_job.sql",
    "20260915180000_screener_prerequisite_eligibility_v1.sql",
  ]);
});

Deno.test("static: exclusions table contract, constraints, and service-role-only grants", async () => {
  const sql = await load(MIGRATION_REL);
  assert(sql.includes("CREATE TABLE IF NOT EXISTS public.screener_52w_baseline_exclusions"));
  assert(sql.includes("PRIMARY KEY (generation_id, symbol)"));
  assert(sql.includes("sessions_observed >= 1"));
  assert(sql.includes("min_sessions >= 1"));
  assert(sql.includes("sessions_observed < min_sessions"));
  assert(sql.includes("reason IN ('insufficient_sessions')"));
  assert(sql.includes("symbol ~ '^[A-Z][A-Z0-9.\\-]*$'"));
  assert(sql.includes("ALTER TABLE public.screener_52w_baseline_exclusions ENABLE ROW LEVEL SECURITY"));
  assert(sql.includes("REVOKE ALL ON TABLE public.screener_52w_baseline_exclusions FROM PUBLIC"));
  assert(sql.includes("REVOKE ALL ON TABLE public.screener_52w_baseline_exclusions FROM anon"));
  assert(sql.includes("REVOKE ALL ON TABLE public.screener_52w_baseline_exclusions FROM authenticated"));
  assert(sql.includes("GRANT ALL ON TABLE public.screener_52w_baseline_exclusions TO service_role"));
});

Deno.test("static: baseline state integrity columns reset together", async () => {
  const sql = await load(MIGRATION_REL);
  assert(sql.includes("ADD COLUMN IF NOT EXISTS policy_min_sessions integer NULL"));
  assert(sql.includes("ADD COLUMN IF NOT EXISTS policy_excluded_count integer NULL"));
  assert(sql.includes("policy_min_sessions IS NULL OR policy_min_sessions >= 1"));
  assert(sql.includes("policy_excluded_count IS NULL OR policy_excluded_count >= 0"));
  assert(
    sql.includes("(policy_min_sessions IS NULL) = (policy_excluded_count IS NULL)"),
  );
});

Deno.test("static: direct replace publisher resets exclusion metadata unavailable", async () => {
  const sql = await load(MIGRATION_REL);
  const body = functionBody(sql, REPLACE_RPC);
  assert(body.includes("policy_min_sessions = NULL"));
  assert(body.includes("policy_excluded_count = NULL"));
  assert(body.includes("DELETE FROM public.screener_52w_baseline_exclusions"));
  assertFalse(body.includes("COMMIT"));
  assert(
    sql.includes(
      `GRANT EXECUTE ON FUNCTION public.${REPLACE_RPC}(uuid, jsonb, date, date, timestamptz, text)\n  TO service_role`,
    ),
  );
  assert(
    sql.includes(
      `REVOKE ALL ON FUNCTION public.${REPLACE_RPC}(uuid, jsonb, date, date, timestamptz, text)\n  FROM PUBLIC`,
    ),
  );
});

Deno.test("static: exclusion-aware publisher is atomic and fail-closed on mismatch", async () => {
  const sql = await load(MIGRATION_REL);
  const body = functionBody(sql, REPLACE_WITH_EXCLUSIONS_RPC);
  assertFalse(body.includes("COMMIT"));
  assert(body.includes("unrecognized exclusion reason"));
  assert(body.includes("invalid baseline session counts"));
  assert(body.includes("exclusion symbol overlaps baseline"));
  assert(body.includes("exclusion insert count mismatch"));
  assert(body.includes("INSERT INTO public.screener_52w_baseline_exclusions"));
  assert(body.includes("policy_min_sessions = p_min_sessions"));
  assert(body.includes("policy_excluded_count = v_excluded"));
  assert(body.includes("AND current_generation_id = p_generation_id"));
  assert(body.includes("baseline state generation mismatch"));
  assert(
    body.includes(
      "DELETE FROM public.screener_52w_baseline_exclusions\n  WHERE generation_id IS DISTINCT FROM p_generation_id",
    ),
  );

  const floorAt = body.indexOf("invalid baseline session counts");
  const replaceAt = body.indexOf(`public.${REPLACE_RPC}(`);
  const insertExclAt = body.indexOf(
    "INSERT INTO public.screener_52w_baseline_exclusions",
  );
  const updateStateAt = body.indexOf("policy_excluded_count = v_excluded");
  const mismatchAt = body.indexOf("baseline state generation mismatch");
  const deleteStaleAt = body.indexOf(
    "DELETE FROM public.screener_52w_baseline_exclusions",
  );
  assert(floorAt >= 0 && replaceAt > floorAt, "session floor before legacy replace");
  assert(replaceAt >= 0 && insertExclAt > replaceAt, "insert after legacy replace");
  assert(updateStateAt > insertExclAt, "state count after insert");
  assert(mismatchAt > updateStateAt, "generation mismatch rolls back");
  assert(deleteStaleAt > updateStateAt, "stale exclusion delete after publication");

  assert(
    sql.includes(
      `GRANT EXECUTE ON FUNCTION public.${REPLACE_WITH_EXCLUSIONS_RPC}(uuid, jsonb, date, date, timestamptz, text, jsonb, integer)\n  TO service_role`,
    ),
  );
  assert(
    sql.includes(
      `REVOKE ALL ON FUNCTION public.${REPLACE_WITH_EXCLUSIONS_RPC}(uuid, jsonb, date, date, timestamptz, text, jsonb, integer)\n  FROM PUBLIC`,
    ),
  );
});

Deno.test("static: finalizer delegates to exclusion-aware publisher then cleans staging", async () => {
  const sql = await load(MIGRATION_REL);
  const body = functionBody(sql, FINALIZE_RPC);
  assertFalse(body.includes("COMMIT"));
  assert(body.includes("s.sessions_observed >= p_min_sessions"));
  assert(body.includes("s.sessions_observed < p_min_sessions"));
  assert(body.includes("'insufficient_sessions'"));
  assert(body.includes(`public.${REPLACE_WITH_EXCLUSIONS_RPC}`));
  assertFalse(body.includes(`public.${REPLACE_RPC}(`));
  assert(
    body.includes(
      "DELETE FROM public.screener_52w_baseline_staging WHERE generation_id = p_generation_id",
    ),
  );
  assert(
    body.includes(
      "DELETE FROM public.screener_52w_baseline_job_dates WHERE generation_id = p_generation_id",
    ),
  );

  const publishAt = body.indexOf(`public.${REPLACE_WITH_EXCLUSIONS_RPC}`);
  const deleteStagingAt = body.indexOf(
    "DELETE FROM public.screener_52w_baseline_staging",
  );
  assert(publishAt >= 0 && deleteStagingAt > publishAt, "staging cleanup last");

  assert(
    sql.includes(
      `GRANT EXECUTE ON FUNCTION public.${FINALIZE_RPC}(uuid, integer, timestamptz)\n  TO service_role`,
    ),
  );
  assert(
    sql.includes(
      `REVOKE ALL ON FUNCTION public.${FINALIZE_RPC}(uuid, integer, timestamptz)\n  FROM PUBLIC`,
    ),
  );
});
