import { describe, expect, it } from "vitest";
import {
  TRADE_QUALITY_COMPONENT_WEIGHTS,
  TRADE_QUALITY_MIN_COVERAGE_PCT,
  TRADE_QUALITY_TOTAL_WEIGHT,
} from "@/config/trade-quality.config";
import {
  calculateTradeQuality,
  compareTradeQualityCandidates,
  rankTradeQualityCandidates,
} from "@/lib/screeners/trade-quality";
import type { TradeQualityInput, TradeQualityRankInput } from "@/types/trade-quality";

function perfectInput(): TradeQualityInput {
  return {
    price: 10,
    currentSessionVolume: 10_000_000,
    absoluteMovePct: 25,
    catalystQuality: "STRONG",
    bid: 9.99,
    ask: 10.01,
    technical: {
      aboveVwap: "TRUE",
      holdingVwapAfterReclaim: "TRUE",
      nearHod: "TRUE",
      higherHighHigherLow: "TRUE",
      positiveMomentum: "TRUE",
    },
    publicFloat: 1_000_000,
    rvol20d: 12,
  };
}

function baseRankInput(
  symbol: string,
  discoveryRank: number,
  input: TradeQualityInput,
  overrides?: Partial<TradeQualityRankInput>,
): TradeQualityRankInput {
  return {
    symbol,
    discoveryRank,
    tradeQuality: calculateTradeQuality(input),
    dollarVolume: (input.price ?? 0) * (input.currentSessionVolume ?? 0),
    currentSessionVolume: input.currentSessionVolume,
    ...overrides,
  };
}

