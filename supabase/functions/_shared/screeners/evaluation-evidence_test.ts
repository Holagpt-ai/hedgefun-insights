import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  evaluateGappersEvidence,
  evaluateNhlEvidence,
  GAPPERS_MIN_USABLE_SHARE,
} from "./evaluation-evidence.ts";
import type { NhlBaselineQuote } from "./new-highs-lows.ts";
import type { PolygonTicker } from "./selection.ts";

function ticker(
  sym: string,
  overrides: Partial<PolygonTicker> = {},
): PolygonTicker {
  return {
    ticker: sym,
    day: { o: 10, c: 10.5, h: 11, l: 9.5, v: 1_000_000 },
    prevDay: { c: 9, v: 100_000 },
    ...overrides,
  };
}

Deno.test("gappers: evaluated zero-match when prerequisites exist but none qualify", () => {
  const universe = [
    ticker("AAA", { day: { o: 10, c: 10.1, h: 10.2, l: 9.9, v: 1_000_000 }, prevDay: { c: 10, v: 1 } }),
    ticker("BBB", { day: { o: 5, c: 5.05, h: 5.1, l: 4.9, v: 2_000_000 }, prevDay: { c: 5, v: 1 } }),
  ];
  const evidence = evaluateGappersEvidence(universe, []);
  assertEquals(evidence.status, "evaluated");
  assertEquals(evidence.gap_calculable_count, 2);
  assertEquals(evidence.qualified_count, 0);
  assertEquals(evidence.selected_count, 0);
});

Deno.test("gappers: prerequisite unavailable when gap inputs are missing", () => {
  const universe = [
    ticker("AAA", { day: { o: undefined, c: 10, v: 1_000_000 }, prevDay: { c: 9, v: 1 } }),
    ticker("BBB", { day: { c: 5, v: 2_000_000 }, prevDay: { c: undefined, v: 1 } }),
  ];
  const evidence = evaluateGappersEvidence(universe, []);
  assertEquals(evidence.status, "prerequisite_unavailable");
  assertEquals(evidence.reason, "prior_close_gap_inputs_unavailable");
});

Deno.test("gappers: threshold and sorting contract unchanged for qualified rows", () => {
  const universe = [
    ticker("LOW", { day: { o: 10.2, c: 10.3, h: 10.4, l: 10, v: 500_000 }, prevDay: { c: 10, v: 1 } }),
    ticker("HIGH", { day: { o: 10.8, c: 10.9, h: 11, l: 9.5, v: 1_000_000 }, prevDay: { c: 10, v: 1 } }),
  ];
  const evidence = evaluateGappersEvidence(universe, [universe[1]]);
  assertEquals(evidence.qualified_count, 1);
  assertEquals(evidence.selected_count, 1);
  assertEquals(GAPPERS_MIN_USABLE_SHARE, 0.01);
});

Deno.test("nhl: baseline available with zero qualified is evaluated", () => {
  const baseline: NhlBaselineQuote = {
    symbol: "AAA",
    high_52w: 20,
    low_52w: 5,
    sessions_observed: 30,
  };
  const baselines = new Map([["AAA", baseline]]);
  const universe = [
    ticker("AAA", { day: { c: 10, h: 12, l: 8, v: 1_000_000 }, prevDay: { c: 9, v: 1 } }),
  ];
  const evidence = evaluateNhlEvidence(universe, baselines, "available", []);
  assertEquals(evidence.status, "evaluated");
  assertEquals(evidence.baseline_status, "available");
  assertEquals(evidence.qualified_count, 0);
});

Deno.test("nhl: baseline initializing is not evaluated", () => {
  const evidence = evaluateNhlEvidence([], new Map(), "initializing", []);
  assertEquals(evidence.status, "not_evaluated");
  assertEquals(evidence.reason, "baseline_initializing");
});

Deno.test("nhl: row count alone cannot override baseline unavailable", () => {
  const evidence = evaluateNhlEvidence([], new Map(), "unavailable", []);
  assertEquals(evidence.status, "not_evaluated");
  assertEquals(evidence.baseline_status, "unavailable");
});
