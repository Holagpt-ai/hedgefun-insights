import { describe, expect, it } from "vitest";
import { SCREENER_FILTER_VERSION } from "@/config/screener-filters.config";
import {
  applyScreenerFilters,
  evaluateScreenerCandidate,
  validateScreenerFilterSet,
} from "@/lib/screeners/filters";
import type {
  ScreenerFilterCandidate,
  ScreenerFilterClause,
  ScreenerFilterSet,
} from "@/types/screener-filters";

function candidate(
  symbol: string,
  discoveryRank: number,
  overrides: Partial<ScreenerFilterCandidate> = {},
): ScreenerFilterCandidate {
  return { symbol, discoveryRank, ...overrides };
}

function filterSet(
  filters: ScreenerFilterClause[],
  id = "test",
): ScreenerFilterSet {
  return { id, combinator: "AND", filters };
}

const discoveryBoard: ScreenerFilterCandidate[] = [
  candidate("ABC", 1, { price: 8, currentSessionVolume: 2_000_000, rvol20d: 1 }),
  candidate("XYZ", 2, { price: 12, currentSessionVolume: 1_500_000, rvol20d: 4 }),
  candidate("DEF", 3, { price: 3, currentSessionVolume: 900_000, rvol20d: 2 }),
  candidate("QQQ", 4, { price: 15, currentSessionVolume: 1_200_000, rvol20d: 6 }),
  candidate("LMN", 5, { price: 9, currentSessionVolume: 800_000, rvol20d: 3 }),
];

describe("Screener Filter engine — ranking contract", () => {
  it("1. preserves input ordering", () => {
    const result = applyScreenerFilters(
      discoveryBoard,
      filterSet([{ id: "min-price", field: "price", operator: "GTE", value: 1 }]),
    );
    expect(result.passed.map((row) => row.symbol)).toEqual(["ABC", "XYZ", "DEF", "QQQ", "LMN"]);
  });

  it("2. preserves original Discovery ranks", () => {
    const result = applyScreenerFilters(
      discoveryBoard,
      filterSet([{ id: "min-price", field: "price", operator: "GTE", value: 1 }]),
    );
    expect(result.passed.map((row) => row.discoveryRank)).toEqual([1, 2, 3, 4, 5]);
  });

  it("43. filtered result can contain non-consecutive Discovery ranks", () => {
    const result = applyScreenerFilters(
      [
        candidate("ABC", 1, { price: 1 }),
        candidate("XYZ", 2, { price: 10 }),
        candidate("DEF", 3, { price: 1 }),
        candidate("QQQ", 4, { price: 12 }),
      ],
      filterSet([{ id: "min-price", field: "price", operator: "GTE", value: 5 }]),
    );
    expect(result.passed.map((row) => row.symbol)).toEqual(["XYZ", "QQQ"]);
    expect(result.passed.map((row) => row.discoveryRank)).toEqual([2, 4]);
  });

  it("42. does not automatically sort by Trade Quality", () => {
    const rows = [
      candidate("LOW", 1, { tradeQualityScore: 40, price: 5 }),
      candidate("HIGH", 2, { tradeQualityScore: 95, price: 5 }),
      candidate("MID", 3, { tradeQualityScore: 70, price: 5 }),
    ];
    const result = applyScreenerFilters(
      rows,
      filterSet([{ id: "min-tq", field: "tradeQualityScore", operator: "GTE", value: 40 }]),
    );
    expect(result.passed.map((row) => row.symbol)).toEqual(["LOW", "HIGH", "MID"]);
  });
});

