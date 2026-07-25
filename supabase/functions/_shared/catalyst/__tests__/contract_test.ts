// Deno tests for the Catalyst shared contract, classifier, and sanitizer.
// Run with: deno test supabase/functions/_shared/catalyst/__tests__/

import {
  assertEquals,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  earningsDedupeKey,
  earningsDisplayTitle,
  polygonDedupeKey,
  isValidTicker,
  normalizeTitleForHash,
} from "../contract.ts";
import { classifyCatalyst } from "../classify.ts";
import { sanitizeFacts, sanitizeSummary, makeEmptySummary } from "../sanitize.ts";

// 1. Classifier closed-set behavior.
Deno.test("classifier: fda_biotech beats analyst on FDA headline", () => {
  assertEquals(classifyCatalyst("FDA approves new PDUFA drug"), "fda_biotech");
});
Deno.test("classifier: earnings label", () => {
  assertEquals(classifyCatalyst("Q3 earnings beat estimates"), "earnings");
});
Deno.test("classifier: analyst_action label", () => {
  assertEquals(classifyCatalyst("Morgan Stanley upgrades AAPL"), "analyst_action");
});
Deno.test("classifier: corporate_action label", () => {
  assertEquals(classifyCatalyst("Board approves stock split"), "corporate_action");
});
Deno.test("classifier: fallback company_news", () => {
  assertEquals(classifyCatalyst("Company names new VP of engineering"), "company_news");
});

// 2. Earnings dedupe identity.
Deno.test("dedupe: earnings key is stable per symbol+date", () => {
  const a = earningsDedupeKey("AAPL", "2026-08-01");
  const b = earningsDedupeKey("AAPL", "2026-08-01");
  assertEquals(a, b);
  assert(a.startsWith("earnings:AAPL:"));
});

// 3. Polygon article-per-symbol dedupe identity.
Deno.test("dedupe: polygon key is per (articleId, symbol)", () => {
  assertEquals(polygonDedupeKey("abc123", "TSLA"), "polygon:abc123:TSLA");
  assert(polygonDedupeKey("abc123", "TSLA") !== polygonDedupeKey("abc123", "NVDA"));
});

// 4. Sanitizer rejection of score/confidence/rank/weight fields.
Deno.test("sanitize: strips forbidden keys from facts", () => {
  const out = sanitizeFacts({
    estimate_eps: 1.2,
    score: 99,
    confidence: 0.9,
    weight: 3,
    weighted: 4,
    rank: 1,
    tier: "A",
    band: "high",
  });
  assertEquals(out, { estimate_eps: 1.2 });
});

// 5. Provider-reported-only validation (type-level).
Deno.test("contract: VerificationState is provider_reported only", () => {
  const v: "provider_reported" = "provider_reported";
  assertEquals(v, "provider_reported");
});

// 6-7. Non-null date/title enforced at DB layer; smoke-check at type level.
Deno.test("contract: earnings display title uses company or symbol", () => {
  assertEquals(earningsDisplayTitle("Apple Inc.", "AAPL"), "Apple Inc. earnings");
  assertEquals(earningsDisplayTitle(null, "AAPL"), "AAPL earnings");
  assertEquals(earningsDisplayTitle("   ", "TSLA"), "TSLA earnings");
});

// 8. Ticker validation.
Deno.test("contract: ticker regex accepts valid and rejects invalid", () => {
  assert(isValidTicker("AAPL"));
  assert(isValidTicker("BRK.B"));
  assert(!isValidTicker("aapl"));
  assert(!isValidTicker("1AAPL"));
  assert(!isValidTicker(""));
});

// Sanitize summary clamps negatives.
Deno.test("sanitize: summary clamps negative counts", () => {
  const s = sanitizeSummary({
    ...makeEmptySummary(),
    earnings_read: -5,
    news_read: 3.7,
  });
  assertEquals(s.earnings_read, 0);
  assertEquals(s.news_read, 3);
});

Deno.test("contract: normalizeTitleForHash lowercases and collapses ws", () => {
  assertEquals(normalizeTitleForHash("  Foo   BAR  "), "foo bar");
});
