// Static contract checks for the set-based 52-week baseline replace RPC.
// These tests read migration SQL only. They do not execute against Postgres.

import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const NEW_MIGRATION_REL =
  "../../../migrations/20260828200000_screener_52w_baseline_replace_generation_set_based_v1.sql";
const HISTORICAL_MIGRATIONS = [
  "../../../migrations/20260813190000_screener_52w_baselines.sql",
  "../../../migrations/20260814154404_11fa443d-48cf-4b31-9afb-2a95ce6338f4.sql",
] as const;

const RPC_NAME = "replace_screener_52w_baseline_generation_v1";
const SIGNATURE =
  "public.replace_screener_52w_baseline_generation_v1(\n  p_generation_id uuid,\n  p_rows jsonb,\n  p_period_start date,\n  p_period_end date,\n  p_provider_as_of timestamptz,\n  p_status text\n)";

const EXCEPTION_MESSAGES = [
  "generation_id required",
  "period required",
  "period inverted",
  "provider_as_of required",
  "provider_as_of implausible",
  "provider_as_of too far in the future",
  "invalid status",
  "rows must be a JSON array",
  "rows exceed baseline limit",
  "empty status requires zero rows",
  "available status requires rows",
  "row must be an object",
  "invalid symbol",
  "duplicate symbol",
  "row period mismatch",
  "invalid high_52w/low_52w",
  "invalid sessions_observed",
  "invalid high_candidates",
  "invalid low_candidates",
  "insert count mismatch",
] as const;

async function load(rel: string): Promise<string> {
  const raw = await Deno.readTextFile(new URL(rel, import.meta.url));
  return raw.replaceAll("\r\n", "\n");
}

