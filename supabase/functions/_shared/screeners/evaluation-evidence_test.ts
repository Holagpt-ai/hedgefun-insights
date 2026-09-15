import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { PolicyExclusionEvidence } from "./baseline-coverage.ts";
import {
  evaluateGappersEvidence,
  evaluateNhlEvidence,
  type HistoricalCoverageEvidence,
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

Deno.test("gappers: no volume-active universe blocks evaluation", () => {
  const universe = [
    ticker("AAA", { day: { o: 10, c: 10, v: 0 }, prevDay: { c: 9, v: 1 } }),
    ticker("BBB", { day: { c: 5, v: 0 }, prevDay: { c: 5, v: 1 } }),
  ];
  const evidence = evaluateGappersEvidence(universe, []);
  assertEquals(evidence.status, "prerequisite_unavailable");
  assertEquals(evidence.reason, "no_volume_active_universe");
  assertEquals(evidence.volume_positive_count, 0);
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

Deno.test("gappers: zero-volume calculable gap cannot compensate for missing active coverage", () => {
  const universe = [
    ticker("AAA", { day: { o: 10.8, c: 10.9, v: 1_000_000 }, prevDay: { c: 10, v: 1 } }),
    ticker("BBB", { day: { o: undefined, c: 5, v: 2_000_000 }, prevDay: { c: 5, v: 1 } }),
    ticker("CCC", { day: { o: 10.5, c: 10.6, v: 0 }, prevDay: { c: 10, v: 1 } }),
  ];
  const evidence = evaluateGappersEvidence(universe, []);
  assertEquals(evidence.status, "prerequisite_unavailable");
  assertEquals(evidence.reason, "gap_input_coverage_incomplete");
  assertEquals(evidence.volume_positive_count, 2);
  assertEquals(evidence.gap_calculable_count, 1);
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

Deno.test("gappers: selected_count tracks selected rows independently of qualified_count", () => {
  const qualified = ticker("HIGH", {
    day: { o: 10.8, c: 10.9, h: 11, l: 9.5, v: 1_000_000 },
    prevDay: { c: 10, v: 1 },
  });
  const unqualified = ticker("LOW", {
    day: { o: 10.2, c: 10.3, h: 10.4, l: 10, v: 500_000 },
    prevDay: { c: 10, v: 1 },
  });
  const evidence = evaluateGappersEvidence([unqualified, qualified], [qualified]);
  assertEquals(evidence.qualified_count, 1);
  assertEquals(evidence.selected_count, 1);
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

Deno.test("nhl: eligible snapshot without matching baseline is incomplete coverage", () => {
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
  assertEquals(evidence.eligible_count, 1);
  assertEquals(evidence.evaluated_count, 0);
  assertEquals(evidence.reason, "baseline_coverage_incomplete");
});

Deno.test("nhl: zero eligible snapshots is not evaluated", () => {
  const baseline: NhlBaselineQuote = {
    symbol: "AAA",
    high_52w: 20,
    low_52w: 5,
    sessions_observed: 30,
  };
  const evidence = evaluateNhlEvidence(
    [ticker("AAA", { day: { c: 10, v: 0 }, prevDay: { c: 9, v: 1 } })],
    new Map([["AAA", baseline]]),
    "available",
    [],
  );
  assertEquals(evidence.status, "not_evaluated");
  assertEquals(evidence.eligible_count, 0);
  assertEquals(evidence.evaluated_count, 0);
  assertEquals(evidence.reason, "baseline_coverage_empty");
});

Deno.test("nhl: missing day range excludes symbol from eligible_count", () => {
  const baseline: NhlBaselineQuote = {
    symbol: "AAA",
    high_52w: 20,
    low_52w: 5,
    sessions_observed: 30,
  };
  const evidence = evaluateNhlEvidence(
    [ticker("AAA", { day: { c: 10, v: 1_000_000 }, prevDay: { c: 9, v: 1 } })],
    new Map([["AAA", baseline]]),
    "available",
    [],
  );
  assertEquals(evidence.status, "not_evaluated");
  assertEquals(evidence.eligible_count, 0);
  assertEquals(evidence.reason, "baseline_coverage_empty");
});

Deno.test("nhl: full eligible coverage with matching baseline is evaluated", () => {
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
  assertEquals(evidence.eligible_count, 1);
  assertEquals(evidence.evaluated_count, 1);
  assertEquals(evidence.qualified_count, 0);
  assertEquals(evidence.baseline_quote_count, 1);
});

Deno.test("nhl: partial eligible baseline match fails closed", () => {
  const baselineA: NhlBaselineQuote = {
    symbol: "AAA",
    high_52w: 20,
    low_52w: 5,
    sessions_observed: 30,
  };
  const evidence = evaluateNhlEvidence(
    [
      ticker("AAA", { day: { c: 10, h: 12, l: 8, v: 1_000_000 }, prevDay: { c: 9, v: 1 } }),
      ticker("BBB", { day: { c: 8, h: 11, l: 7, v: 900_000 }, prevDay: { c: 8, v: 1 } }),
    ],
    new Map([["AAA", baselineA]]),
    "available",
    [],
  );
  assertEquals(evidence.status, "not_evaluated");
  assertEquals(evidence.eligible_count, 2);
  assertEquals(evidence.evaluated_count, 1);
  assertEquals(evidence.reason, "baseline_coverage_incomplete");
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
  assertEquals(evidence.eligible_count, 1);
  assertEquals(evidence.evaluated_count, 1);
  assertEquals(evidence.qualified_count, 0);
});

function exclusionEvidence(
  symbols: string[],
  minSessions = 120,
): PolicyExclusionEvidence {
  return {
    available: true,
    min_sessions: minSessions,
    excluded_count: symbols.length,
    symbols: new Set(symbols),
  };
}

function coverage(
  baselineSymbols: string[],
  excluded: string[] | null,
): HistoricalCoverageEvidence {
  return {
    baselineSymbols: new Set(baselineSymbols),
    policyExclusions: excluded === null
      ? {
        available: false,
        min_sessions: null,
        excluded_count: null,
        symbols: new Set(),
      }
      : exclusionEvidence(excluded),
  };
}

function quote(symbol: string): NhlBaselineQuote {
  return {
    symbol,
    high_52w: 20,
    low_52w: 5,
    sessions_observed: 120,
  };
}

Deno.test("nhl: baseline-backed eligible symbol is evaluated", () => {
  const evidence = evaluateNhlEvidence(
    [ticker("AAA")],
    new Map([["AAA", quote("AAA")]]),
    "available",
    [],
    exclusionEvidence([]),
  );
  assertEquals(evidence.status, "evaluated");
  assertEquals(evidence.evaluated_count, 1);
  assertEquals(evidence.policy_excluded_count, 0);
  assertEquals(evidence.unresolved_count, 0);
});

Deno.test("nhl: missing baseline + validated insufficient-session exclusion is policy_excluded", () => {
  const evidence = evaluateNhlEvidence(
    [ticker("AAA")],
    new Map([["ZZZ", quote("ZZZ")]]),
    "available",
    [],
    exclusionEvidence(["AAA"]),
  );
  assertEquals(evidence.status, "evaluated");
  assertEquals(evidence.eligible_count, 1);
  assertEquals(evidence.evaluated_count, 0);
  assertEquals(evidence.policy_excluded_count, 1);
  assertEquals(evidence.unresolved_count, 0);
  assertEquals(evidence.qualified_count, 0);
});

Deno.test("nhl: missing baseline + no exclusion is unresolved/fail closed", () => {
  const evidence = evaluateNhlEvidence(
    [ticker("AAA")],
    new Map([["ZZZ", quote("ZZZ")]]),
    "available",
    [],
    exclusionEvidence([]),
  );
  assertEquals(evidence.status, "not_evaluated");
  assertEquals(evidence.evaluated_count, 0);
  assertEquals(evidence.policy_excluded_count, 0);
  assertEquals(evidence.unresolved_count, 1);
  assertEquals(evidence.reason, "baseline_coverage_incomplete");
});

Deno.test("nhl: unavailable exclusion evidence with missing baseline fails closed", () => {
  const evidence = evaluateNhlEvidence(
    [ticker("AAA")],
    new Map([["ZZZ", quote("ZZZ")]]),
    "available",
    [],
  );
  assertEquals(evidence.status, "not_evaluated");
  assertEquals(evidence.unresolved_count, 1);
  assertEquals(evidence.reason, "baseline_coverage_incomplete");
});

Deno.test("nhl: complete evaluated + policy-excluded accounting is evaluated", () => {
  const evidence = evaluateNhlEvidence(
    [ticker("AAA"), ticker("BBB")],
    new Map([["AAA", quote("AAA")]]),
    "available",
    [],
    exclusionEvidence(["BBB"]),
  );
  assertEquals(evidence.status, "evaluated");
  assertEquals(evidence.eligible_count, 2);
  assertEquals(evidence.evaluated_count, 1);
  assertEquals(evidence.policy_excluded_count, 1);
  assertEquals(evidence.unresolved_count, 0);
  assertEquals(evidence.qualified_count, 0);
});

Deno.test("nhl: policy-excluded symbols are not counted as evaluated or qualified", () => {
  const highHit = ticker("BBB", {
    day: { o: 21, c: 21, h: 22, l: 20, v: 1_000_000 },
  });
  const evidence = evaluateNhlEvidence(
    [highHit],
    new Map([["ZZZ", quote("ZZZ")]]),
    "available",
    [],
    exclusionEvidence(["BBB"]),
  );
  assertEquals(evidence.status, "evaluated");
  assertEquals(evidence.evaluated_count, 0);
  assertEquals(evidence.policy_excluded_count, 1);
  assertEquals(evidence.qualified_count, 0);
});

Deno.test("nhl: qualifier behavior unchanged for baseline-backed symbols", () => {
  const highHit = ticker("AAA", {
    day: { o: 21, c: 21, h: 22, l: 20, v: 1_000_000 },
  });
  const evidence = evaluateNhlEvidence(
    [highHit],
    new Map([["AAA", quote("AAA")]]),
    "available",
    [],
    exclusionEvidence([]),
  );
  assertEquals(evidence.status, "evaluated");
  assertEquals(evidence.qualified_count, 1);
});

Deno.test("nhl: zero qualifier with complete accounting is evaluated", () => {
  const evidence = evaluateNhlEvidence(
    [ticker("AAA"), ticker("BBB")],
    new Map([["AAA", quote("AAA")]]),
    "available",
    [],
    exclusionEvidence(["BBB"]),
  );
  assertEquals(evidence.status, "evaluated");
  assertEquals(evidence.qualified_count, 0);
  assertEquals(evidence.selected_count, 0);
  assertEquals(
    evidence.evaluated_count! + evidence.policy_excluded_count!,
    evidence.eligible_count,
  );
});

Deno.test("gappers: normal valid prior close/open is calculable", () => {
  const evidence = evaluateGappersEvidence(
    [ticker("AAA")],
    [],
    coverage(["AAA"], []),
  );
  assertEquals(evidence.status, "evaluated");
  assertEquals(evidence.gap_calculable_count, 1);
  assertEquals(evidence.no_prior_session_count, 0);
  assertEquals(evidence.unresolved_gap_input_count, 0);
});

Deno.test("gappers: explicit zero prior aggregate + no historical coverage is no_prior_session", () => {
  const universe = [
    ticker("IPO", {
      day: { o: 10, c: 10.5, h: 11, l: 9.5, v: 1_000_000 },
      prevDay: { c: 0, v: 0 },
    }),
  ];
  const evidence = evaluateGappersEvidence(universe, [], coverage([], []));
  assertEquals(evidence.status, "prerequisite_unavailable");
  assertEquals(evidence.reason, "gap_inputs_not_applicable");
  assertEquals(evidence.gap_calculable_count, 0);
  assertEquals(evidence.no_prior_session_count, 1);
  assertEquals(evidence.unresolved_gap_input_count, 0);
});

Deno.test("gappers: explicit zero prior aggregate in included baseline is unresolved", () => {
  const universe = [
    ticker("AAA", {
      day: { o: 10, c: 10.5, h: 11, l: 9.5, v: 1_000_000 },
      prevDay: { c: 0, v: 0 },
    }),
  ];
  const evidence = evaluateGappersEvidence(
    universe,
    [],
    coverage(["AAA"], []),
  );
  assertEquals(evidence.status, "prerequisite_unavailable");
  assertEquals(evidence.reason, "prior_close_gap_inputs_unavailable");
  assertEquals(evidence.no_prior_session_count, 0);
  assertEquals(evidence.unresolved_gap_input_count, 1);
});

Deno.test("gappers: explicit zero prior aggregate in policy exclusions is unresolved", () => {
  const universe = [
    ticker("AAA", {
      day: { o: 10, c: 10.5, h: 11, l: 9.5, v: 1_000_000 },
      prevDay: { c: 0, v: 0 },
    }),
  ];
  const evidence = evaluateGappersEvidence(
    universe,
    [],
    coverage([], ["AAA"]),
  );
  assertEquals(evidence.status, "prerequisite_unavailable");
  assertEquals(evidence.no_prior_session_count, 0);
  assertEquals(evidence.unresolved_gap_input_count, 1);
});

Deno.test("gappers: absent/null prevDay is unresolved", () => {
  const universe = [
    ticker("AAA", {
      day: { o: 10, c: 10.5, h: 11, l: 9.5, v: 1_000_000 },
      prevDay: undefined,
    }),
  ];
  const evidence = evaluateGappersEvidence(universe, [], coverage([], []));
  assertEquals(evidence.unresolved_gap_input_count, 1);
  assertEquals(evidence.no_prior_session_count, 0);
  assertEquals(evidence.status, "prerequisite_unavailable");
});

Deno.test("gappers: missing day.o is unresolved", () => {
  const universe = [
    ticker("AAA", {
      day: { o: undefined, c: 10.5, h: 11, l: 9.5, v: 1_000_000 },
      prevDay: { c: 0, v: 0 },
    }),
  ];
  const evidence = evaluateGappersEvidence(universe, [], coverage([], []));
  assertEquals(evidence.unresolved_gap_input_count, 1);
  assertEquals(evidence.no_prior_session_count, 0);
  assertEquals(evidence.status, "prerequisite_unavailable");
});

Deno.test("gappers: complete calculable + structural not-applicable accounting is evaluated", () => {
  const universe = [
    ticker("CALC", {
      day: { o: 10, c: 10.1, h: 10.2, l: 9.9, v: 1_000_000 },
      prevDay: { c: 10, v: 1 },
    }),
    ticker("IPO", {
      day: { o: 8, c: 8.1, h: 8.2, l: 7.9, v: 500_000 },
      prevDay: { c: 0, v: 0 },
    }),
  ];
  const evidence = evaluateGappersEvidence(
    universe,
    [],
    coverage(["CALC"], []),
  );
  assertEquals(evidence.status, "evaluated");
  assertEquals(evidence.volume_positive_count, 2);
  assertEquals(evidence.gap_calculable_count, 1);
  assertEquals(evidence.no_prior_session_count, 1);
  assertEquals(evidence.unresolved_gap_input_count, 0);
  assertEquals(evidence.qualified_count, 0);
});

Deno.test("gappers: any unresolved symbol is prerequisite_unavailable", () => {
  const universe = [
    ticker("CALC", {
      day: { o: 10, c: 10.1, h: 10.2, l: 9.9, v: 1_000_000 },
      prevDay: { c: 10, v: 1 },
    }),
    ticker("MISS", {
      day: { o: undefined, c: 5, h: 5.1, l: 4.9, v: 400_000 },
      prevDay: { c: 5, v: 1 },
    }),
  ];
  const evidence = evaluateGappersEvidence(
    universe,
    [],
    coverage(["CALC"], []),
  );
  assertEquals(evidence.status, "prerequisite_unavailable");
  assertEquals(evidence.unresolved_gap_input_count, 1);
});

Deno.test("gappers: unavailable exclusion evidence cannot classify structural not-applicable", () => {
  const universe = [
    ticker("IPO", {
      day: { o: 10, c: 10.5, h: 11, l: 9.5, v: 1_000_000 },
      prevDay: { c: 0, v: 0 },
    }),
  ];
  const evidence = evaluateGappersEvidence(universe, [], coverage([], null));
  assertEquals(evidence.no_prior_session_count, 0);
  assertEquals(evidence.unresolved_gap_input_count, 1);
  assertEquals(evidence.status, "prerequisite_unavailable");
});

Deno.test("gappers: no calculable symbols cannot certify generic validated zero", () => {
  const universe = [
    ticker("IPO", {
      day: { o: 10, c: 10.5, h: 11, l: 9.5, v: 1_000_000 },
      prevDay: { c: 0, v: 0 },
    }),
  ];
  const evidence = evaluateGappersEvidence(universe, [], coverage([], []));
  assertEquals(evidence.status, "prerequisite_unavailable");
  assertEquals(evidence.gap_calculable_count, 0);
  assertEquals(evidence.no_prior_session_count, 1);
  assertEquals(evidence.reason, "gap_inputs_not_applicable");
});

Deno.test("gappers: Gap >=5% qualification unchanged", () => {
  const qualified = ticker("HIGH", {
    day: { o: 10.8, c: 10.9, h: 11, l: 9.5, v: 1_000_000 },
    prevDay: { c: 10, v: 1 },
  });
  const unqualified = ticker("LOW", {
    day: { o: 10.2, c: 10.3, h: 10.4, l: 10, v: 500_000 },
    prevDay: { c: 10, v: 1 },
  });
  const evidence = evaluateGappersEvidence(
    [unqualified, qualified],
    [qualified],
    coverage(["HIGH", "LOW"], []),
  );
  assertEquals(evidence.status, "evaluated");
  assertEquals(evidence.qualified_count, 1);
  assertEquals(evidence.selected_count, 1);
});
