import { describe, expect, it } from "vitest";
import {
  CONTINUATION_DAY_TWO_MIN_SCORE,
  CONTINUATION_MIN_COVERAGE_PCT,
  CONTINUATION_MODEL_VERSION,
  CONTINUATION_POWER_HOUR_MIN_DOLLAR_VOLUME,
  CONTINUATION_STRONG_CLOSE_MAX_HOD_DISTANCE_PCT,
} from "@/config/continuation.config";
import {
  buildContinuationHandoff,
  evaluateContinuation,
  rankContinuationCandidates,
  resolveContinuationSessionWindow,
} from "@/lib/screeners/continuation";
import type { ContinuationInput, ContinuationRankInput } from "@/types/continuation";

const SESSION = "2026-08-12";
const POWER_HOUR = "2026-08-12T19:30:00.000Z"; // 15:30 EDT
const POWER_HOUR_START = "2026-08-12T19:00:00.000Z"; // 15:00 EDT
const BEFORE_POWER_HOUR = "2026-08-12T18:59:00.000Z"; // 14:59 EDT
const REGULAR_CLOSE = "2026-08-12T20:00:00.000Z"; // 16:00 EDT
const AFTER_CLOSE = "2026-08-12T20:00:01.000Z"; // 16:00:01 EDT
const AFTER_HOURS = "2026-08-12T21:00:00.000Z"; // 17:00 EDT
const MORNING = "2026-08-12T14:30:00.000Z"; // 10:30 EDT
const WINTER_POWER_HOUR = "2026-01-15T20:00:00.000Z"; // 15:00 EST

function base(overrides: Partial<ContinuationInput> = {}): ContinuationInput {
  return {
    symbol: "AAPL",
    sessionDate: SESSION,
    observedAt: POWER_HOUR,
    price: 10,
    currentSessionVolume: 2_000_000,
    volumeVelocity: "STRONG",
    distanceFromHodPct: 0.8,
    catalystQuality: "STRONG",
    aboveVwap: "TRUE",
    holdingVwapAfterReclaim: "TRUE",
    positiveStructure: "TRUE",
    floatShares: 1_000_000,
    rvol20d: 6,
    tradeQualityScore: 88,
    tradeQualityLabel: "HIGH_QUALITY",
    discoveryRank: 3,
    ...overrides,
  };
}

describe("Continuation V1 — time windows", () => {
  it("1. detects Power Hour", () => {
    const window = resolveContinuationSessionWindow(POWER_HOUR_START);
    expect(window?.isPowerHour).toBe(true);
    expect(window?.isNearClose).toBe(true);
    expect(window?.isAfterHours).toBe(false);
  });

  it("2. is DST-safe for the same Eastern wall clock", () => {
    const summer = resolveContinuationSessionWindow(POWER_HOUR_START);
    const winter = resolveContinuationSessionWindow(WINTER_POWER_HOUR);
    expect(summer?.isPowerHour).toBe(true);
    expect(winter?.isPowerHour).toBe(true);
    expect(summer?.msOfDay).toBe(winter?.msOfDay);
  });

  it("3. pre-15:00 is not Power Hour", () => {
    expect(resolveContinuationSessionWindow(BEFORE_POWER_HOUR)?.isPowerHour).toBe(false);
  });

  it("4. 16:00 is the Power Hour / After Hours transition", () => {
    const close = resolveContinuationSessionWindow(REGULAR_CLOSE);
    const after = resolveContinuationSessionWindow(AFTER_CLOSE);
    expect(close?.isPowerHour).toBe(true);
    expect(close?.isAfterHours).toBe(false);
    expect(after?.isPowerHour).toBe(false);
    expect(after?.isAfterHours).toBe(true);
  });

  it("5. recognizes after-hours", () => {
    const window = resolveContinuationSessionWindow(AFTER_HOURS);
    expect(window?.isAfterHours).toBe(true);
    expect(window?.isPowerHour).toBe(false);
  });
});