describe("Screener Filter engine — numeric fields", () => {
  it("3. price minimum", () => {
    const result = applyScreenerFilters(
      [candidate("A", 1, { price: 1.99 }), candidate("B", 2, { price: 2 })],
      filterSet([{ id: "min-price", field: "price", operator: "GTE", value: 2 }]),
    );
    expect(result.passed.map((row) => row.symbol)).toEqual(["B"]);
  });

  it("4. price maximum", () => {
    const result = applyScreenerFilters(
      [candidate("A", 1, { price: 20 }), candidate("B", 2, { price: 20.01 })],
      filterSet([{ id: "max-price", field: "price", operator: "LTE", value: 20 }]),
    );
    expect(result.passed.map((row) => row.symbol)).toEqual(["A"]);
  });

  it("5. price BETWEEN", () => {
    const result = applyScreenerFilters(
      [
        candidate("LOW", 1, { price: 1.5 }),
        candidate("IN", 2, { price: 8 }),
        candidate("HIGH", 3, { price: 25 }),
      ],
      filterSet([{ id: "price-band", field: "price", operator: "BETWEEN", min: 2, max: 20 }]),
    );
    expect(result.passed.map((row) => row.symbol)).toEqual(["IN"]);
  });

  it("6. volume threshold", () => {
    const result = applyScreenerFilters(
      [
        candidate("A", 1, { currentSessionVolume: 99_999 }),
        candidate("B", 2, { currentSessionVolume: 100_000 }),
      ],
      filterSet([{ id: "min-vol", field: "currentSessionVolume", operator: "GTE", value: 100_000 }]),
    );
    expect(result.passed.map((row) => row.symbol)).toEqual(["B"]);
  });

  it("7. dollar-volume threshold uses canonical calculator when needed", () => {
    const result = applyScreenerFilters(
      [
        candidate("A", 1, { price: 10, currentSessionVolume: 100_000 }),
        candidate("B", 2, { price: 10, currentSessionVolume: 1_000_000 }),
      ],
      filterSet([{ id: "min-dv", field: "dollarVolume", operator: "GTE", value: 5_000_000 }]),
    );
    expect(result.passed.map((row) => row.symbol)).toEqual(["B"]);
  });

  it("8. signed move", () => {
    const result = applyScreenerFilters(
      [candidate("DOWN", 1, { movePct: -8 }), candidate("UP", 2, { movePct: 8 })],
      filterSet([{ id: "min-move", field: "movePct", operator: "GTE", value: 5 }]),
    );
    expect(result.passed.map((row) => row.symbol)).toEqual(["UP"]);
  });

  it("9. absolute move is a distinct field", () => {
    const down = candidate("DOWN", 1, { movePct: -12, absoluteMovePct: 12 });
    const small = candidate("SMALL", 2, { movePct: 4, absoluteMovePct: 4 });
    const signedOnly = applyScreenerFilters(
      [down, small],
      filterSet([{ id: "signed", field: "movePct", operator: "GTE", value: 10 }]),
    );
    expect(signedOnly.passed).toEqual([]);
    const absolute = applyScreenerFilters(
      [down, small],
      filterSet([{ id: "abs", field: "absoluteMovePct", operator: "GTE", value: 10 }]),
    );
    expect(absolute.passed.map((row) => row.symbol)).toEqual(["DOWN"]);
  });

  it("10. RVOL threshold", () => {
    const result = applyScreenerFilters(
      [candidate("A", 1, { rvol20d: 4.9 }), candidate("B", 2, { rvol20d: 5 })],
      filterSet([{ id: "min-rvol", field: "rvol20d", operator: "GTE", value: 5 }]),
    );
    expect(result.passed.map((row) => row.symbol)).toEqual(["B"]);
  });

  it("11. missing RVOL is DATA_UNAVAILABLE", () => {
    const evaluation = evaluateScreenerCandidate(
      candidate("A", 1, { rvol20d: null }),
      filterSet([{ id: "min-rvol", field: "rvol20d", operator: "GTE", value: 5 }]),
    );
    expect(evaluation.passes).toBe(false);
    expect(evaluation.failures[0]).toMatchObject({
      field: "rvol20d",
      reason: "DATA_UNAVAILABLE",
    });
  });

  it("12. Vol/Prior is independent from RVOL", () => {
    const row = candidate("A", 1, { rvol20d: 8, volumeRatioPrior: 1.2 });
    const rvolPass = applyScreenerFilters(
      [row],
      filterSet([{ id: "min-rvol", field: "rvol20d", operator: "GTE", value: 5 }]),
    );
    const priorFail = applyScreenerFilters(
      [row],
      filterSet([{ id: "min-prior", field: "volumeRatioPrior", operator: "GTE", value: 5 }]),
    );
    expect(rvolPass.passed).toHaveLength(1);
    expect(priorFail.passed).toHaveLength(0);
    expect(priorFail.evaluations[0]?.failures[0]?.field).toBe("volumeRatioPrior");
    expect(priorFail.evaluations[0]?.failures[0]?.reason).toBe("VALUE_OUT_OF_RANGE");
  });

  it("13. float threshold", () => {
    const result = applyScreenerFilters(
      [
        candidate("LOW", 1, { float: 5_000_000 }),
        candidate("HIGH", 2, { float: 50_000_000 }),
      ],
      filterSet([{ id: "max-float", field: "float", operator: "LTE", value: 10_000_000 }]),
    );
    expect(result.passed.map((row) => row.symbol)).toEqual(["LOW"]);
  });

  it("14. missing float is DATA_UNAVAILABLE and is not treated as zero", () => {
    const evaluation = evaluateScreenerCandidate(
      candidate("A", 1, { float: null }),
      filterSet([{ id: "max-float", field: "float", operator: "LTE", value: 10_000_000 }]),
    );
    expect(evaluation.passes).toBe(false);
    expect(evaluation.failures[0]?.reason).toBe("DATA_UNAVAILABLE");
  });

  it("15. float turnover", () => {
    const result = applyScreenerFilters(
      [
        candidate("A", 1, { currentSessionVolume: 400_000, float: 1_000_000 }),
        candidate("B", 2, { currentSessionVolume: 1_000_000, float: 1_000_000 }),
      ],
      filterSet([{ id: "min-turn", field: "floatTurnover", operator: "GTE", value: 1 }]),
    );
    expect(result.passed.map((row) => row.symbol)).toEqual(["B"]);
  });

  it("16. Trade Quality threshold uses official score", () => {
    const result = applyScreenerFilters(
      [
        candidate("A", 1, { tradeQualityScore: 69, tradeQualityLabel: "MODERATE" }),
        candidate("B", 2, { tradeQualityScore: 70, tradeQualityLabel: "STRONG" }),
      ],
      filterSet([{ id: "min-tq", field: "tradeQualityScore", operator: "GTE", value: 70 }]),
    );
    expect(result.passed.map((row) => row.symbol)).toEqual(["B"]);
  });

  it("17. incomplete/null Trade Quality is DATA_UNAVAILABLE", () => {
    const incomplete = evaluateScreenerCandidate(
      candidate("A", 1, { tradeQualityScore: 82, tradeQualityLabel: "INCOMPLETE" }),
      filterSet([{ id: "min-tq", field: "tradeQualityScore", operator: "GTE", value: 70 }]),
    );
    const missing = evaluateScreenerCandidate(
      candidate("B", 2, { tradeQualityScore: null }),
      filterSet([{ id: "min-tq", field: "tradeQualityScore", operator: "GTE", value: 70 }]),
    );
    expect(incomplete.failures[0]?.reason).toBe("DATA_UNAVAILABLE");
    expect(missing.failures[0]?.reason).toBe("DATA_UNAVAILABLE");
  });

  it("20. spread threshold", () => {
    const result = applyScreenerFilters(
      [candidate("A", 1, { spreadPct: 1.2 }), candidate("B", 2, { spreadPct: 0.8 })],
      filterSet([{ id: "max-spread", field: "spreadPct", operator: "LTE", value: 1 }]),
    );
    expect(result.passed.map((row) => row.symbol)).toEqual(["B"]);
  });

  it("21. missing spread is DATA_UNAVAILABLE", () => {
    const evaluation = evaluateScreenerCandidate(
      candidate("A", 1),
      filterSet([{ id: "max-spread", field: "spreadPct", operator: "LTE", value: 1 }]),
    );
    expect(evaluation.failures[0]?.reason).toBe("DATA_UNAVAILABLE");
  });

  it("22. market cap", () => {
    const result = applyScreenerFilters(
      [candidate("A", 1, { marketCap: 80_000_000 }), candidate("B", 2, { marketCap: 500_000_000 })],
      filterSet([{ id: "min-cap", field: "marketCap", operator: "GTE", value: 100_000_000 }]),
    );
    expect(result.passed.map((row) => row.symbol)).toEqual(["B"]);
  });

  it("24. HOD proximity", () => {
    const result = applyScreenerFilters(
      [
        candidate("FAR", 1, { distanceFromHodPct: 8 }),
        candidate("NEAR", 2, { distanceFromHodPct: 1.5 }),
      ],
      filterSet([{ id: "near-hod", field: "distanceFromHodPct", operator: "LTE", value: 3 }]),
    );
    expect(result.passed.map((row) => row.symbol)).toEqual(["NEAR"]);
  });
});