function functionBody(sql: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${RPC_NAME}`);
  assert(start >= 0, `missing CREATE OR REPLACE for ${RPC_NAME}`);
  const begin = sql.indexOf("AS $fn$", start);
  const end = sql.indexOf("$fn$;", begin + 1);
  assert(begin >= 0 && end > begin, "missing function body delimiters");
  return sql.slice(begin, end);
}

Deno.test("static: only the new forward migration is the latest RPC definition", async () => {
  const migrationsDir = new URL("../../../migrations/", import.meta.url);
  const defs: string[] = [];
  for await (const entry of Deno.readDir(migrationsDir)) {
    if (!entry.isFile || !entry.name.endsWith(".sql")) continue;
    const sql = await Deno.readTextFile(new URL(entry.name, migrationsDir));
    if (sql.includes(`CREATE OR REPLACE FUNCTION public.${RPC_NAME}`)) {
      defs.push(entry.name);
    }
  }
  defs.sort();
  assertEquals(defs, [
    "20260813190000_screener_52w_baselines.sql",
    "20260814154404_11fa443d-48cf-4b31-9afb-2a95ce6338f4.sql",
    "20260828200000_screener_52w_baseline_replace_generation_set_based_v1.sql",
  ]);
});

Deno.test("static: public signature, security, grants, and return type are unchanged", async () => {
  const sql = await load(NEW_MIGRATION_REL);
  assert(sql.includes(`CREATE OR REPLACE FUNCTION ${SIGNATURE}`), "signature");
  assert(sql.includes("RETURNS integer"), "return type");
  assert(sql.includes("LANGUAGE plpgsql"), "language");
  assert(sql.includes("SECURITY DEFINER"), "security definer");
  assert(sql.includes("SET search_path = ''"), "search_path");
  assert(
    sql.includes(
      `GRANT EXECUTE ON FUNCTION public.${RPC_NAME}(uuid, jsonb, date, date, timestamptz, text)\n  TO service_role`,
    ),
    "service_role grant",
  );
  assert(
    sql.includes(
      `REVOKE ALL ON FUNCTION public.${RPC_NAME}(uuid, jsonb, date, date, timestamptz, text)\n  FROM PUBLIC`,
    ),
    "revoke public",
  );
  assert(
    sql.includes(
      `REVOKE ALL ON FUNCTION public.${RPC_NAME}(uuid, jsonb, date, date, timestamptz, text)\n  FROM anon`,
    ),
    "revoke anon",
  );
  assert(
    sql.includes(
      `REVOKE ALL ON FUNCTION public.${RPC_NAME}(uuid, jsonb, date, date, timestamptz, text)\n  FROM authenticated`,
    ),
    "revoke authenticated",
  );
});

Deno.test("static: validation messages and set-based duplicate detection are present", async () => {
  const sql = await load(NEW_MIGRATION_REL);
  const body = functionBody(sql);
  for (const message of EXCEPTION_MESSAGES) {
    assert(body.includes(`'${message}'`), `missing exception: ${message}`);
  }
  assert(body.includes("GROUP BY upper(trim(COALESCE(e ->> 'symbol', '')))"));
  assert(body.includes("HAVING COUNT(*) > 1"));
  assert(body.includes("jsonb_array_elements(p_rows)"));
  assert(body.includes("v_len > 20000"));
  assert(body.includes("p_status NOT IN ('available', 'empty')"));
});

Deno.test("static: O(n^2) per-row duplicate loop is gone", async () => {
  const body = functionBody(await load(NEW_MIGRATION_REL));
  assertFalse(body.includes("v_seen"), "must not use v_seen");
  assertFalse(body.includes("array_append"), "must not use array_append");
  assertFalse(body.includes("= ANY (v_seen)"), "must not use ANY(v_seen)");
  assertFalse(body.includes("ANY(v_seen)"), "must not use ANY(v_seen)");
  assertFalse(
    /FOR\s+v_elem\s+IN\s+SELECT\s+value\s+FROM\s+jsonb_array_elements/i.test(
      body,
    ),
    "must not use a PL/pgSQL per-row jsonb loop",
  );
});

Deno.test("static: insert is set-based and pointer flip precedes old-generation delete", async () => {
  const body = functionBody(await load(NEW_MIGRATION_REL));
  const insertIdx = body.indexOf(
    "INSERT INTO public.screener_52w_baselines",
  );
  const selectFromJson = body.indexOf(
    "FROM jsonb_array_elements(p_rows) AS e;",
  );
  const stateIdx = body.indexOf(
    "INSERT INTO public.screener_52w_baseline_state",
  );
  const deleteIdx = body.indexOf(
    "DELETE FROM public.screener_52w_baselines",
  );
  const returnIdx = body.indexOf("RETURN v_inserted;");
  assert(insertIdx >= 0, "insert new generation");
  assert(selectFromJson > insertIdx, "INSERT ... SELECT from jsonb array");
  assertFalse(
    /INSERT INTO public\.screener_52w_baselines[\s\S]*VALUES\s*\(/i.test(
      body.slice(insertIdx, stateIdx),
    ),
    "must not INSERT one row at a time with VALUES",
  );
  assert(stateIdx > insertIdx, "pointer updates after insert");
  assert(
    body.includes("ON CONFLICT (state_key) DO UPDATE SET"),
    "state upsert",
  );
  assert(
    body.includes("WHERE generation_id IS DISTINCT FROM p_generation_id"),
    "delete non-current generations",
  );
  assert(deleteIdx > stateIdx, "delete old generations after pointer update");
  assert(returnIdx > deleteIdx, "return after delete");
});

Deno.test("static: historical migrations that defined the RPC were not edited", async () => {
  for (const rel of HISTORICAL_MIGRATIONS) {
    const sql = await load(rel);
    const body = functionBody(sql);
    assert(
      body.includes("v_seen text[] := ARRAY[]::text[]"),
      `${rel} still has original v_seen declaration`,
    );
    assert(
      body.includes("v_symbol = ANY (v_seen)"),
      `${rel} still has original ANY(v_seen) check`,
    );
    assert(
      body.includes("v_seen := array_append(v_seen, v_symbol)"),
      `${rel} still has original array_append`,
    );
  }
});