describe("Continuation V1 — scoring components", () => {
  it("6. strong velocity scores 20", () => {
    expect(evaluateContinuation(base({ volumeVelocity: "STRONG" })).components.lateSessionVelocity.score).toBe(20);
  });

  it("7. moderate velocity scores 14", () => {
    expect(evaluateContinuation(base({ volumeVelocity: "MODERATE" })).components.lateSessionVelocity.score).toBe(14);
  });

  it("8. weak velocity scores 7", () => {
    expect(evaluateContinuation(base({ volumeVelocity: "WEAK" })).components.lateSessionVelocity.score).toBe(7);
  });

  it("9. unknown velocity is unavailable", () => {
    const result = evaluateContinuation(base({ volumeVelocity: "UNKNOWN", priceVelocity: "UNKNOWN" }));
    expect(result.components.lateSessionVelocity.available).toBe(false);
  });

  it("10. HOD distance tier boundaries", () => {
    expect(evaluateContinuation(base({ distanceFromHodPct: 1.5 })).components.closeHodStrength.score).toBe(17);
    expect(evaluateContinuation(base({ distanceFromHodPct: 2.5 })).components.closeHodStrength.score).toBe(13);
    expect(evaluateContinuation(base({ distanceFromHodPct: 4 })).components.closeHodStrength.score).toBe(8);
    expect(evaluateContinuation(base({ distanceFromHodPct: 7 })).components.closeHodStrength.score).toBe(3);
  });

  it("11. exactly 1% from HOD scores 20", () => {
    expect(evaluateContinuation(base({ distanceFromHodPct: 1 })).components.closeHodStrength.score).toBe(20);
  });

  it("12. exactly 3% from HOD scores 13", () => {
    expect(evaluateContinuation(base({ distanceFromHodPct: 3 })).components.closeHodStrength.score).toBe(13);
  });

  it("13. more than 10% from HOD scores 0", () => {
    const result = evaluateContinuation(base({ distanceFromHodPct: 10.1 }));
    expect(result.components.closeHodStrength.available).toBe(true);
    expect(result.components.closeHodStrength.score).toBe(0);
  });

  it("14. missing HOD is unavailable", () => {
    expect(evaluateContinuation(base({ distanceFromHodPct: null })).components.closeHodStrength.available).toBe(false);
  });

  it("15. dollar-volume tiers", () => {
    expect(
      evaluateContinuation(base({ price: 1, currentSessionVolume: 500_000, dollarVolume: null }))
        .components.dollarVolume.score,
    ).toBe(1);
    expect(
      evaluateContinuation(base({ dollarVolume: 20_000_000 })).components.dollarVolume.score,
    ).toBe(11);
    expect(
      evaluateContinuation(base({ dollarVolume: 50_000_000 })).components.dollarVolume.score,
    ).toBe(15);
  });

  it("16. catalyst tiers", () => {
    expect(evaluateContinuation(base({ catalystQuality: "STRONG" })).components.catalyst.score).toBe(15);
    expect(evaluateContinuation(base({ catalystQuality: "MODERATE" })).components.catalyst.score).toBe(10);
    expect(evaluateContinuation(base({ catalystQuality: "WEAK" })).components.catalyst.score).toBe(5);
    expect(evaluateContinuation(base({ catalystQuality: "NONE" })).components.catalyst.score).toBe(0);
    expect(evaluateContinuation(base({ catalystQuality: "UNKNOWN" })).components.catalyst.available).toBe(false);
  });

  it("17. VWAP partial availability scales within the component", () => {
    const result = evaluateContinuation(
      base({
        aboveVwap: "TRUE",
        holdingVwapAfterReclaim: "UNKNOWN",
        positiveStructure: "UNKNOWN",
      }),
    );
    expect(result.components.vwapHold.available).toBe(true);
    expect(result.components.vwapHold.score).toBe(5);
    expect(result.components.vwapHold.maxScore).toBe(5);
    expect(result.availableWeight).toBe(100);
  });

  it("18. float-turnover tiers", () => {
    expect(
      evaluateContinuation(base({ currentSessionVolume: 200_000, floatShares: 1_000_000, floatTurnover: null }))
        .components.floatTurnover.score,
    ).toBe(1);
    expect(
      evaluateContinuation(base({ currentSessionVolume: 2_000_000, floatShares: 1_000_000, floatTurnover: null }))
        .components.floatTurnover.score,
    ).toBe(9);
  });

  it("19. RVOL tiers", () => {
    expect(evaluateContinuation(base({ rvol20d: 0.5 })).components.rvol20d.score).toBe(0);
    expect(evaluateContinuation(base({ rvol20d: 5 })).components.rvol20d.score).toBe(4);
    expect(evaluateContinuation(base({ rvol20d: 10 })).components.rvol20d.score).toBe(5);
  });

  it("20. Trade Quality context tiers", () => {
    expect(evaluateContinuation(base({ tradeQualityScore: 90 })).components.tradeQuality.score).toBe(5);
    expect(evaluateContinuation(base({ tradeQualityScore: 70 })).components.tradeQuality.score).toBe(4);
    expect(evaluateContinuation(base({ tradeQualityScore: 40 })).components.tradeQuality.score).toBe(2);
    expect(
      evaluateContinuation(base({ tradeQualityScore: 90, tradeQualityLabel: "INCOMPLETE" })).components
        .tradeQuality.available,
    ).toBe(false);
  });
});