describe("Screener Filter engine — categorical and tri-state", () => {
  it("18. catalyst NONE vs UNKNOWN", () => {
    const none = evaluateScreenerCandidate(
      candidate("NONE", 1, { catalystQuality: "NONE" }),
      filterSet([{ id: "has-cat", field: "catalystPresence", operator: "IS_TRUE" }]),
    );
    const unknown = evaluateScreenerCandidate(
      candidate("UNK", 2, { catalystQuality: "UNKNOWN" }),
      filterSet([{ id: "has-cat", field: "catalystPresence", operator: "IS_TRUE" }]),
    );
    expect(none.failures[0]?.reason).toBe("VALUE_NOT_ALLOWED");
    expect(unknown.failures[0]?.reason).toBe("DATA_UNAVAILABLE");
  });

  it("19. catalyst IN operator", () => {
    const result = applyScreenerFilters(
      [
        candidate("S", 1, { catalystQuality: "STRONG" }),
        candidate("W", 2, { catalystQuality: "WEAK" }),
        candidate("N", 3, { catalystQuality: "NONE" }),
      ],
      filterSet([
        {
          id: "cat-in",
          field: "catalystQuality",
          operator: "IN",
          values: ["STRONG", "MODERATE"],
        },
      ]),
    );
    expect(result.passed.map((row) => row.symbol)).toEqual(["S"]);
  });

  it("23. VWAP state", () => {
    const result = applyScreenerFilters(
      [
        candidate("ABOVE", 1, { vwapState: "above" }),
        candidate("BELOW", 2, { vwapState: "below" }),
      ],
      filterSet([{ id: "vwap", field: "vwapState", operator: "EQ", value: "above" }]),
    );
    expect(result.passed.map((row) => row.symbol)).toEqual(["ABOVE"]);
  });

  it("25. instrument type uses metadata codes", () => {
    const result = applyScreenerFilters(
      [
        candidate("CS1", 1, { instrumentType: "CS" }),
        candidate("ETF1", 2, { instrumentType: "ETF" }),
      ],
      filterSet([{ id: "eq-cs", field: "instrumentType", operator: "EQ", value: "CS" }]),
    );
    expect(result.passed.map((row) => row.symbol)).toEqual(["CS1"]);
  });

  it("26. unknown instrument type is distinct from a known excluded type", () => {
    const unknown = evaluateScreenerCandidate(
      candidate("UNK", 1, { instrumentType: null }),
      filterSet([
        { id: "not-warrant", field: "instrumentType", operator: "NOT_IN", values: ["WARRANT"] },
      ]),
    );
    const warrant = evaluateScreenerCandidate(
      candidate("WRT", 2, { instrumentType: "WARRANT" }),
      filterSet([
        { id: "not-warrant", field: "instrumentType", operator: "NOT_IN", values: ["WARRANT"] },
      ]),
    );
    expect(unknown.failures[0]?.reason).toBe("DATA_UNAVAILABLE");
    expect(warrant.failures[0]?.reason).toBe("VALUE_NOT_ALLOWED");
  });

  it("44. does not infer instrument type from ticker suffix", () => {
    const result = applyScreenerFilters(
      [
        candidate("ABCW", 1, { instrumentType: "CS" }),
        candidate("XYZ", 2, { instrumentType: "WARRANT" }),
      ],
      filterSet([{ id: "warrants", field: "instrumentType", operator: "EQ", value: "WARRANT" }]),
    );
    expect(result.passed.map((row) => row.symbol)).toEqual(["XYZ"]);
  });
});

