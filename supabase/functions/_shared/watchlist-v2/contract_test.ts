import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { containsForbiddenKey, normalizeTicker, validateAnalysisV2Payload } from "./contract.ts";

Deno.test("normalizeTicker rejects malformed", () => {
  assertEquals(normalizeTicker("aapl"), "AAPL");
  assertEquals(normalizeTicker(" aapl "), "AAPL");
  assertEquals(normalizeTicker("1AAPL"), null);
  assertEquals(normalizeTicker(""), null);
  assertEquals(normalizeTicker(123), null);
  assertEquals(normalizeTicker("A".repeat(20)), null);
});

Deno.test("containsForbiddenKey detects nested score fields", () => {
  assert(containsForbiddenKey({ a: { b: { hf_score: 1 } } }) === "hf_score");
  assert(containsForbiddenKey({ x: [{ momentum_score: 5 }] }) === "momentum_score");
  assert(containsForbiddenKey({ y: { confidence_pct: 0.5 } }) === "confidence_pct");
  assertEquals(containsForbiddenKey({ direction: "bullish" }), null);
});

Deno.test("validateAnalysisV2Payload accepts a minimal valid payload", () => {
  const analyzed = new Date().toISOString();
  const validThrough = new Date(Date.now() + 60_000).toISOString();
  const payload = {
    ticker: "AAPL",
    contract_version: 2,
    session_date: "2026-07-23",
    session_type: "rth",
    valid_through: validThrough,
    direction: "neutral",
    explanation: "Test.",
    driver_ids: [],
    failure_reason: null,
    price: 100,
    change_pct: 0.5,
    intraday: [{ t: Date.now() - 60_000, o: 100, h: 101, l: 99, c: 100, v: 1000 }],
    volume: 1000,
    rvol: null,
    rvol_class: null,
    market_signals: [],
    recent_events: [],
    key_levels: {
      vwap: 100, hod: 101, lod: 99, premarket_high: null, premarket_low: null,
      prior_close: 99.5, basis: { hod_lod_scope: "rth", vwap_scope: "rth" },
    },
    inputs_quality: {
      snapshot: "ok", bars: "ok", prior_close: "ok", volume: "ok",
      rvol: "no_baseline", events: "none_qualifying", bar_count: 1,
      feed_delay_note: "provider feed is 15-minute delayed", reason_codes: [],
    },
    analyzed_at: analyzed,
    run_id: null,
  };
  const r = validateAnalysisV2Payload(payload);
  assert(r.ok, r.ok ? "" : r.reason);
});

Deno.test("validateAnalysisV2Payload rejects data_unavailable without reason", () => {
  const r = validateAnalysisV2Payload({
    ticker: "AAPL", contract_version: 2, session_date: "2026-07-23", session_type: "rth",
    valid_through: new Date(Date.now() + 60_000).toISOString(),
    direction: "data_unavailable", explanation: "x", driver_ids: [],
    failure_reason: null, price: null, change_pct: null, intraday: [],
    volume: null, rvol: null, rvol_class: null, market_signals: [], recent_events: [],
    key_levels: { vwap: null, hod: null, lod: null, premarket_high: null, premarket_low: null, prior_close: null, basis: { hod_lod_scope: "rth", vwap_scope: null } },
    inputs_quality: { snapshot: "missing", bars: "missing", prior_close: "missing", volume: "missing", rvol: "no_baseline", events: "missing", bar_count: 0, feed_delay_note: "provider feed is 15-minute delayed", reason_codes: [] },
    analyzed_at: new Date().toISOString(), run_id: null,
  });
  assert(!r.ok);
});