describe("Continuation V1 — coverage", () => {
  it("21. coverage normalizes against available weight", () => {
    const result = evaluateContinuation(
      base({
        volumeVelocity: "STRONG",
        distanceFromHodPct: 1,
        dollarVolume: 20_000_000,
        catalystQuality: "UNKNOWN",
        aboveVwap: "UNKNOWN",
        holdingVwapAfterReclaim: "UNKNOWN",
        positiveStructure: "UNKNOWN",
        floatShares: null,
        rvol20d: null,
        tradeQualityScore: 88,
      }),
    );
    expect(result.availableWeight).toBe(20 + 20 + 15 + 5);
    expect(result.coveragePct).toBe(60);
  });

  it("22. below minimum coverage is INCOMPLETE", () => {
    const result = evaluateContinuation({
      symbol: "AAPL",
      sessionDate: SESSION,
      observedAt: POWER_HOUR,
      rvol20d: 6,
    });
    expect(result.coveragePct).toBeLessThan(CONTINUATION_MIN_COVERAGE_PCT);
    expect(result.score).toBeNull();
    expect(result.label).toBe("INCOMPLETE");
    expect(result.categories).toEqual([]);
  });

  it("23. exact minimum coverage exposes an official score", () => {
    const result = evaluateContinuation(
      base({
        catalystQuality: "UNKNOWN",
        aboveVwap: "UNKNOWN",
        holdingVwapAfterReclaim: "UNKNOWN",
        positiveStructure: "UNKNOWN",
        floatShares: null,
        rvol20d: null,
        tradeQualityScore: 88,
      }),
    );
    expect(result.coveragePct).toBe(CONTINUATION_MIN_COVERAGE_PCT);
    expect(result.score).not.toBeNull();
    expect(result.label).toBe("READY");
  });
});

