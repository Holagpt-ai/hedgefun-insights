import { describe, expect, it } from "vitest";
import {
  SCREENER_INTELLIGENCE_COLUMNS,
  SCREENER_INTELLIGENCE_TOOLTIPS,
  SCREENER_INTELLIGENCE_UI_FLAGS,
} from "@/config/screener-intelligence-ui.config";
import {
  buildMobileIntelligencePresentation,
  formatCatalystQuality,
  formatCompactDollarVolume,
  formatContinuationBadges,
  formatDiscoveryRank,
  formatFreshness,
  formatRatio,
  formatShortFloat,
  formatTradeQuality,
  formatTriggerMarketTime,
  formatTriggerPresentation,
  getIntelligenceTooltip,
  isIntelligenceColumnActive,
  resolveIntelligenceFlags,
  UNAVAILABLE_DISPLAY,
  visibleIntelligenceColumns,
} from "@/lib/screeners/presentation";
import type { ScreenerIntelligenceDisplayInput } from "@/types/screener-intelligence-ui";
import type { TriggerSummary } from "@/types/trigger-time";

const sampleInput: ScreenerIntelligenceDisplayInput = {
  discoveryRank: 12,
  symbol: "abcd",
  price: 4.82,
  movePct: 18.4,
  volume: 12_400_000,
  dollarVolume: 59_800_000,
  rvol20d: 6.2,
  tradeQualityScore: 82,
  tradeQualityLabel: "STRONG",
  tradeQualityCoveragePct: 85,
  catalystQuality: "STRONG",
  triggerSummary: {
    firstTriggerAt: "2026-08-12T13:43:00.000Z",
    discoveryTriggerAt: "2026-08-12T13:41:00.000Z",
    earliestVolumeTriggerAt: "2026-08-12T13:43:00.000Z",
    momentumTriggerAt: "2026-08-12T13:46:00.000Z",
    hodBreakTriggerAt: "2026-08-12T14:03:00.000Z",
    catalystTriggerAt: "2026-08-12T12:17:00.000Z",
  },
};

