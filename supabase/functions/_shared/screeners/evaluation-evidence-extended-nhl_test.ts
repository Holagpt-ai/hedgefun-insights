import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE } from "./baseline-coverage.ts";
import { evaluateNhlEvidence } from "./evaluation-evidence.ts";
import type { NhlBaselineQuote } from "./new-highs-lows.ts";
import type { PolygonTicker } from "./selection.ts";

function quote(symbol: string): NhlBaselineQuote {
  return { symbol, high_52w: 20, low_52w: 5, sessions_observed: 200 };
}

Deno.test("nhl evidence: extended session counts volume-active symbols without day.c", () => {
  const t: PolygonTicker = {
    ticker: "PM",
    updated: 1_752_000_000_000_000_000,
    day: { v: 2_000_000, h: 21, l: 9 },
    prevDay: { c: 10, v: 100_000 },
    lastTrade: { p: 12 },
  };
  const evidence = evaluateNhlEvidence(
    [t],
    new Map([["PM", quote("PM")]]),
    "available",
    [],
    POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE,
    true,
  );
  assertEquals(evidence.status, "evaluated");
  assertEquals(evidence.eligible_count, 1);
  assertEquals(evidence.qualified_count, 1);
});