describe("Continuation V1 — category qualification", () => {
  it("24. POWER_HOUR_MOMENTUM qualifies", () => {
    const result = evaluateContinuation(base());
    expect(result.categories).toContain("POWER_HOUR_MOMENTUM");
    expect(result.qualifies).toBe(true);
  });

  it("25. fails Power Hour outside the window", () => {
    const result = evaluateContinuation(base({ observedAt: BEFORE_POWER_HOUR }));
    expect(result.categories).not.toContain("POWER_HOUR_MOMENTUM");
  });

  it("26. fails Power Hour with insufficient velocity", () => {
    const result = evaluateContinuation(base({ volumeVelocity: "WEAK" }));
    expect(result.categories).not.toContain("POWER_HOUR_MOMENTUM");
  });

  it("27. STRONG_CLOSE_NEAR_HOD qualifies", () => {
    const result = evaluateContinuation(base({ distanceFromHodPct: 2 }));
    expect(result.categories).toContain("STRONG_CLOSE_NEAR_HOD");
  });

  it("28. fails Strong Close when HOD distance is excessive", () => {
    const result = evaluateContinuation(
      base({ distanceFromHodPct: CONTINUATION_STRONG_CLOSE_MAX_HOD_DISTANCE_PCT + 0.1 }),
    );
    expect(result.categories).not.toContain("STRONG_CLOSE_NEAR_HOD");
  });

  it("29. closing rejection blocks Strong Close and Day-Two", () => {
    const result = evaluateContinuation(base({ closingRejection: "TRUE" }));
    expect(result.categories).not.toContain("STRONG_CLOSE_NEAR_HOD");
    expect(result.categories).not.toContain("DAY_TWO_WATCH");
  });

  it("30. AFTER_HOURS_CONTINUATION qualifies", () => {
    const result = evaluateContinuation(
      base({
        observedAt: AFTER_HOURS,
        afterHoursExtendsSession: "TRUE",
        dollarVolume: 8_000_000,
      }),
    );
    expect(result.window.isAfterHours).toBe(true);
    expect(result.categories).toContain("AFTER_HOURS_CONTINUATION");
  });

  it("31. a regular-session observation is not After Hours", () => {
    const result = evaluateContinuation(base({ afterHoursExtendsSession: "TRUE" }));
    expect(result.categories).not.toContain("AFTER_HOURS_CONTINUATION");
  });

  it("32. missing after-hours strength does not fabricate AH qualification", () => {
    const result = evaluateContinuation(
      base({
        observedAt: AFTER_HOURS,
        afterHoursExtendsSession: "UNKNOWN",
        sessionHigh: null,
        distanceFromHodPct: null,
        dollarVolume: 8_000_000,
      }),
    );
    expect(result.categories).not.toContain("AFTER_HOURS_CONTINUATION");
  });

  it("33. DAY_TWO_WATCH qualifies on the score threshold", () => {
    const result = evaluateContinuation(base({ observedAt: MORNING, distanceFromHodPct: 8 }));
    expect(result.categories).not.toContain("POWER_HOUR_MOMENTUM");
    expect(result.score).toBeGreaterThanOrEqual(CONTINUATION_DAY_TWO_MIN_SCORE);
    expect(result.categories).toContain("DAY_TWO_WATCH");
  });

  it("34. below the Day-Two score threshold does not qualify", () => {
    const result = evaluateContinuation(
      base({
        observedAt: MORNING,
        volumeVelocity: "NONE",
        distanceFromHodPct: 12,
        catalystQuality: "NONE",
        aboveVwap: "FALSE",
        holdingVwapAfterReclaim: "FALSE",
        positiveStructure: "FALSE",
        currentSessionVolume: 400_000,
        floatShares: 50_000_000,
        rvol20d: 0.4,
        tradeQualityScore: 20,
        tradeQualityLabel: "LOW_QUALITY",
        dollarVolume: 4_000_000,
      }),
    );
    expect(result.score).not.toBeNull();
    expect((result.score as number) < CONTINUATION_DAY_TWO_MIN_SCORE).toBe(true);
    expect(result.categories).not.toContain("DAY_TWO_WATCH");
  });

  it("35. a disqualifier blocks qualification", () => {
    const result = evaluateContinuation(base({ instrumentType: "WARRANT" }));
    expect(result.disqualified).toBe(true);
    expect(result.qualifies).toBe(false);
    expect(result.categories).toEqual([]);
  });

  it("36. one symbol can qualify for multiple categories", () => {
    const result = evaluateContinuation(base());
    expect(result.categories).toEqual(
      expect.arrayContaining(["POWER_HOUR_MOMENTUM", "STRONG_CLOSE_NEAR_HOD", "DAY_TWO_WATCH"]),
    );
  });

  it("37. qualified categories emit reasons", () => {
    const powerHour = evaluateContinuation(base()).categoryResults.find(
      (item) => item.category === "POWER_HOUR_MOMENTUM",
    );
    expect(powerHour?.qualified).toBe(true);
    expect(powerHour?.reasons).toContain("POWER_HOUR_VOLUME_ACCELERATION");
    expect(powerHour?.reasons).toContain("HIGH_DOLLAR_VOLUME");
  });

  it("38. category evaluation is deterministic", () => {
    const input = base();
    expect(evaluateContinuation(input)).toEqual(evaluateContinuation(input));
  });
});

