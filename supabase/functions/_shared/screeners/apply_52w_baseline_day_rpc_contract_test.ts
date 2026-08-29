// Static contract checks for the set-based 52-week daily apply RPC.
// These tests read migration SQL only. They do not execute against Postgres.

import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const NEW_MIGRATION_REL =
  "../../../migrations/20260829120000_screener_52w_baseline_apply_day_set_based_v1.sql";
const HISTORICAL_MIGRATION_REL =
  "../../../migrations/20260814180000_screener_52w_baseline_job.sql";

const RPC_NAME = "apply_screener_52w_baseline_day_v1";
const SIGNATURE =
  "public.apply_screener_52w_baseline_day_v1(\n  p_generation_id uuid,\n  p_session_date date,\n  p_bars jsonb,\n  p_provider_as_of timestamptz\n)";

const EXCEPTION_MESSAGES = [
  "generation_id and session_date required",
  "provider_as_of required",
  "bars must be a JSON array",
  "bars exceed day limit",
  "job generation mismatch",
  "job is not running",
  "session_date outside period",
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

Deno.test("static: new forward migration is the latest apply RPC definition", async () => {
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
    "20260814180000_screener_52w_baseline_job.sql",
    "20260829120000_screener_52w_baseline_apply_day_set_based_v1.sql",
  ]);
});

Deno.test("static: public signature, security, and grants are unchanged", async () => {
  const sql = await load(NEW_MIGRATION_REL);
  assert(sql.includes(`CREATE OR REPLACE FUNCTION ${SIGNATURE}`), "signature");
  assert(sql.includes("RETURNS jsonb"), "return type");
  assert(sql.includes("LANGUAGE plpgsql"), "language");
  assert(sql.includes("SECURITY DEFINER"), "security definer");
  assert(sql.includes("SET search_path = ''"), "search_path");
  assert(
    sql.includes(
      `GRANT EXECUTE ON FUNCTION public.${RPC_NAME}(uuid, date, jsonb, timestamptz)\n  TO service_role`,
    ),
    "service_role grant",
  );
  assert(
    sql.includes(
      `REVOKE ALL ON FUNCTION public.${RPC_NAME}(uuid, date, jsonb, timestamptz)\n  FROM PUBLIC`,
    ),
    "revoke public",
  );
  assert(
    sql.includes(
      `REVOKE ALL ON FUNCTION public.${RPC_NAME}(uuid, date, jsonb, timestamptz)\n  FROM anon`,
    ),
    "revoke anon",
  );
  assert(
    sql.includes(
      `REVOKE ALL ON FUNCTION public.${RPC_NAME}(uuid, date, jsonb, timestamptz)\n  FROM authenticated`,
    ),
    "revoke authenticated",
  );
});

Deno.test("static: job validation, period check, and 20k limit remain", async () => {
  const body = functionBody(await load(NEW_MIGRATION_REL));
  for (const message of EXCEPTION_MESSAGES) {
    assert(body.includes(`'${message}'`), `missing exception: ${message}`);
  }
  assert(body.includes("v_len > 20000"), "day array limit");
  assert(body.includes("FOR UPDATE"), "job row lock");
  assert(
    body.includes("v_job.generation_id IS DISTINCT FROM p_generation_id"),
    "generation mismatch",
  );
  assert(
    body.includes("p_session_date < v_job.period_start") &&
      body.includes("p_session_date > v_job.period_end"),
    "period bounds",
  );
});

Deno.test("static: duplicate date is idempotent and empty days still record the date", async () => {
  const body = functionBody(await load(NEW_MIGRATION_REL));
  assert(body.includes("'skipped', true"), "skipped return");
  assert(
    body.includes("FROM public.screener_52w_baseline_job_dates"),
    "date idempotency lookup",
  );
  const insertDates = body.indexOf(
    "INSERT INTO public.screener_52w_baseline_job_dates",
  );
  const insertStaging = body.indexOf(
    "INSERT INTO public.screener_52w_baseline_staging",
  );
  const updateJob = body.indexOf("dates_applied = dates_applied + 1");
  assert(insertStaging >= 0, "staging insert");
  assert(insertDates > insertStaging, "job_dates insert after staging");
  assert(updateJob > insertDates, "checkpoint after date insert");
  assert(body.includes("last_applied_date = p_session_date"));
  assert(body.includes("'skipped', false"));
});

Deno.test("static: high/low accumulation and one session increment per applied day", async () => {
  const body = functionBody(await load(NEW_MIGRATION_REL));
  assert(body.includes("EXCLUDED.high_52w >= public.screener_52w_baseline_staging.high_52w"));
  assert(body.includes("EXCLUDED.low_52w <= public.screener_52w_baseline_staging.low_52w"));
  assert(
    body.includes(
      "sessions_observed = public.screener_52w_baseline_staging.sessions_observed + 1",
    ),
  );
  assert(body.includes("p_session_date,\n    p_session_date,\n    1"), "new row starts at 1 session");
});

Deno.test("static: invalid rows are filtered set-wise without a per-row exception block", async () => {
  const body = functionBody(await load(NEW_MIGRATION_REL));
  assert(body.includes("jsonb_typeof(e.elem) = 'object'"));
  assert(body.includes("v.symbol ~ '^[A-Z][A-Z0-9.\\-]*$'"));
  assert(body.includes("v.high_52w > 0"));
  assert(body.includes("v.low_52w > 0"));
  assert(body.includes("v.low_52w <= v.high_52w"));
  assert(
    body.includes("^[+-]?(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)(?:[eE][+-]?[0-9]+)?$"),
    "safe numeric filter before cast",
  );
  assertFalse(
    /BEGIN\s+v_high\s*:=/i.test(body) || body.includes("EXCEPTION WHEN others THEN"),
    "must not use per-row BEGIN/EXCEPTION subtransactions",
  );
});

Deno.test("static: apply is one set-based INSERT SELECT ON CONFLICT with GROUP BY symbol", async () => {
  const body = functionBody(await load(NEW_MIGRATION_REL));
  assert(body.includes("FROM jsonb_array_elements(p_bars) AS e(elem)"));
  assert(body.includes("GROUP BY v.symbol"));
  assert(body.includes("ON CONFLICT (generation_id, symbol) DO UPDATE SET"));
  assertFalse(
    /FOR\s+v_elem\s+IN\s+SELECT\s+value\s+FROM\s+jsonb_array_elements/i.test(
      body,
    ),
    "must not use a PL/pgSQL per-symbol jsonb loop",
  );
  assertFalse(body.includes("FOR v_elem IN"), "must not loop v_elem");
  const stagingSlice = body.slice(
    body.indexOf("INSERT INTO public.screener_52w_baseline_staging"),
    body.indexOf("INSERT INTO public.screener_52w_baseline_job_dates"),
  );
  assertFalse(
    /INSERT INTO public\.screener_52w_baseline_staging[\s\S]*VALUES\s*\(\s*p_generation_id/i
      .test(stagingSlice),
    "must not INSERT one staging row at a time with VALUES",
  );
  const onConflictCount =
    body.split("ON CONFLICT (generation_id, symbol) DO UPDATE SET").length - 1;
  assertEquals(onConflictCount, 1, "exactly one set-based staging upsert");
});

Deno.test("static: historical apply migration still has the original row loop", async () => {
  const body = functionBody(await load(HISTORICAL_MIGRATION_REL));
  assert(body.includes("FOR v_elem IN SELECT value FROM jsonb_array_elements(p_bars)"));
  assert(body.includes("EXCEPTION WHEN others THEN"));
  assert(body.includes("CONTINUE;"));
});