describe("Screener Filter engine — missing data and diagnostics", () => {
  it("27. valid zero is not treated as unavailable", () => {
    const zero = evaluateScreenerCandidate(
      candidate("ZERO", 1, { currentSessionVolume: 0 }),
      filterSet([{ id: "min-vol", field: "currentSessionVolume", operator: "GTE", value: 100_000 }]),
    );
    const missing = evaluateScreenerCandidate(
      candidate("MISS", 2, { currentSessionVolume: null }),
      filterSet([{ id: "min-vol", field: "currentSessionVolume", operator: "GTE", value: 100_000 }]),
    );
    expect(zero.failures[0]?.reason).toBe("VALUE_OUT_OF_RANGE");
    expect(missing.failures[0]?.reason).toBe("DATA_UNAVAILABLE");
  });

  it("28. NaN candidate values are unavailable", () => {
    const evaluation = evaluateScreenerCandidate(
      candidate("A", 1, { price: Number.NaN }),
      filterSet([{ id: "min-price", field: "price", operator: "GTE", value: 2 }]),
    );
    expect(evaluation.failures[0]?.reason).toBe("DATA_UNAVAILABLE");
  });

  it("29. Infinity candidate values are unavailable", () => {
    const evaluation = evaluateScreenerCandidate(
      candidate("A", 1, { rvol20d: Number.POSITIVE_INFINITY }),
      filterSet([{ id: "min-rvol", field: "rvol20d", operator: "GTE", value: 2 }]),
    );
    expect(evaluation.failures[0]?.reason).toBe("DATA_UNAVAILABLE");
  });

  it("30. multiple filters AND together", () => {
    const result = applyScreenerFilters(
      [
        candidate("BOTH", 1, { price: 8, rvol20d: 6 }),
        candidate("PRICE", 2, { price: 8, rvol20d: 1 }),
        candidate("RVOL", 3, { price: 1, rvol20d: 6 }),
      ],
      filterSet([
        { id: "min-price", field: "price", operator: "GTE", value: 2 },
        { id: "min-rvol", field: "rvol20d", operator: "GTE", value: 5 },
      ]),
    );
    expect(result.passed.map((row) => row.symbol)).toEqual(["BOTH"]);
  });

  it("31. one failure rejects the candidate", () => {
    const evaluation = evaluateScreenerCandidate(
      candidate("A", 1, { price: 8, rvol20d: 1 }),
      filterSet([
        { id: "min-price", field: "price", operator: "GTE", value: 2 },
        { id: "min-rvol", field: "rvol20d", operator: "GTE", value: 5 },
      ]),
    );
    expect(evaluation.passes).toBe(false);
    expect(evaluation.failures).toHaveLength(1);
  });

  it("32. multiple failure reasons are returned", () => {
    const evaluation = evaluateScreenerCandidate(
      candidate("A", 1, { price: 1, rvol20d: 1 }),
      filterSet([
        { id: "min-price", field: "price", operator: "GTE", value: 2 },
        { id: "min-rvol", field: "rvol20d", operator: "GTE", value: 5 },
      ]),
    );
    expect(evaluation.failures).toHaveLength(2);
    expect(evaluation.failures.map((item) => item.reason)).toEqual([
      "VALUE_OUT_OF_RANGE",
      "VALUE_OUT_OF_RANGE",
    ]);
  });

  it("33. DATA_UNAVAILABLE diagnostic", () => {
    const evaluation = evaluateScreenerCandidate(
      candidate("A", 1, { float: null }),
      filterSet([{ id: "max-float", field: "float", operator: "LTE", value: 10_000_000 }]),
    );
    expect(evaluation.failures[0]).toMatchObject({
      filterId: "max-float",
      field: "float",
      reason: "DATA_UNAVAILABLE",
    });
  });

  it("34. VALUE_OUT_OF_RANGE diagnostic", () => {
    const evaluation = evaluateScreenerCandidate(
      candidate("A", 1, { spreadPct: 2.8 }),
      filterSet([{ id: "max-spread", field: "spreadPct", operator: "LTE", value: 1 }]),
    );
    expect(evaluation.failures[0]).toMatchObject({
      filterId: "max-spread",
      field: "spreadPct",
      reason: "VALUE_OUT_OF_RANGE",
      actual: 2.8,
    });
    expect(evaluation.failures[0]?.expected).toMatchObject({ operator: "LTE", value: 1 });
  });
});