describe("Screener Intelligence presentation — formatters", () => {
  it("1. formats dollar volume in $K", () => {
    expect(formatCompactDollarVolume(850_000)).toBe("$850K");
  });

  it("2. formats dollar volume in $M", () => {
    expect(formatCompactDollarVolume(6_900_000)).toBe("$6.9M");
    expect(formatCompactDollarVolume(52_400_000)).toBe("$52.4M");
  });

  it("3. formats dollar volume in $B", () => {
    expect(formatCompactDollarVolume(1_200_000_000)).toBe("$1.2B");
  });

  it("4. null dollar volume is unavailable", () => {
    expect(formatCompactDollarVolume(null)).toBe(UNAVAILABLE_DISPLAY);
  });

  it("5. formats RVOL 20D as a ratio", () => {
    expect(formatRatio(1.4)).toBe("1.4x");
    expect(formatRatio(12.3)).toBe("12.3x");
  });

  it("6. formats Vol/Prior as a ratio", () => {
    expect(formatRatio(2.8)).toBe("2.8x");
  });

  it("7. formats float turnover as a ratio", () => {
    expect(formatRatio(0.4)).toBe("0.4x");
    expect(formatRatio(3.8)).toBe("3.8x");
  });

  it("8. valid zero ratio displays 0.0x", () => {
    expect(formatRatio(0)).toBe("0.0x");
  });

  it("9. unavailable ratio displays em dash", () => {
    expect(formatRatio(null)).toBe(UNAVAILABLE_DISPLAY);
  });

  it("10. formats Short Float percentage", () => {
    expect(formatShortFloat({ shortFloatPct: 19.2 }).compact).toBe("19.2%");
  });

  it("11. Short Float fresh", () => {
    const view = formatShortFloat({ shortFloatPct: 8.4, freshness: "FRESH" });
    expect(view.freshness).toBe("Fresh");
    expect(view.stale).toBe(false);
  });

  it("12. Short Float aging", () => {
    expect(formatFreshness("AGING")).toBe("Aging");
    expect(formatShortFloat({ shortFloatPct: 19.2, freshness: "AGING" }).freshness).toBe("Aging");
  });

  it("13. Short Float stale is marked", () => {
    const view = formatShortFloat({ shortFloatPct: 34.7, freshness: "STALE" });
    expect(view.stale).toBe(true);
    expect(view.freshness).toBe("Stale");
    expect(view.compact).toBe("34.7%");
  });

  it("14. Short Float discrepancy displays Check", () => {
    expect(formatShortFloat({ quality: "DISCREPANCY", shortFloatPct: 18.4 }).compact).toBe("Check");
  });

  it("15. Short Float unavailable", () => {
    expect(formatShortFloat({ shortFloatPct: null }).compact).toBe(UNAVAILABLE_DISPLAY);
  });

  it("16. Trade Quality valid compact score", () => {
    const view = formatTradeQuality({ score: 82, label: "STRONG", coveragePct: 85 });
    expect(view.compact).toBe("82");
    expect(view.label).toBe("Strong");
    expect(view.incomplete).toBe(false);
  });

  it("17. Trade Quality incomplete", () => {
    const view = formatTradeQuality({ score: null, label: "INCOMPLETE", coveragePct: 40 });
    expect(view.compact).toBe("Incomplete");
    expect(view.incomplete).toBe(true);
  });

  it("18. coverage display", () => {
    expect(formatTradeQuality({ score: 82, label: "STRONG", coveragePct: 85 }).coverage).toBe(
      "Coverage 85%",
    );
  });

  it("19. Trade Quality score boundaries", () => {
    expect(formatTradeQuality({ score: 0, label: "LOW_QUALITY" }).compact).toBe("0");
    expect(formatTradeQuality({ score: 100, label: "HIGH_QUALITY" }).compact).toBe("100");
    expect(formatTradeQuality({ score: 100, label: "HIGH_QUALITY" }).label).toBe("High");
  });

  it("20. Catalyst STRONG", () => {
    expect(formatCatalystQuality("STRONG")).toBe("Strong");
  });

  it("21. Catalyst MODERATE", () => {
    expect(formatCatalystQuality("MODERATE")).toBe("Moderate");
  });

  it("22. Catalyst WEAK", () => {
    expect(formatCatalystQuality("WEAK")).toBe("Weak");
  });

  it("23. Catalyst NONE is None, not unavailable", () => {
    expect(formatCatalystQuality("NONE")).toBe("None");
  });

  it("24. Catalyst UNKNOWN is unavailable", () => {
    expect(formatCatalystQuality("UNKNOWN")).toBe(UNAVAILABLE_DISPLAY);
  });

  it("25. Trigger UTC converts to ET", () => {
    expect(formatTriggerMarketTime("2026-08-12T13:43:00.000Z")).toBe("9:43 AM");
  });

  it("26. Trigger display is DST-safe", () => {
    expect(formatTriggerMarketTime("2026-08-12T13:43:00.000Z")).toBe("9:43 AM");
    expect(formatTriggerMarketTime("2026-01-15T14:43:00.000Z")).toBe("9:43 AM");
  });

  it("27. missing trigger is unavailable", () => {
    expect(formatTriggerMarketTime(null)).toBe(UNAVAILABLE_DISPLAY);
    expect(formatTriggerPresentation(null).compact).toBe(UNAVAILABLE_DISPLAY);
  });

  it("28. multiple trigger summary lines", () => {
    const summary: TriggerSummary = {
      firstTriggerAt: "2026-08-12T13:43:00.000Z",
      discoveryTriggerAt: "2026-08-12T13:41:00.000Z",
      earliestVolumeTriggerAt: "2026-08-12T13:43:00.000Z",
      momentumTriggerAt: "2026-08-12T13:46:00.000Z",
      hodBreakTriggerAt: "2026-08-12T14:03:00.000Z",
      catalystTriggerAt: "2026-08-12T12:17:00.000Z",
    };
    const view = formatTriggerPresentation(summary);
    expect(view.compact).toBe("9:43 AM");
    expect(view.lines.map((line) => line.label)).toEqual(
      expect.arrayContaining(["Discovery", "Volume", "Momentum", "HOD Break", "Catalyst"]),
    );
  });

  it("29. Continuation one category", () => {
    const view = formatContinuationBadges(["DAY_TWO_WATCH"]);
    expect(view.compact).toBe("Day-Two");
    expect(view.extraCount).toBe(0);
  });

  it("30. multiple continuation categories use +N", () => {
    const view = formatContinuationBadges([
      "DAY_TWO_WATCH",
      "POWER_HOUR_MOMENTUM",
      "STRONG_CLOSE_NEAR_HOD",
    ]);
    expect(view.compact).toBe("Power Hour +2");
    expect(view.badges[0]).toBe("Power Hour");
  });

  it("31. no continuation categories", () => {
    expect(formatContinuationBadges([]).compact).toBe(UNAVAILABLE_DISPLAY);
  });

  it("32. Discovery rank is preserved as #N", () => {
    expect(formatDiscoveryRank(12)).toBe("#12");
  });

  it("33. non-consecutive ranks are not renumbered", () => {
    expect([2, 4, 7].map((rank) => formatDiscoveryRank(rank))).toEqual(["#2", "#4", "#7"]);
  });
});

