import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  evaluateGappersEvidence,
  evaluateNhlEvidence,
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

Deno.test("gappers: empty upstream universe is not evaluated", () => {
  const evidence = evaluateGappersEvidence([], []);
  assertEquals(evidence.status, "prerequisite_unavailable");
  assertEquals(evidence.reason, "upstream_universe_empty");
  assertEquals(evidence.universe_count, 0);
});

Deno.test("gappers: zero calculable rows blocks evaluation", () => {
  const universe = [
    ticker("AAA", { day: { o: undefined, c: 10, v: 1_000_000 }, prevDay: { c: 9, v: 1 } }),
    ticker("BBB", { day: { c: 5, v: 2_000_000 }, prevDay: { c: undefined, v: 1 } }),
  ];
  const evidence = evaluateGappersEvidence(universe, []);
  assertEquals(evidence.status, "prerequisite_unavailable");
  assertEquals(evidence.reason, "prior_close_gap_inputs_unavailable");
});

Deno.test("gappers: incomplete coverage across volume-active symbols is not evaluated", () => {
  const universe = [
    ticker("AAA", { day: { o: 10.8, c: 10.9, v: 1_000_000 }, prevDay: { c: 10, v: 1 } }),
    ticker("BBB", { day: { o: undefined, c: 5, v: 2_000_000 }, prevDay: { c: 5, v: 1 } }),
  ];
  const evidence = evaluateGappersEvidence(universe, []);
  assertEquals(evidence.status, "prerequisite_unavailable");
  assertEquals(evidence.reason, "gap_input_coverage_incomplete");
  assertEquals(evidence.volume_positive_count, 2);
  assertEquals(evidence.gap_calculable_count, 1);
});

Deno.test("gappers: sufficient coverage with zero matches is evaluated", () => {
  const universe = [
    ticker("AAA", { day: { o: 10, c: 10.1, h: 10.2, l: 9.9, v: 1_000_000 }, prevDay: { c: 10, v: 1 } }),
    ticker("BBB", { day: { o: 5, c: 5.05, h: 5.1, l: 4.9, v: 2_000_000 }, prevDay: { c: 5, v: 1 } }),
  ];
  const evidence = evaluateGappersEvidence(universe, []);
  assertEquals(evidence.status, "evaluated");
  assertEquals(evidence.gap_calculable_count, evidence.volume_positive_count);
  assertEquals(evidence.qualified_count, 0);
});

Deno.test("gappers: valid matches remain evaluated without changing qualification", () => {
  const qualified = ticker("HIGH", {
    day: { o: 10.8, c: 10.9, h: 11, l: 9.5, v: 1_000_000 },
    prevDay: { c: 10, v: 1 },
  });
  const unqualified = ticker("LOW", {
    day: { o: 10.2, c: 10.3, h: 10.4, l: 10, v: 500_000 },
    prevDay: { c: 10, v: 1 },
  });
  const evidence = evaluateGappersEvidence([unqualified, qualified], [qualified]);
  assertEquals(evidence.status, "evaluated");
  assertEquals(evidence.qualified_count, 1);
  assertEquals(evidence.selected_count, 1);
});

Deno.test("nhl: empty baseline generation is not treated as available", () => {
  const evidence = evaluateNhlEvidence([], new Map(), "available", []);
  assertEquals(evidence.status, "not_evaluated");
  assertEquals(evidence.baseline_status, "initializing");
  assertEquals(evidence.reason, "baseline_quotes_empty");
});

Deno.test("nhl: available baseline with zero evaluated securities is not evaluated", () => {
  const baseline: NhlBaselineQuote = {
    symbol: "ZZZ",
    high_52w: 20,
    low_52w: 5,
    sessions_observed: 30,
  };
  const evidence = evaluateNhlEvidence(
    [ticker("AAA", { day: { c: 10, h: 12, l: 8, v: 1_000_000 }, prevDay: { c: 9, v: 1 } })],
    new Map([["ZZZ", baseline]]),
    "available",
    [],
  );
  assertEquals(evidence.status, "not_evaluated");
  assertEquals(evidence.evaluated_count, 0);
  assertEquals(evidence.reason, "baseline_coverage_empty");
});

Deno.test("nhl: partial baseline coverage can still evaluate matched symbols", () => {
  const baseline: NhlBaselineQuote = {
    symbol: "AAA",
    high_52w: 20,
    low_52w: 5,
    sessions_observed: 30,
  };
  const evidence = evaluateNhlEvidence(
    [ticker("AAA", { day: { c: 10, h: 12, l: 8, v: 1_000_000 }, prevDay: { c: 9, v: 1 } })],
    new Map([["AAA", baseline]]),
    "available",
    [],
  );
  assertEquals(evidence.status, "evaluated");
  assertEquals(evidence.evaluated_count, 1);
  assertEquals(evidence.qualified_count, 0);
  assertEquals(evidence.baseline_quote_count, 1);
});

Deno.test("nhl: baseline initializing is not evaluated", () => {
  const evidence = evaluateNhlEvidence([], new Map(), "initializing", []);
  assertEquals(evidence.status, "not_evaluated");
  assertEquals(evidence.reason, "baseline_initializing");
});

Deno.test("nhl: baseline unavailable is not evaluated", () => {
  const evidence = evaluateNhlEvidence([], new Map(), "unavailable", []);
  assertEquals(evidence.status, "not_evaluated");
  assertEquals(evidence.baseline_status, "unavailable");
});

Deno.test("nhl: legitimate zero matches require evaluated coverage", () => {
  const baseline: NhlBaselineQuote = {
    symbol: "AAA",
    high_52w: 20,
    low_52w: 5,
    sessions_observed: 30,
  };
  const evidence = evaluateNhlEvidence(
    [ticker("AAA", { day: { c: 10, h: 12, l: 8, v: 1_000_000 }, prevDay: { c: 9, v: 1 } })],
    new Map([["AAA", baseline]]),
    "available",
    [],
  );
  assertEquals(evidence.status, "evaluated");
  assertEquals(evidence.evaluated_count, 1);
  assertEquals(evidence.qualified_count, 0);
});
