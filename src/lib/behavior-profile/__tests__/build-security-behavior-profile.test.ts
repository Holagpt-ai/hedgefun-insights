import { describe, expect, it } from "vitest";
import { etSessionBounds } from "@/lib/historical-backfill/dates";
import { buildSecurityBehaviorProfile } from "@/lib/behavior-profile/build-security-behavior-profile";
import type { MarketBehaviorEpisode, SecurityDailyHistory } from "@/types/security-intelligence";

const SECURITY_ID = "11111111-1111-4111-8111-111111111111";
const RECORDED = "2026-09-22T16:00:00.000Z";

function daily(
  sessionDate: string,
  overrides: Partial<SecurityDailyHistory> = {},
): SecurityDailyHistory {
  return {
    securityId: SECURITY_ID,
    sessionDate,
    observedSymbol: "TEST",
    exchange: "NASDAQ",
    open: 10,
    high: 12,
    low: 9,
    close: 11,
    volume: 1_000_000,
    dollarVolume: 11_000_000,
    previousClose: 10,
    movePct: 10,
    source: "test",
    sourceAsOf: null,
    fetchedAt: null,
    computedAt: RECORDED,
    quality: "DERIVED",
    freshness: "UNKNOWN",
    provenance: "DERIVED",
    ...overrides,
  };
}

function episode(
  sessionDate: string,
  overrides: Partial<MarketBehaviorEpisode> = {},
): MarketBehaviorEpisode {
  const bounds = etSessionBounds(sessionDate)!;
  return {
    episodeId: `ep-${sessionDate}`,
    securityId: SECURITY_ID,
    episodeStart: bounds.open,
    episodeEnd: bounds.close,
    observedSymbol: "TEST",
    direction: "POSITIVE",
    tier: "NOTABLE",
    startPrice: 10,
    highPrice: 12,
    lowPrice: 9,
    endPrice: 11,
    maxPositiveMovePct: 20,
    maxNegativeMovePct: -5,
    volume: 1_000_000,
    dollarVolume: 11_000_000,
    rvol: 3,
    floatTurnover: null,
    haltCount: null,
    closeStrength: null,
    detectedBy: "HISTORICAL_DAILY_V1",
    origin: "HISTORICAL_BACKFILL",
    createdAt: RECORDED,
    updatedAt: RECORDED,
    source: "test",
    sourceAsOf: null,
    fetchedAt: null,
    computedAt: RECORDED,
    quality: "DERIVED",
    freshness: "UNKNOWN",
    provenance: "DERIVED",
    ...overrides,
  };
}

