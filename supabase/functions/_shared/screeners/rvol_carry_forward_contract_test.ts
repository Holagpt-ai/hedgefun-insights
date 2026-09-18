// Static contract checks for the RVOL 20D generation carry-forward P0 fix.
// Reads migration SQL only. Does not apply migrations.

import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const MIGRATION_REL =
  "../../../migrations/20260918213000_screener_rvol_carry_forward_v1.sql";

const FINALIZE_RPC = "finalize_screener_52w_baseline_publish_v1";
const COPY_RPC = "copy_screener_daily_volume_history_for_finalize_v1";
const PUBLISH_RPC = "publish_screener_volume_baselines_v1";
const CLEANUP_RPC = "cleanup_stale_screener_volume_generations_v1";
const TRIM_RPC = "trim_screener_daily_volume_history_v1";

async function load(): Promise<string> {
  const raw = await Deno.readTextFile(new URL(MIGRATION_REL, import.meta.url));
  return raw.replaceAll("\r\n", "\n");
}

function functionBody(sql: string, rpcName: string): string {
  const start = sql.indexOf(`FUNCTION public.${rpcName}`);
  assert(start >= 0, `missing definition for ${rpcName}`);
  const begin = sql.indexOf("AS $", start);
  assert(begin > start, `missing body start for ${rpcName}`);
  const tagEnd = sql.indexOf("$", begin + 4);
  const tag = sql.slice(begin + 3, tagEnd + 1);
  const end = sql.indexOf(`${tag};`, begin + tag.length + 3);
  assert(end > begin, `missing body end for ${rpcName}`);
  return sql.slice(begin, end);
}

Deno.test("carry-forward: copy runs before publish, publish before cleanup", async () => {
  const body = functionBody(await load(), FINALIZE_RPC);
  const copyIdx = body.indexOf(COPY_RPC);
  const publishIdx = body.indexOf(`v_volume_published := public.${PUBLISH_RPC}`);
  const cleanupIdx = body.indexOf(CLEANUP_RPC);
  assert(copyIdx >= 0, "finalize must copy rolling history forward");
  assert(publishIdx > copyIdx, "publish must run after the copy");
  assert(cleanupIdx > publishIdx, "cleanup must run after publish");
});

Deno.test("carry-forward: destructive cleanup is gated on a non-empty publish", async () => {
  const body = functionBody(await load(), FINALIZE_RPC);
  const gate = "IF v_volume_published > 0 THEN\n    PERFORM public." + CLEANUP_RPC;
  assert(body.includes(gate), "cleanup must be guarded by v_volume_published > 0");
});

Deno.test("carry-forward: target job dates survive an empty publish", async () => {
  const body = functionBody(await load(), FINALIZE_RPC);
  const gated =
    "IF v_volume_published > 0 THEN\n    DELETE FROM public.screener_daily_volume_job_dates";
  assert(body.includes(gated), "job-date deletion must be guarded too");
});

Deno.test("carry-forward: finalize never deletes source history directly", async () => {
  const body = functionBody(await load(), FINALIZE_RPC);
  assertFalse(body.includes("DELETE FROM public.screener_daily_volume_history"));
});

Deno.test("carry-forward: copy helper picks a deterministic non-target source", async () => {
  const body = functionBody(await load(), COPY_RPC);
  assert(body.includes("generation_id IS DISTINCT FROM p_target_generation_id"));
  assert(body.includes("ORDER BY MAX(h.session_date) DESC, COUNT(*) DESC, h.generation_id"));
  assert(body.includes("LIMIT 1"));
  assert(body.includes("IF v_source IS NULL THEN\n    RETURN 0;"));
});

Deno.test("carry-forward: copy is idempotent via upsert on the natural key", async () => {
  const body = functionBody(await load(), COPY_RPC);
  assert(body.includes("ON CONFLICT (generation_id, symbol, session_date) DO UPDATE SET"));
});

Deno.test("carry-forward: copy rejects non-positive volumes", async () => {
  const body = functionBody(await load(), COPY_RPC);
  assert(body.includes("h.volume IS NOT NULL"));
  assert(body.includes("h.volume > 0"));
});

Deno.test("carry-forward: copied history is trimmed to the latest 20 sessions", async () => {
  const body = functionBody(await load(), COPY_RPC);
  const copyIdx = body.indexOf("INSERT INTO public.screener_daily_volume_history");
  const trimIdx = body.indexOf(TRIM_RPC);
  assert(trimIdx > copyIdx, "trim must run after the copy insert");
});

Deno.test("carry-forward: helper is service-role only", async () => {
  const sql = await load();
  assert(sql.includes(`REVOKE ALL ON FUNCTION public.${COPY_RPC}(uuid) FROM PUBLIC;`));
  assert(sql.includes(`GRANT EXECUTE ON FUNCTION public.${COPY_RPC}(uuid) TO service_role;`));
  assert(sql.includes("SECURITY DEFINER"));
  assert(sql.includes("SET search_path TO ''"));
});

Deno.test("carry-forward: RVOL window formula is unchanged (exactly 20 prior sessions)", async () => {
  const sql = await load();
  assertFalse(sql.includes("HAVING COUNT(*) >= 20"));
  assertFalse(sql.includes(`CREATE OR REPLACE FUNCTION public.${PUBLISH_RPC}`));
});

Deno.test("carry-forward: generation mismatch still fails closed", async () => {
  const body = functionBody(await load(), FINALIZE_RPC);
  assert(body.includes("RAISE EXCEPTION 'wrong generation'"));
  assertEquals(body.includes("EXCEPTION WHEN OTHERS"), false);
});