describe("Trade Quality V1 — calculateTradeQuality", () => {
  it("1. perfect candidate earns max normalized score", () => {
    const result = calculateTradeQuality(perfectInput());
    expect(result.score).toBe(100);
    expect(result.label).toBe("HIGH_QUALITY");
    expect(result.coveragePct).toBe(100);
    expect(result.availableWeight).toBe(TRADE_QUALITY_TOTAL_WEIGHT);
    expect(result.version).toBe("v1");
  });

  it("2. low-quality candidate scores below MODERATE threshold", () => {
    const result = calculateTradeQuality({
      price: 0.05,
      currentSessionVolume: 100_000,
      absoluteMovePct: 0.5,
      catalystQuality: "NONE",
      bid: 0.04,
      ask: 0.06,
      technical: {
        aboveVwap: "FALSE",
        holdingVwapAfterReclaim: "FALSE",
        nearHod: "FALSE",
        higherHighHigherLow: "FALSE",
        positiveMomentum: "FALSE",
      },
      publicFloat: 100_000_000,
      rvol20d: 0.5,
    });
    expect(result.score).not.toBeNull();
    expect((result.score as number) < 40).toBe(true);
    expect(result.label).toBe("LOW_QUALITY");
  });

  it("3. dollar-volume tier boundaries", () => {
    const tiers: Array<{ volume: number; expected: number }> = [
      { volume: 500_000, expected: 2 },
      { volume: 1_000_000, expected: 6 },
      { volume: 3_000_000, expected: 12 },
      { volume: 10_000_000, expected: 17 },
      { volume: 25_000_000, expected: 21 },
      { volume: 50_000_000, expected: 25 },
    ];
    for (const { volume, expected } of tiers) {
      const result = calculateTradeQuality({ price: 1, currentSessionVolume: volume });
      expect(result.components.dollarVolume.score).toBe(expected);
    }
  });

  it("4. movement tier boundaries use absolute move magnitude", () => {
    const tiers: Array<{ move: number; expected: number }> = [
      { move: 1.9, expected: 1 },
      { move: 2, expected: 4 },
      { move: 5, expected: 8 },
      { move: 10, expected: 12 },
      { move: 20, expected: 15 },
    ];
    for (const { move, expected } of tiers) {
      const result = calculateTradeQuality({ absoluteMovePct: move });
      expect(result.components.movement.score).toBe(expected);
    }
  });

  it("5. catalyst STRONG / MODERATE / WEAK / NONE / UNKNOWN", () => {
    expect(calculateTradeQuality({ catalystQuality: "STRONG" }).components.catalyst).toMatchObject({
      available: true,
      score: 15,
    });
    expect(
      calculateTradeQuality({ catalystQuality: "MODERATE" }).components.catalyst,
    ).toMatchObject({ available: true, score: 10 });
    expect(calculateTradeQuality({ catalystQuality: "WEAK" }).components.catalyst).toMatchObject({
      available: true,
      score: 5,
    });
    expect(calculateTradeQuality({ catalystQuality: "NONE" }).components.catalyst).toMatchObject({
      available: true,
      score: 0,
    });
    expect(
      calculateTradeQuality({ catalystQuality: "UNKNOWN" }).components.catalyst,
    ).toMatchObject({ available: false, score: null });
  });

  it("6. spread tier boundaries", () => {
    const cases: Array<{ bid: number; ask: number; expected: number }> = [
      { bid: 100, ask: 100.2, expected: 15 },
      { bid: 100, ask: 100.35, expected: 13 },
      { bid: 100, ask: 100.75, expected: 10 },
      { bid: 100, ask: 101.5, expected: 6 },
      { bid: 100, ask: 103, expected: 3 },
      { bid: 100, ask: 105, expected: 0 },
    ];
    for (const { bid, ask, expected } of cases) {
      const result = calculateTradeQuality({ bid, ask });
      expect(result.components.spread.score).toBe(expected);
    }
  });

  it("7. invalid bid/ask leaves spread unavailable", () => {
    expect(calculateTradeQuality({ bid: 0, ask: 10 }).components.spread.available).toBe(false);
    expect(calculateTradeQuality({ bid: 10, ask: 9 }).components.spread.available).toBe(false);
    expect(calculateTradeQuality({ bid: Number.NaN, ask: 10 }).components.spread.available).toBe(
      false,
    );
  });

  it("8. float-turnover tier boundaries", () => {
    const cases: Array<{ volume: number; floatShares: number; expected: number }> = [
      { volume: 100_000, floatShares: 1_000_000, expected: 1 },
      { volume: 250_000, floatShares: 1_000_000, expected: 3 },
      { volume: 500_000, floatShares: 1_000_000, expected: 5 },
      { volume: 1_500_000, floatShares: 1_000_000, expected: 7 },
      { volume: 3_000_000, floatShares: 1_000_000, expected: 9 },
      { volume: 5_000_000, floatShares: 1_000_000, expected: 10 },
    ];
    for (const { volume, floatShares, expected } of cases) {
      const result = calculateTradeQuality({
        currentSessionVolume: volume,
        publicFloat: floatShares,
      });
      expect(result.components.floatTurnover.score).toBe(expected);
    }
  });

  it("9. missing float leaves float turnover unavailable", () => {
    const result = calculateTradeQuality({ currentSessionVolume: 1_000_000, publicFloat: null });
    expect(result.components.floatTurnover).toMatchObject({ available: false, score: null });
  });

  it("10. RVOL 20D tier boundaries", () => {
    const tiers: Array<{ rvol: number; expected: number }> = [
      { rvol: 0.5, expected: 0 },
      { rvol: 1, expected: 1 },
      { rvol: 2, expected: 2 },
      { rvol: 3, expected: 3 },
      { rvol: 5, expected: 4 },
      { rvol: 10, expected: 5 },
    ];
    for (const { rvol, expected } of tiers) {
      const result = calculateTradeQuality({ rvol20d: rvol });
      expect(result.components.rvol20d.score).toBe(expected);
    }
  });

  it("11. missing RVOL leaves component unavailable", () => {
    expect(calculateTradeQuality({ rvol20d: null }).components.rvol20d.available).toBe(false);
  });

  it("12. price tradability tier boundaries", () => {
    const tiers: Array<{ price: number; expected: number }> = [
      { price: 0.05, expected: 0 },
      { price: 0.1, expected: 2 },
      { price: 0.5, expected: 4 },
      { price: 2, expected: 5 },
      { price: 20, expected: 4 },
      { price: 50, expected: 3 },
    ];
    for (const { price, expected } of tiers) {
      const result = calculateTradeQuality({ price });
      expect(result.components.price.score).toBe(expected);
    }
  });

  it("13. technical-state partial availability scales within component weight", () => {
    const partial = calculateTradeQuality({
      technical: {
        aboveVwap: "TRUE",
        holdingVwapAfterReclaim: "UNKNOWN",
        nearHod: "FALSE",
        higherHighHigherLow: "UNKNOWN",
        positiveMomentum: "UNKNOWN",
      },
    });
    expect(partial.components.technical.available).toBe(true);
    expect(partial.components.technical.score).toBe(3);
    expect(partial.components.technical.maxScore).toBe(5);
    expect(partial.availableWeight).toBe(TRADE_QUALITY_COMPONENT_WEIGHTS.technical);
  });

  it("14. normalization excludes unavailable components from denominator", () => {
    const result = calculateTradeQuality({
      price: 10,
      currentSessionVolume: 50_000_000,
      absoluteMovePct: 20,
      catalystQuality: "STRONG",
    });
    expect(result.availableWeight).toBe(25 + 15 + 15 + 5);
    expect(result.coveragePct).toBe(60);
    expect(result.score).not.toBeNull();
  });

  it("15. coverage calculation reflects available configured weight", () => {
    const result = calculateTradeQuality({
      price: 10,
      currentSessionVolume: 10_000_000,
      absoluteMovePct: 5,
    });
    expect(result.coveragePct).toBe(
      Math.round(
        ((TRADE_QUALITY_COMPONENT_WEIGHTS.dollarVolume +
          TRADE_QUALITY_COMPONENT_WEIGHTS.movement +
          TRADE_QUALITY_COMPONENT_WEIGHTS.price) /
          TRADE_QUALITY_TOTAL_WEIGHT) *
          1000,
      ) / 10,
    );
  });

  it("16. exactly 60% coverage exposes official score", () => {
    const result = calculateTradeQuality({
      price: 10,
      currentSessionVolume: 50_000_000,
      absoluteMovePct: 20,
      catalystQuality: "STRONG",
    });
    expect(result.coveragePct).toBe(TRADE_QUALITY_MIN_COVERAGE_PCT);
    expect(result.label).not.toBe("INCOMPLETE");
    expect(result.score).not.toBeNull();
  });

  it("17. below 60% coverage => INCOMPLETE with null official score", () => {
    const result = calculateTradeQuality({
      price: 10,
      currentSessionVolume: 50_000_000,
      absoluteMovePct: 20,
    });
    expect(result.coveragePct).toBeLessThan(TRADE_QUALITY_MIN_COVERAGE_PCT);
    expect(result.score).toBeNull();
    expect(result.label).toBe("INCOMPLETE");
    expect(result.components.dollarVolume.available).toBe(true);
  });

  it("18. no valid components => INCOMPLETE with zero coverage", () => {
    const result = calculateTradeQuality({});
    expect(result.availableWeight).toBe(0);
    expect(result.coveragePct).toBe(0);
    expect(result.score).toBeNull();
    expect(result.label).toBe("INCOMPLETE");
  });

  it("19. NaN/Infinity inputs remain unavailable", () => {
    const result = calculateTradeQuality({
      price: Number.NaN,
      currentSessionVolume: Number.POSITIVE_INFINITY,
      absoluteMovePct: Number.NaN,
      bid: Number.NaN,
      ask: 10,
      publicFloat: Number.NaN,
      rvol20d: Number.POSITIVE_INFINITY,
    });
    expect(result.components.dollarVolume.available).toBe(false);
    expect(result.components.movement.available).toBe(false);
    expect(result.components.spread.available).toBe(false);
    expect(result.components.floatTurnover.available).toBe(false);
    expect(result.components.rvol20d.available).toBe(false);
    expect(result.components.price.available).toBe(false);
  });

  it("20. score never exceeds 100", () => {
    const result = calculateTradeQuality(perfectInput());
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("21. score never goes below 0", () => {
    const result = calculateTradeQuality({
      price: 0.05,
      currentSessionVolume: 1,
      absoluteMovePct: 0,
      catalystQuality: "NONE",
      bid: 1,
      ask: 2,
      technical: {
        aboveVwap: "FALSE",
        holdingVwapAfterReclaim: "FALSE",
        nearHod: "FALSE",
        higherHighHigherLow: "FALSE",
        positiveMomentum: "FALSE",
      },
      publicFloat: 1_000_000_000,
      rvol20d: 0,
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it("27. repeated evaluation is deterministic", () => {
    const input = perfectInput();
    const first = calculateTradeQuality(input);
    const second = calculateTradeQuality(input);
    expect(second).toEqual(first);
  });

  it("UNKNOWN catalyst excludes weight; NONE earns valid zero", () => {
    const unknown = calculateTradeQuality({ catalystQuality: "UNKNOWN" });
    expect(unknown.availableWeight).toBe(0);
    expect(unknown.components.catalyst.available).toBe(false);

    const none = calculateTradeQuality({
      price: 10,
      currentSessionVolume: 50_000_000,
      absoluteMovePct: 20,
      catalystQuality: "NONE",
    });
    expect(none.components.catalyst.available).toBe(true);
    expect(none.components.catalyst.score).toBe(0);
    expect(none.availableWeight).toBe(25 + 15 + 15 + 5);
  });
});

describe("Trade Quality V1 — ranking", () => {
  it("22. ranks highest Trade Quality score first", () => {
    const high = baseRankInput("HIGH", 3, perfectInput());
    const low = baseRankInput("LOW", 1, {
      price: 0.05,
      currentSessionVolume: 100_000,
      absoluteMovePct: 1,
      catalystQuality: "NONE",
      bid: 0.04,
      ask: 0.06,
      technical: { aboveVwap: "FALSE" },
      publicFloat: 100_000_000,
      rvol20d: 0.5,
    });
    const ranked = rankTradeQualityCandidates([low, high]);
    expect(ranked[0]?.symbol).toBe("HIGH");
    expect(ranked[0]?.tradeQualityRank).toBe(1);
    expect(ranked[1]?.tradeQualityRank).toBe(2);
  });

  it("23. tie-break uses dollar volume, then session volume, then discovery rank, then symbol", () => {
    const sharedInput: TradeQualityInput = {
      price: 10,
      currentSessionVolume: 5_000_000,
      absoluteMovePct: 10,
      catalystQuality: "MODERATE",
      bid: 9.99,
      ask: 10.01,
      technical: { aboveVwap: "TRUE", nearHod: "TRUE" },
      publicFloat: 10_000_000,
      rvol20d: 3,
    };
    const quality = calculateTradeQuality(sharedInput);

    const a: TradeQualityRankInput = {
      symbol: "BBB",
      discoveryRank: 2,
      tradeQuality: quality,
      dollarVolume: 60_000_000,
      currentSessionVolume: 6_000_000,
    };
    const b: TradeQualityRankInput = {
      symbol: "AAA",
      discoveryRank: 1,
      tradeQuality: quality,
      dollarVolume: 50_000_000,
      currentSessionVolume: 5_000_000,
    };
    expect(compareTradeQualityCandidates(a, b)).toBeLessThan(0);

    const c: TradeQualityRankInput = {
      symbol: "ZZZ",
      discoveryRank: 5,
      tradeQuality: quality,
      dollarVolume: 50_000_000,
      currentSessionVolume: 5_000_000,
    };
    const d: TradeQualityRankInput = {
      symbol: "AAA",
      discoveryRank: 1,
      tradeQuality: quality,
      dollarVolume: 50_000_000,
      currentSessionVolume: 5_000_000,
    };
    expect(compareTradeQualityCandidates(d, c)).toBeLessThan(0);
  });

  it("24. incomplete candidates are excluded from official Trade Quality rank", () => {
    const incomplete = baseRankInput("INC", 1, { price: 10 });
    const complete = baseRankInput("OK", 2, perfectInput());
    const ranked = rankTradeQualityCandidates([incomplete, complete]);
    expect(ranked.find((row) => row.symbol === "INC")?.tradeQualityRank).toBeNull();
    expect(ranked.find((row) => row.symbol === "OK")?.tradeQualityRank).toBe(1);
  });

  it("25. Discovery ranks are preserved when Trade Quality order differs", () => {
    const abc = baseRankInput("ABC", 1, {
      price: 5,
      currentSessionVolume: 1_000_000,
      absoluteMovePct: 3,
      catalystQuality: "WEAK",
      bid: 4.99,
      ask: 5.01,
      technical: { aboveVwap: "FALSE" },
      publicFloat: 50_000_000,
      rvol20d: 1.5,
    });
    const xyz = baseRankInput("XYZ", 2, {
      price: 8,
      currentSessionVolume: 2_000_000,
      absoluteMovePct: 8,
      catalystQuality: "MODERATE",
      bid: 7.99,
      ask: 8.01,
      technical: { aboveVwap: "TRUE", nearHod: "TRUE" },
      publicFloat: 20_000_000,
      rvol20d: 3,
    });
    const def = baseRankInput("DEF", 3, perfectInput());

    const discoveryOrder = [abc, xyz, def];
    expect(discoveryOrder.map((row) => row.discoveryRank)).toEqual([1, 2, 3]);

    const qualityRanked = rankTradeQualityCandidates(discoveryOrder);
    expect(qualityRanked.map((row) => row.symbol)).toEqual(["DEF", "XYZ", "ABC"]);
    expect(qualityRanked.map((row) => row.tradeQualityRank)).toEqual([1, 2, 3]);

    for (const row of qualityRanked) {
      if (row.symbol === "ABC") expect(row.discoveryRank).toBe(1);
      if (row.symbol === "XYZ") expect(row.discoveryRank).toBe(2);
      if (row.symbol === "DEF") expect(row.discoveryRank).toBe(3);
    }
  });

  it("26. ranking does not mutate input candidates", () => {
    const input = baseRankInput("ABC", 1, perfectInput());
    const snapshot = structuredClone(input);
    rankTradeQualityCandidates([input]);
    expect(input).toEqual(snapshot);
  });
});