describe("buildSecurityBehaviorProfile", () => {
  it("returns insufficient coverage when no episodes exist", () => {
    const profile = buildSecurityBehaviorProfile({
      securityId: SECURITY_ID,
      dailyHistory: [daily("2024-01-02"), daily("2024-01-03")],
      episodes: [],
      computedAt: RECORDED,
    });
    expect(profile.coverage.sessionsObserved).toBe(2);
    expect(profile.coverage.episodeCount).toBe(0);
    expect(profile.coverage.sampleSizeQuality).toBe("INSUFFICIENT");
    expect(profile.episodeDistribution.positiveEpisodePct).toBeNull();
  });

  it("aggregates tier, direction, move, volume, and recurrence from episodes", () => {
    const dailyHistory = [
      daily("2024-01-02", { movePct: 8, close: 10.8, high: 11, low: 10, volume: 500_000, dollarVolume: 5_400_000 }),
      daily("2024-01-03", { movePct: 12, close: 12.1, high: 12.5, low: 11, volume: 2_000_000, dollarVolume: 24_200_000 }),
      daily("2024-01-04", { movePct: -15, close: 10.3, high: 11, low: 10.2, volume: 1_500_000, dollarVolume: 15_450_000 }),
      daily("2024-01-05", { movePct: 6, close: 10.9, high: 11, low: 10.5, volume: 800_000, dollarVolume: 8_720_000 }),
    ];
    const episodes = [
      episode("2024-01-02", { tier: "NOTABLE", direction: "POSITIVE", rvol: 2 }),
      episode("2024-01-03", { tier: "SIGNIFICANT", direction: "POSITIVE", rvol: 5, maxPositiveMovePct: 25 }),
      episode("2024-01-04", { tier: "EXTREME", direction: "NEGATIVE", rvol: 4, maxNegativeMovePct: -18 }),
    ];
    const profile = buildSecurityBehaviorProfile({
      securityId: SECURITY_ID,
      dailyHistory,
      episodes,
      computedAt: RECORDED,
      config: { minSessionsForLimitedQuality: 4 },
    });

    expect(profile.observedSymbol).toBe("TEST");
    expect(profile.coverage.historyStartDate).toBe("2024-01-02");
    expect(profile.coverage.historyEndDate).toBe("2024-01-05");
    expect(profile.coverage.episodeCount).toBe(3);
    expect(profile.coverage.sampleSizeQuality).toBe("LIMITED");
    expect(profile.episodeDistribution).toMatchObject({
      notableCount: 1,
      significantCount: 1,
      extremeCount: 1,
      positiveEpisodeCount: 2,
      negativeEpisodeCount: 1,
      mixedEpisodeCount: 0,
    });
    expect(profile.episodeDistribution.positiveEpisodePct).toBeCloseTo(66.666, 2);
    expect(profile.episodeDistribution.negativeEpisodePct).toBeCloseTo(33.333, 2);
    expect(profile.moveBehavior.medianEpisodeMovePct).toBe(8);
    expect(profile.moveBehavior.maxPositiveEpisodeMovePct).toBe(25);
    expect(profile.moveBehavior.maxNegativeEpisodeMovePct).toBe(-18);
    expect(profile.volumeBehavior.medianEpisodeRvol).toBe(4);
    expect(profile.volumeBehavior.maxEpisodeRvol).toBe(5);
    expect(profile.recurrence.mostRecentEpisodeDate).toBe("2024-01-04");
    expect(profile.recurrence.medianDaysBetweenEpisodes).toBe(1);
    expect(profile.recurrence.episodesPer30Sessions).toBeNull();
    expect(profile.recurrence.episodesPer90Sessions).toBeNull();
  });

  it("derives close behavior from daily range on episode sessions", () => {
    const dailyHistory = [
      daily("2024-02-01", { high: 10, low: 0, close: 9.5, movePct: 15 }),
      daily("2024-02-02", { high: 10, low: 0, close: 1, movePct: -12 }),
    ];
    const episodes = [
      episode("2024-02-01", { direction: "POSITIVE" }),
      episode("2024-02-02", { direction: "NEGATIVE" }),
    ];
    const profile = buildSecurityBehaviorProfile({
      securityId: SECURITY_ID,
      dailyHistory,
      episodes,
      computedAt: RECORDED,
    });
    expect(profile.closeBehavior.positiveEpisodesClosingUpperQuartilePct).toBe(100);
    expect(profile.closeBehavior.positiveEpisodesClosingNearHighPct).toBe(100);
    expect(profile.closeBehavior.negativeEpisodesClosingNearLowPct).toBe(100);
  });

  it("counts next-session continuation from consecutive daily rows", () => {
    const dailyHistory = [
      daily("2024-03-01", { movePct: 10 }),
      daily("2024-03-04", { movePct: 2 }),
      daily("2024-03-05", { movePct: -8 }),
      daily("2024-03-06", { movePct: -1 }),
    ];
    const episodes = [
      episode("2024-03-01", { direction: "POSITIVE" }),
      episode("2024-03-05", { direction: "NEGATIVE" }),
    ];
    const profile = buildSecurityBehaviorProfile({
      securityId: SECURITY_ID,
      dailyHistory,
      episodes,
      computedAt: RECORDED,
    });
    expect(profile.continuation.nextSessionPositiveContinuationCount).toBe(1);
    expect(profile.continuation.nextSessionNegativeContinuationCount).toBe(1);
    expect(profile.continuation.continuationSampleSize).toBe(2);
    expect(profile.continuation.nextSessionPositiveContinuationRate).toBe(100);
    expect(profile.continuation.nextSessionNegativeContinuationRate).toBe(100);
    expect(profile.freshness.sourceDailyRowCount).toBe(4);
    expect(profile.freshness.sourceEpisodeCount).toBe(2);
  });

  it("counts prior episodes comparable to the most recent by direction and move band", () => {
    const dailyHistory = [
      daily("2024-04-01", { movePct: 10 }),
      daily("2024-04-02", { movePct: 11 }),
      daily("2024-04-03", { movePct: 12 }),
    ];
    const episodes = [
      episode("2024-04-01", { direction: "POSITIVE" }),
      episode("2024-04-02", { direction: "POSITIVE" }),
      episode("2024-04-03", { direction: "POSITIVE" }),
    ];
    const profile = buildSecurityBehaviorProfile({
      securityId: SECURITY_ID,
      dailyHistory,
      episodes,
      computedAt: RECORDED,
      config: { comparableMovePctTolerance: 1.5 },
    });
    expect(profile.recurrence.priorComparableEpisodeCount).toBe(1);
  });

  it("ignores rows for other securities", () => {
    const otherId = "22222222-2222-4222-8222-222222222222";
    const profile = buildSecurityBehaviorProfile({
      securityId: SECURITY_ID,
      dailyHistory: [
        daily("2024-05-01"),
        { ...daily("2024-05-02"), securityId: otherId },
      ],
      episodes: [
        episode("2024-05-01"),
        { ...episode("2024-05-02"), securityId: otherId },
      ],
      computedAt: RECORDED,
    });
    expect(profile.coverage.sessionsObserved).toBe(1);
    expect(profile.coverage.episodeCount).toBe(1);
  });
});
