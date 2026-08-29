// Source-level regression: SNAPSHOT_STALE and INSUFFICIENT_EVIDENCE must still
// short-circuit before Anthropic. Does not execute the analyzer.

import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluateSufficiency, MIN_BARS_FOR_AI } from "../_shared/watchlist-v2/sufficiency.ts";
import type { InputsQuality } from "../_shared/watchlist-v2/contract.ts";
import { STALE_MS } from "../_shared/watchlist-v2/market-data.ts";
import { isInsufficientEvidence, buildAiEvidence } from "../_shared/ai/evidence.ts";
import { validateQuote } from "../_shared/quotes/integrity.ts";

const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

const okQuality: InputsQuality = {
  snapshot: "ok", bars: "ok", prior_close: "ok",
  volume: "ok", rvol: "ok", events: "ok",
  bar_count: MIN_BARS_FOR_AI, feed_delay_note: "provider feed is 15-minute delayed",
  reason_codes: [],
};

Deno.test("45-minute stale threshold is unchanged", () => {
  assertEquals(STALE_MS, 45 * 60 * 1000);
  assert(src.includes("STALE_MS"));
  assertFalse(src.includes("STALE_MS ="));
});

Deno.test("SNAPSHOT_STALE still fails sufficiency before any AI caller", () => {
  const r = evaluateSufficiency({
    quality: { ...okQuality, snapshot: "stale" },
    price: 10, priorClose: 9, volume: 1000, quoteValid: true,
  });
  assertEquals(r.ok, false);
  assertEquals(r.failure_code, "SNAPSHOT_STALE");

  const suffIdx = src.indexOf("if (!sufficiency.ok)");
  const callerIdx = src.indexOf("const caller: AiCaller = makeAnthropicCaller");
  assert(suffIdx > 0 && callerIdx > suffIdx, "sufficiency gate must precede Anthropic caller");
  const between = src.slice(suffIdx, callerIdx);
  assert(between.includes("data_unavailable"));
  assert(between.includes("failureReason = code"));
  assert(!between.includes("buildAiPrompt("), "stale path must not build an Anthropic prompt");
});

Deno.test("INSUFFICIENT_EVIDENCE still blocks Anthropic", () => {
  const quote = validateQuote({
    symbol: "ILLQ",
    price: 3.12,
    lastTradePrice: 3.12,
    dayClose: 3.10,
    volume: 1000,
    quoteTimestamp: "2026-08-29T12:00:00.000Z",
  });
  const evidence = buildAiEvidence({
    symbol: "ILLQ",
    quote,
    rvol: null,
    rvolAvailable: false,
    signals: [],
    catalysts: [],
    earnings: null,
    evidenceCutoff: "2026-08-29T12:00:00.000Z",
  });
  assert(isInsufficientEvidence(evidence));

  const insuffIdx = src.indexOf("if (isInsufficientEvidence(evidence)");
  const callerIdx = src.indexOf("const caller: AiCaller = makeAnthropicCaller");
  assert(insuffIdx > 0 && callerIdx > insuffIdx);
  const between = src.slice(insuffIdx, callerIdx);
  assert(between.includes("INSUFFICIENT_EVIDENCE"));
  assert(between.includes("data_unavailable"));
  assert(!between.includes("buildAiPrompt("));
});

Deno.test("successful path still constructs the Anthropic caller after both gates", () => {
  const r = evaluateSufficiency({
    quality: okQuality,
    price: 100, priorClose: 99, volume: 1000, quoteValid: true,
  });
  assert(r.ok);

  const quote = validateQuote({
    symbol: "AAPL",
    price: 189.4,
    lastTradePrice: 189.4,
    dayClose: 189.2,
    volume: 8_000_000,
    quoteTimestamp: "2026-08-29T14:00:00.000Z",
  });
  const evidence = buildAiEvidence({
    symbol: "AAPL",
    quote,
    rvol: 1.8,
    rvolAvailable: true,
    signals: [{ signal_id: "sig.trend_up", label: "Uptrend", direction: "bullish" }],
    catalysts: [{
      title: "AAPL product event",
      attribution: "direct",
      ticker_specific: true,
      source_url: "https://example.com/a",
      provider: "Reuters",
      published_at: "2026-08-29T13:00:00.000Z",
      reason: "ticker_specific",
    }],
    earnings: { symbol: "AAPL", event_date: "2026-09-01", time_of_day: null, estimate_eps: null, actual_eps: null },
    evidenceCutoff: "2026-08-29T14:00:00.000Z",
  });
  assertEquals(isInsufficientEvidence(evidence), false);

  assert(src.includes("const caller: AiCaller = makeAnthropicCaller(anthropicKey);"));
  assert(src.includes("const prompt = buildAiPrompt("));
});