describe("Screener Filter engine — validation and runtime contract", () => {
  it("35. invalid BETWEEN is rejected before evaluation", () => {
    const result = applyScreenerFilters(
      discoveryBoard,
      filterSet([{ id: "bad-between", field: "price", operator: "BETWEEN", min: 2 }]),
    );
    expect(result.ok).toBe(false);
    expect(result.passed).toEqual([]);
    expect(result.errors[0]?.reason).toBe("INVALID_FILTER");
  });

  it("36. invalid numeric bounds are rejected", () => {
    const nanValue = validateScreenerFilterSet(
      filterSet([{ id: "nan", field: "price", operator: "GTE", value: Number.NaN }]),
    );
    const infValue = validateScreenerFilterSet(
      filterSet([{ id: "inf", field: "price", operator: "LTE", value: Number.POSITIVE_INFINITY }]),
    );
    const inverted = validateScreenerFilterSet(
      filterSet([{ id: "flip", field: "price", operator: "BETWEEN", min: 20, max: 2 }]),
    );
    expect(nanValue.ok).toBe(false);
    expect(infValue.ok).toBe(false);
    expect(inverted.ok).toBe(false);
  });

  it("37. unsupported operator is rejected", () => {
    const result = validateScreenerFilterSet(
      filterSet([{ id: "bad-op", field: "price", operator: "IN", values: ["2"] }]),
    );
    expect(result.ok).toBe(false);
    expect(result.errors[0]?.message).toContain("not valid for price");
  });

  it("38. empty candidate set returns empty passed list", () => {
    const result = applyScreenerFilters(
      [],
      filterSet([{ id: "min-price", field: "price", operator: "GTE", value: 2 }]),
    );
    expect(result.ok).toBe(true);
    expect(result.passed).toEqual([]);
    expect(result.evaluations).toEqual([]);
  });

  it("39. empty filter set returns candidates unchanged", () => {
    const result = applyScreenerFilters(discoveryBoard, filterSet([]));
    expect(result.passed.map((row) => row.symbol)).toEqual(discoveryBoard.map((row) => row.symbol));
    expect(result.passed.map((row) => row.discoveryRank)).toEqual([1, 2, 3, 4, 5]);
  });

  it("40. repeated evaluation is deterministic", () => {
    const set = filterSet([{ id: "min-price", field: "price", operator: "GTE", value: 8 }]);
    const first = applyScreenerFilters(discoveryBoard, set);
    const second = applyScreenerFilters(discoveryBoard, set);
    expect(second).toEqual(first);
    expect(first.version).toBe(SCREENER_FILTER_VERSION);
  });

  it("41. does not mutate input candidates", () => {
    const input = discoveryBoard.map((row) => ({ ...row }));
    const snapshot = structuredClone(input);
    applyScreenerFilters(
      input,
      filterSet([{ id: "min-price", field: "price", operator: "GTE", value: 10 }]),
    );
    expect(input).toEqual(snapshot);
  });
});
