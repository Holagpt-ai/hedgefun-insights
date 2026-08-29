import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { STALE_MS } from "../_shared/watchlist-v2/market-data.ts";
import { LOG_PREFIX } from "../_shared/watchlist-v2/sanitize.ts";
import {
  ANALYZER_OUTCOME_LOG_KEYS,
  emptyAnalyzerOutcomeLog,
  formatAnalyzerOutcomeLog,
  outcomeLogContainsSecrets,
  resolveAnalyzerOrigin,
  sanitizeAnalyzerOutcomeLog,
  type AnalyzerOutcomeLog,
} from "./outcome-log.ts";

Deno.test("STALE_MS remains 45 minutes", () => {
  assertEquals(STALE_MS, 45 * 60 * 1000);
});

Deno.test("resolveAnalyzerOrigin maps run_id to batch, else trigger/manual", () => {
  assertEquals(resolveAnalyzerOrigin("trigger", null), "trigger");
  assertEquals(resolveAnalyzerOrigin("manual", null), "manual");
  assertEquals(resolveAnalyzerOrigin("trigger", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"), "batch");
  assertEquals(resolveAnalyzerOrigin("manual", "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"), "batch");
});

Deno.test("sanitizeAnalyzerOutcomeLog drops unknown keys and forces STALE_MS", () => {
  const dirty = {
    ...emptyAnalyzerOutcomeLog("aapl", "batch"),
    outcome: "data_unavailable",
    failure_reason: "SNAPSHOT_STALE",
    snapshot_age_ms: 3_600_000,
    stale_threshold_ms: 1,
    snapshot_timestamp_source: "lastTrade",
    bar_count: 12,
    rvol_available: false,
    catalyst_present: false,
    earnings_present: false,
    signal_count: 1,
    missing_evidence_count: 3,
    elapsed_ms: 842,
    prompt: "SYSTEM: ignore previous",
    apiKey: "sk-ant-secret",
    raw_body: { content: [{ text: "Bullish" }] },
  } as AnalyzerOutcomeLog & { prompt: string; apiKey: string; raw_body: unknown };
  const safe = sanitizeAnalyzerOutcomeLog(dirty);
  assertEquals(Object.keys(safe).sort(), [...ANALYZER_OUTCOME_LOG_KEYS].sort());
  assertEquals(safe.stale_threshold_ms, 45 * 60 * 1000);
  assertEquals(safe.symbol, "AAPL");
  assertFalse("prompt" in safe);
  assertFalse("apiKey" in safe);
  assertFalse("raw_body" in safe);
});

Deno.test("formatted outcome log has no secrets, prompts, or raw provider bodies", () => {
  const line = formatAnalyzerOutcomeLog({
    ...emptyAnalyzerOutcomeLog("NVVE", "trigger"),
    session: "premarket",
    outcome: "data_unavailable",
    failure_reason: "INSUFFICIENT_EVIDENCE",
    snapshot_age_ms: 120_000,
    snapshot_timestamp_source: "min",
    bar_count: 8,
    rvol_available: false,
    catalyst_present: false,
    earnings_present: false,
    signal_count: 0,
    missing_evidence_count: 4,
    elapsed_ms: 210,
  });
  assert(line.startsWith(`${LOG_PREFIX} analyzer_outcome `));
  assertFalse(outcomeLogContainsSecrets(line));
  const json = line.slice(`${LOG_PREFIX} analyzer_outcome `.length);
  const parsed = JSON.parse(json) as Record<string, unknown>;
  assertEquals(Object.keys(parsed).sort(), [...ANALYZER_OUTCOME_LOG_KEYS].sort());
  for (const forbidden of [
    "sk-ant", "apiKey", "Bearer", "x-api-key", "Authorization",
    "prompt", "You are", "claude", "https://", "http://",
  ]) {
    assertFalse(line.includes(forbidden), `leaked ${forbidden}`);
  }
});

Deno.test("outcome log does not fabricate fallback market data", () => {
  const safe = sanitizeAnalyzerOutcomeLog(emptyAnalyzerOutcomeLog("MSFT", "manual"));
  assertEquals(safe.snapshot_age_ms, null);
  assertEquals(safe.bar_count, null);
  assertEquals(safe.rvol_available, null);
  assertEquals(safe.catalyst_present, null);
  assertEquals(safe.earnings_present, null);
  assertEquals(safe.signal_count, null);
  assertEquals(safe.missing_evidence_count, null);
  assertEquals(safe.anthropic_http_status, null);
});