describe("Continuation V1 — ranking and contracts", () => {
  it("39. continuation ranking is deterministic", () => {
    const high = evaluateContinuation(base({ symbol: "HIGH", discoveryRank: 5, tradeQualityScore: 95 }));
    const low = evaluateContinuation(
      base({
        symbol: "LOW",
        discoveryRank: 1,
        observedAt: MORNING,
        volumeVelocity: "WEAK",
        distanceFromHodPct: 9,
        tradeQualityScore: 45,
        tradeQualityLabel: "WEAK",
      }),
    );
    const ranked = rankContinuationCandidates([
      { symbol: "LOW", discoveryRank: 1, continuation: low, dollarVolume: low.dollarVolume },
      { symbol: "HIGH", discoveryRank: 5, continuation: high, dollarVolume: high.dollarVolume },
    ]);
    expect(ranked.map((row) => row.symbol)).toEqual(["HIGH", "LOW"]);
    expect(ranked[0]?.continuationRank).toBe(1);
  });

  it("40. incomplete candidates are unranked", () => {
    const incomplete = evaluateContinuation({
      symbol: "INC",
      sessionDate: SESSION,
      observedAt: POWER_HOUR,
      rvol20d: 2,
      discoveryRank: 1,
    });
    const complete = evaluateContinuation(base({ symbol: "OK", discoveryRank: 2 }));
    const ranked = rankContinuationCandidates([
      { symbol: "INC", discoveryRank: 1, continuation: incomplete },
      { symbol: "OK", discoveryRank: 2, continuation: complete, dollarVolume: complete.dollarVolume },
    ]);
    expect(ranked.find((row) => row.symbol === "INC")?.continuationRank).toBeNull();
    expect(ranked.find((row) => row.symbol === "OK")?.continuationRank).toBe(1);
  });

  it("41. Discovery rank is preserved", () => {
    const result = evaluateContinuation(base({ discoveryRank: 7 }));
    expect(result.discoveryRank).toBe(7);
    const ranked = rankContinuationCandidates([
      { symbol: "AAPL", discoveryRank: 7, continuation: result, dollarVolume: result.dollarVolume },
    ]);
    expect(ranked[0]?.discoveryRank).toBe(7);
  });

  it("42. ranking does not mutate input order of the original array", () => {
    const a = evaluateContinuation(base({ symbol: "AAA", discoveryRank: 2 }));
    const b = evaluateContinuation(base({ symbol: "BBB", discoveryRank: 1, tradeQualityScore: 40, tradeQualityLabel: "WEAK" }));
    const input: ContinuationRankInput[] = [
      { symbol: "AAA", discoveryRank: 2, continuation: a, dollarVolume: a.dollarVolume },
      { symbol: "BBB", discoveryRank: 1, continuation: b, dollarVolume: b.dollarVolume },
    ];
    const snapshot = [...input];
    rankContinuationCandidates(input);
    expect(input).toEqual(snapshot);
  });

  it("43. input objects are immutable", () => {
    const input = base();
    const snapshot = structuredClone(input);
    evaluateContinuation(input);
    expect(input).toEqual(snapshot);
  });

  it("44. valid zero is distinct from unknown", () => {
    const zero = evaluateContinuation(base({ rvol20d: 0 }));
    const missing = evaluateContinuation(base({ rvol20d: null }));
    expect(zero.components.rvol20d.available).toBe(true);
    expect(zero.components.rvol20d.score).toBe(0);
    expect(missing.components.rvol20d.available).toBe(false);
  });

  it("45. NaN inputs do not become legitimate values", () => {
    const result = evaluateContinuation(
      base({
        distanceFromHodPct: Number.NaN,
        rvol20d: Number.NaN,
        dollarVolume: Number.NaN,
        currentSessionVolume: Number.NaN,
      }),
    );
    expect(result.components.closeHodStrength.available).toBe(false);
    expect(result.components.rvol20d.available).toBe(false);
  });

  it("46. Infinity inputs are rejected", () => {
    const result = evaluateContinuation(base({ rvol20d: Number.POSITIVE_INFINITY, price: Number.POSITIVE_INFINITY }));
    expect(result.components.rvol20d.available).toBe(false);
    expect(result.disqualified).toBe(true);
  });

  it("47. invalid timestamps are rejected", () => {
    const result = evaluateContinuation(base({ observedAt: "not-a-date" }));
    expect(result.score).toBeNull();
    expect(result.diagnostics[0]?.code).toBe("INVALID_TIMESTAMP");
  });

  it("48. invalid session dates are rejected", () => {
    const result = evaluateContinuation(base({ sessionDate: "08/12/2026" }));
    expect(result.sessionDate).toBeNull();
    expect(result.diagnostics[0]?.code).toBe("INVALID_SESSION_DATE");
  });

  it("49. sessions are isolated", () => {
    const today = evaluateContinuation(base({ sessionDate: "2026-08-12" }));
    const next = evaluateContinuation(base({ sessionDate: "2026-08-13", observedAt: "2026-08-13T19:30:00.000Z" }));
    expect(today.sessionDate).toBe("2026-08-12");
    expect(next.sessionDate).toBe("2026-08-13");
    const handoff = buildContinuationHandoff(today, { targetSessionDate: "2026-08-13" });
    expect(handoff.sourceSessionDate).toBe("2026-08-12");
    expect(handoff.targetSessionDate).toBe("2026-08-13");
    expect(handoff.lifecycle).toBe("next-session");
  });

  it("50. version is v1", () => {
    const result = evaluateContinuation(base());
    expect(result.version).toBe("v1");
    expect(result.version).toBe(CONTINUATION_MODEL_VERSION);
    expect(result.dollarVolume).toBeGreaterThanOrEqual(CONTINUATION_POWER_HOUR_MIN_DOLLAR_VOLUME);
  });
});
