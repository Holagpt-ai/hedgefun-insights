import { assert, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";

const sql = await Deno.readTextFile(
  new URL("../../../migrations/20260911180000_wl_v2_anthropic_cost_control_v1.sql", import.meta.url),
);

function functionBody(name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  assert(start >= 0, `missing ${name}`);
  const next = sql.indexOf("CREATE OR REPLACE FUNCTION public.", start + 1);
  return next >= 0 ? sql.slice(start, next) : sql.slice(start);
}

Deno.test("skip RPC extends valid_through without inserting history", () => {
  const body = functionBody("skip_watchlist_analysis_v2");
  assert(body.includes("UPDATE public.watchlist_analysis_v2"));
  assert(body.includes("valid_through = p_extend_valid_through"));
  assert(body.includes("Intentionally no INSERT into watchlist_analysis_history"));
  assertFalse(body.includes("insert into public.watchlist_analysis_history"));
  assertFalse(body.includes("INSERT INTO public.watchlist_analysis_history"));
});

Deno.test("ticker lease is row-backed with expiry, not an advisory lock around Claude", () => {
  const claim = functionBody("claim_watchlist_v2_ticker_lease");
  assert(claim.includes("lease_expires_at"));
  assert(claim.includes("lease_expires_at <= v_now"));
  assertFalse(claim.includes("pg_advisory_xact_lock"));
  assertFalse(claim.includes("pg_advisory_lock"));
  assert(sql.includes("watchlist_analysis_requests_active_ticker_lease_idx"));
});

Deno.test("batch telemetry records each Claude decision on the run", () => {
  const rec = functionBody("record_wl_v2_claude_decision");
  for (const decision of [
    "claude_called_new",
    "claude_called_expired_changed",
    "claude_called_manual",
    "skipped_still_valid",
    "skipped_unchanged",
    "skipped_insufficient_data",
    "skipped_in_flight",
    "error",
  ]) {
    assert(rec.includes(`'${decision}'`), decision);
  }
  assert(rec.includes("claude_called"));
  assert(rec.includes("claude_skipped"));
});

Deno.test("provider-call telemetry records fallback off and never mentions prompts", async () => {
  const providerSql = await Deno.readTextFile(
    new URL("../../../migrations/20260911183000_wl_v2_ai_provider_telemetry.sql", import.meta.url),
  );
  assert(providerSql.includes("fallback"));
  assert(providerSql.includes("\"off\""));
  assert(providerSql.includes("^[a-z][a-z0-9_-]{0,31}$"));
  assertFalse(providerSql.includes("qwen"));
  assertFalse(providerSql.includes("QWEN_API_KEY"));
  assertFalse(providerSql.includes("ANTHROPIC_API_KEY"));
  assertFalse(providerSql.includes("buildAiPrompt"));
});
