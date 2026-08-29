// Static contract checks for the set-based 52-week baseline replace RPC.
// These tests read migration SQL only. They do not execute against Postgres.

import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const SET_BASED_MIGRATIONS = [
  "../../../migrations/20260828200000_screener_52w_baseline_replace_generation_set_based_v1.sql",
  "../../../migrations/20260829002443_7ba9725f-987a-4537-998b-bd7ee6a0a057.sql",
] as const;
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

Deno.test("static: set-based migrations are the later RPC definitions", async () => {
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
    "20260829002443_7ba9725f-987a-4537-998b-bd7ee6a0a057.sql",
  ]);
});

async function assertSetBasedContract(rel: string): Promise<void> {
  const sql = await load(rel);
  assert(sql.includes(`CREATE OR REPLACE FUNCTION ${SIGNATURE}`), `${rel} signature`);
  assert(sql.includes("RETURNS integer"), `${rel} return type`);
  assert(sql.includes("LANGUAGE plpgsql"), `${rel} language`);
  assert(sql.includes("SECURITY DEFINER"), `${rel} security definer`);
  assert(sql.includes("SET search_path = ''"), `${rel} search_path`);
  assert(
    sql.includes(
      `GRANT EXECUTE ON FUNCTION public.${RPC_NAME}(uuid, jsonb, date, date, timestamptz, text)\n  TO service_role`,
    ),
    `${rel} service_role grant`,
  );
  assert(
    sql.includes(
      `REVOKE ALL ON FUNCTION public.${RPC_NAME}(uuid, jsonb, date, date, timestamptz, text)\n  FROM PUBLIC`,
    ),
    `${rel} revoke public`,
  );
  const body = functionBody(sql);
  for (const message of EXCEPTION_MESSAGES) {
    assert(body.includes(`'${message}'`), `${rel} missing exception: ${message}`);
  }
  assert(body.includes("GROUP BY upper(trim(COALESCE(e ->> 'symbol', '')))"));
  assert(body.includes("HAVING COUNT(*) > 1"));
  assertFalse(body.includes("v_seen"), `${rel} must not use v_seen`);
  assertFalse(
    /FOR\s+v_elem\s+IN\s+SELECT\s+value\s+FROM\s+jsonb_array_elements/i.test(body),
    `${rel} must not use a PL/pgSQL per-row jsonb loop`,
  );
  assert(body.includes("INSERT INTO public.screener_52w_baselines"));
  assert(body.includes("FROM jsonb_array_elements(p_rows) AS e;"));
}

Deno.test("static: Cursor and Lovable set-based definitions match the public contract", async () => {
  for (const rel of SET_BASED_MIGRATIONS) {
    await assertSetBasedContract(rel);
  }
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