describe("Screener Intelligence presentation — layout and flags", () => {
  it("34. desktop column priorities", () => {
    const byPriority = (priority: "P0" | "P1" | "P2" | "P3") =>
      SCREENER_INTELLIGENCE_COLUMNS.filter((column) => column.priority === priority).map((column) => column.id);
    expect(byPriority("P0")).toEqual(["discoveryRank", "symbol", "price", "move", "volume"]);
    expect(byPriority("P1")).toEqual(["dollarVolume", "rvol20d", "tradeQuality"]);
    expect(byPriority("P2")).toEqual(["volumeRatioPrior", "floatTurnover", "catalyst", "triggerTime"]);
    expect(byPriority("P3")).toEqual(["shortFloat", "continuation"]);
  });

  it("35. mobile field priority slots", () => {
    const mobile = buildMobileIntelligencePresentation(sampleInput, {
      showDollarVolume: true,
      showRvol20d: true,
      showTradeQuality: true,
      showCatalyst: true,
      showTriggerTime: true,
      showVolPrior: true,
      showFloatTurnover: true,
      showShortFloat: true,
      showContinuation: true,
    });
    expect(mobile.header).toEqual({
      rank: "#12",
      symbol: "ABCD",
      price: "$4.82",
      move: "+18.4%",
    });
    expect(mobile.secondary.map((row) => row.columnId)).toEqual(["volume", "dollarVolume", "rvol20d"]);
    expect(mobile.intelligence.map((row) => row.columnId)).toEqual([
      "tradeQuality",
      "catalyst",
      "triggerTime",
    ]);
    expect(mobile.details.map((row) => row.columnId)).toEqual([
      "volumeRatioPrior",
      "floatTurnover",
      "shortFloat",
      "continuation",
    ]);
  });

  it("36. feature-disabled columns are not active", () => {
    expect(SCREENER_INTELLIGENCE_UI_FLAGS.showTradeQuality).toBe(false);
    const dormant = SCREENER_INTELLIGENCE_COLUMNS.find((column) => column.id === "tradeQuality");
    expect(dormant && isIntelligenceColumnActive(dormant)).toBe(false);
    expect(visibleIntelligenceColumns().every((column) => column.rollout === "existing")).toBe(true);
  });

  it("37. feature-enabled metadata activates the column", () => {
    const flags = resolveIntelligenceFlags({ showTradeQuality: true });
    const column = SCREENER_INTELLIGENCE_COLUMNS.find((item) => item.id === "tradeQuality");
    expect(column && isIntelligenceColumnActive(column, flags)).toBe(true);
    expect(visibleIntelligenceColumns(flags).some((item) => item.id === "tradeQuality")).toBe(true);
  });

  it("38. tooltip definitions exist for canonical metrics", () => {
    for (const key of Object.keys(SCREENER_INTELLIGENCE_TOOLTIPS) as Array<
      keyof typeof SCREENER_INTELLIGENCE_TOOLTIPS
    >) {
      expect(getIntelligenceTooltip(key).length).toBeGreaterThan(20);
    }
  });

  it("39. RVOL 20D and Vol/Prior tooltips stay semantically distinct", () => {
    const rvol = getIntelligenceTooltip("rvol20d");
    const prior = getIntelligenceTooltip("volumeRatioPrior");
    expect(rvol).toMatch(/prior 20 valid completed trading sessions/i);
    expect(prior).toMatch(/immediately prior valid session volume/i);
    expect(rvol).not.toMatch(/immediately prior valid session/i);
    expect(prior).not.toMatch(/prior 20/i);
  });

  it("40. valid zero vs unavailable", () => {
    expect(formatCompactDollarVolume(0)).toBe("$0");
    expect(formatCompactDollarVolume(null)).toBe(UNAVAILABLE_DISPLAY);
    expect(formatRatio(0)).toBe("0.0x");
    expect(formatRatio(null)).toBe(UNAVAILABLE_DISPLAY);
  });

  it("41. NaN handling", () => {
    expect(formatCompactDollarVolume(Number.NaN)).toBe(UNAVAILABLE_DISPLAY);
    expect(formatRatio(Number.NaN)).toBe(UNAVAILABLE_DISPLAY);
    expect(formatDiscoveryRank(Number.NaN)).toBe(UNAVAILABLE_DISPLAY);
  });

  it("42. Infinity handling", () => {
    expect(formatCompactDollarVolume(Number.POSITIVE_INFINITY)).toBe(UNAVAILABLE_DISPLAY);
    expect(formatRatio(Number.POSITIVE_INFINITY)).toBe(UNAVAILABLE_DISPLAY);
  });

  it("43. formatter behavior is deterministic", () => {
    expect(formatCompactDollarVolume(59_800_000)).toBe(formatCompactDollarVolume(59_800_000));
    expect(formatTriggerMarketTime("2026-08-12T13:43:00.000Z")).toBe(
      formatTriggerMarketTime("2026-08-12T13:43:00.000Z"),
    );
  });

  it("44. does not mutate normalized inputs", () => {
    const snapshot = structuredClone(sampleInput);
    buildMobileIntelligencePresentation(sampleInput, { showDollarVolume: true });
    formatTradeQuality({
      score: sampleInput.tradeQualityScore,
      label: sampleInput.tradeQualityLabel,
      coveragePct: sampleInput.tradeQualityCoveragePct,
    });
    expect(sampleInput).toEqual(snapshot);
  });
});
