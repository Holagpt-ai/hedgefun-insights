// Static contract checks for RVOL 20D volume baseline V1.
// Reads migration SQL only. Does not apply migrations.

import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
// assertFalse used for history retention proofs

const MIGRATION_REL =
  "../../../migrations/20260917180000_screener_daily_volume_baseline_v1.sql";

const CARRY_MIGRATION_REL =
  "../../../migrations/20260918213000_screener_rvol_carry_forward_v1.sql";

const FINALIZE_RPC = "finalize_screener_52w_baseline_publish_v1";
const PUBLISH_VOLUME_RPC = "publish_screener_volume_baselines_v1";
const APPLY_VOLUME_RPC = "apply_screener_daily_volume_day_v1";
const APPEND_VOLUME_RPC = "append_screener_daily_volume_history_v1";

async function load(rel: string): Promise<string> {
  const raw = await Deno.readTextFile(new URL(rel, import.meta.url));
  return raw.replaceAll("\r\n", "\n");
}

function functionBody(sql: string, rpcName: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${rpcName}`);
  assert(start >= 0, `missing CREATE OR REPLACE for ${rpcName}`);
  const begin = sql.indexOf("AS $", start);
  const endMarker = sql.indexOf("$fn$;", begin + 1);
  const endPub = sql.indexOf("$pub$;", begin + 1);
  const endAppend = sql.indexOf("$append$;", begin + 1);
  const endTrim = sql.indexOf("$trim$;", begin + 1);
  const endCleanup = sql.indexOf("$cleanup$;", begin + 1);
  const candidates = [endMarker, endPub, endAppend, endTrim, endCleanup].filter(
    (n) => n > begin,
  );
  const end = Math.min(...candidates);
  assert(begin >= 0 && end > begin, `missing body delimiters for ${rpcName}`);
  return sql.slice(begin, end);
}

Deno.test("static: volume baseline migration is latest finalize definition", async () => {
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
  assertEquals(defs[defs.length - 1], "20260918213000_screener_rvol_carry_forward_v1.sql");
});

Deno.test("static: worker finalize publishes volume baselines before HL flip", async () => {
  const sql = await load(CARRY_MIGRATION_REL);
  const body = functionBody(sql, FINALIZE_RPC);
  const publishIdx = body.indexOf(PUBLISH_VOLUME_RPC);
  const hlInsertIdx = body.indexOf("INSERT INTO public.screener_52w_baselines");
  assert(publishIdx >= 0, "finalize must call publish_screener_volume_baselines_v1");
  assert(hlInsertIdx >= 0, "finalize must insert HL baselines");
  assert(publishIdx < hlInsertIdx, "volume publish must precede HL insert");
  assert(
    body.includes("cleanup_stale_screener_volume_generations_v1"),
    "finalize must cleanup stale volume generations",
  );
});

Deno.test("static: apply volume day trims history and is idempotent", async () => {
  const sql = await load(MIGRATION_REL);
  const body = functionBody(sql, APPLY_VOLUME_RPC);
  assert(body.includes("trim_screener_daily_volume_history_v1"));
  assert(body.includes("screener_daily_volume_job_dates"));
  assert(body.includes("'skipped', true"));
});

Deno.test("static: publish requires exactly 20 sessions", async () => {
  const sql = await load(MIGRATION_REL);
  const body = functionBody(sql, PUBLISH_VOLUME_RPC);
  assert(body.includes("HAVING COUNT(*) = 20"));
  assertFalse(body.includes("HAVING COUNT(*) >= 19"));
});

Deno.test("static: append RPC validates staging job and trims", async () => {
  const sql = await load(MIGRATION_REL);
  const body = functionBody(sql, APPEND_VOLUME_RPC);
  assert(body.includes("screener_52w_baseline_publish_job"));
  assert(body.includes("status <> 'staging'"));
  assert(body.includes("trim_screener_daily_volume_history_v1"));
});

Deno.test("static: start job copy-forwards from current generation", async () => {
  const sql = await load(MIGRATION_REL);
  const body = functionBody(sql, "start_screener_52w_baseline_job_v1");
  assert(body.includes("copy_screener_daily_volume_history_from_current_v1"));
  assert(body.includes("v_old IS DISTINCT FROM v_current"));
});

Deno.test("static: published generation retains rolling history", async () => {
  const sql = await load(MIGRATION_REL);
  const cronBody = functionBody(sql, "finalize_screener_52w_baseline_job_v1");
  const carrySql = await load(CARRY_MIGRATION_REL);
  const workerBody = functionBody(carrySql, "finalize_screener_52w_baseline_publish_v1");
  assertFalse(cronBody.includes("DELETE FROM public.screener_daily_volume_history"));
  assertFalse(workerBody.includes("DELETE FROM public.screener_daily_volume_history"));
});
