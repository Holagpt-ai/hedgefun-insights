import { describe, expect, it } from "vitest";
import { MemoryBehaviorProfileRepository } from "@/lib/behavior-profile/behavior-profile-repository";
import { buildSecurityBehaviorProfile } from "@/lib/behavior-profile/build-security-behavior-profile";
import { etSessionBounds } from "@/lib/historical-backfill/dates";
import { deriveRepeatMoverEvidenceLabels } from "@/lib/repeat-movers/derive-repeat-mover-evidence-labels";
import {
  assertRepeatMoverContextIsEvidenceOnly,
  getRepeatMoverContext,
  unavailableRepeatMoverProfileSnapshot,
} from "@/lib/repeat-movers/get-repeat-mover-context";
import { normalizeRepeatMoverCurrentContext } from "@/lib/repeat-movers/normalize-repeat-mover-context";
import type { MarketBehaviorEpisode, SecurityDailyHistory } from "@/types/security-intelligence";

const SECURITY_ID = "11111111-1111-4111-8111-111111111111";
const RECORDED = "2026-09-22T20:00:00.000Z";

function daily(sessionDate: string, movePct: number, overrides: Partial<SecurityDailyHistory> = {}): SecurityDailyHistory {
  return {
    securityId: SECURITY_ID,
    sessionDate,
    observedSymbol: "ABC",
    exchange: "NASDAQ",
    open: 10,
    high: 11,
    low: 9,
    close: 10 + movePct / 10,
    volume: null,
    dollarVolume: null,
    previousClose: 10,
    movePct,
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

function episode(sessionDate: string, movePct: number): MarketBehaviorEpisode {
  const bounds = etSessionBounds(sessionDate)!;
  return {
    episodeId: `ep-${sessionDate}`,
    securityId: SECURITY_ID,
    episodeStart: bounds.open,
    episodeEnd: bounds.close,
    observedSymbol: "ABC",
    direction: movePct >= 0 ? "POSITIVE" : "NEGATIVE",
    tier: "NOTABLE",
    startPrice: 10,
    highPrice: 11,
    lowPrice: 9,
    endPrice: 10.5,
    maxPositiveMovePct: Math.abs(movePct),
    maxNegativeMovePct: -2,
    volume: null,
    rvol: null,
    dollarVolume: null,
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
  };
}

describe("Repeat Movers V1", () => {
  it("normalizes null volume/RVOL without zero-filling", () => {
    const normalized = normalizeRepeatMoverCurrentContext({
      symbol: "abc",
      movePct: 5,
      volume: undefined,
      rvol: null,
    });
    expect(normalized.volume).toBeNull();
    expect(normalized.rvol).toBeNull();
    expect(normalized.direction).toBe("POSITIVE");
    expect(normalized.observedSymbol).toBe("ABC");
  });

  it("returns unavailable profile when behavior profile missing", async () => {
    const profiles = new MemoryBehaviorProfileRepository();
    const context = await getRepeatMoverContext({
      securityId: SECURITY_ID,
      currentContext: { symbol: "ABC", movePct: 10 },
      data: {
        getBehaviorProfile: () => profiles.getSecurityBehaviorProfile(SECURITY_ID),
        listDailyHistory: async () => [],
        listEpisodes: async () => [],
      },
      assembledAt: RECORDED,
    });
    expect(context.profile).toEqual(unavailableRepeatMoverProfileSnapshot());
    expect(context.profile.profileAvailable).toBe(false);
    expect(context.comparableHistory.comparableEpisodeCount).toBe(0);
    expect(context.evidenceLabels).toEqual(["NO_HISTORY"]);
    assertRepeatMoverContextIsEvidenceOnly(context);
  });

  it("assembles profile, comparables, and freshness for partial history", async () => {
    const profiles = new MemoryBehaviorProfileRepository();
    const dailyHistory = [
      daily("2024-01-02", 10, { volume: 1_000_000, dollarVolume: 10_000_000 }),
      daily("2024-01-03", 2, { volume: 500_000, dollarVolume: 5_000_000 }),
      daily("2024-01-04", 11, { volume: 800_000, dollarVolume: 8_000_000 }),
    ];
    const episodes = [episode("2024-01-02", 10), episode("2024-01-04", 11)];
    const built = buildSecurityBehaviorProfile({
      securityId: SECURITY_ID,
      dailyHistory,
      episodes,
      computedAt: RECORDED,
      config: { minSessionsForLimitedQuality: 3 },
    });
    await profiles.upsertSecurityBehaviorProfile(built);

    const context = await getRepeatMoverContext({
      securityId: SECURITY_ID,
      currentContext: {
        symbol: "ABC",
        movePct: 11,
        direction: "POSITIVE",
        tier: "NOTABLE",
        sessionDate: "2024-01-05",
        volume: 900_000,
        rvol: 1.8,
      },
      data: {
        getBehaviorProfile: () => profiles.getSecurityBehaviorProfile(SECURITY_ID),
        listDailyHistory: async () => dailyHistory,
        listEpisodes: async () => episodes,
      },
      assembledAt: RECORDED,
      comparableLimit: 5,
    });

    expect(context.profile.profileAvailable).toBe(true);
    expect(context.profile.sampleSizeQuality).toBe("LIMITED");
    expect(context.profile.sessionsObserved).toBe(3);
    expect(context.profile.latestSourceHistoryDate).toBe("2024-01-04");
    expect(context.comparableHistory.comparableEpisodeCount).toBe(1);
    expect(context.comparableHistory.mostRecentComparableEpisode?.sessionDate).toBe("2024-01-02");
    expect(context.comparableHistory.closestComparableEpisodes[0]?.nextSessionMovePct).toBe(2);
    expect(context.evidenceLabels).toContain("SIMILAR_PRIOR_EPISODES_FOUND");
    expect(context.evidenceLabels).toContain("LIMITED_HISTORY");
    expect(JSON.stringify(context)).not.toMatch(/probability|confidence|prediction/i);
  });

  it("orders comparables by move delta then date", async () => {
    const profiles = new MemoryBehaviorProfileRepository();
    const dailyHistory = [
      daily("2024-02-01", 8),
      daily("2024-02-02", 12),
      daily("2024-02-03", 20),
    ];
    const episodes = [
      episode("2024-02-01", 8),
      episode("2024-02-02", 12),
      episode("2024-02-03", 20),
    ];
    await profiles.upsertSecurityBehaviorProfile(buildSecurityBehaviorProfile({
      securityId: SECURITY_ID,
      dailyHistory,
      episodes,
      computedAt: RECORDED,
      config: { minSessionsForLimitedQuality: 1 },
    }));

    const context = await getRepeatMoverContext({
      securityId: SECURITY_ID,
      currentContext: { movePct: 11, direction: "POSITIVE", sessionDate: "2024-02-04" },
      data: {
        getBehaviorProfile: () => profiles.getSecurityBehaviorProfile(SECURITY_ID),
        listDailyHistory: async () => dailyHistory,
        listEpisodes: async () => episodes,
      },
      assembledAt: RECORDED,
    });
    expect(context.comparableHistory.comparableEpisodeCount).toBe(2);
    expect(context.comparableHistory.closestComparableEpisodes[0]?.sessionDate).toBe("2024-02-02");
  });

  it("returns zero comparables when no prior episode matches move band", async () => {
    const profiles = new MemoryBehaviorProfileRepository();
    const dailyHistory = [daily("2024-03-01", 3)];
    const episodes = [episode("2024-03-01", 3)];
    await profiles.upsertSecurityBehaviorProfile(buildSecurityBehaviorProfile({
      securityId: SECURITY_ID,
      dailyHistory,
      episodes,
      computedAt: RECORDED,
      config: { minSessionsForLimitedQuality: 1 },
    }));

    const context = await getRepeatMoverContext({
      securityId: SECURITY_ID,
      currentContext: { movePct: 25, direction: "POSITIVE", sessionDate: "2024-03-02" },
      data: {
        getBehaviorProfile: () => profiles.getSecurityBehaviorProfile(SECURITY_ID),
        listDailyHistory: async () => dailyHistory,
        listEpisodes: async () => episodes,
      },
      assembledAt: RECORDED,
    });

    expect(context.profile.profileAvailable).toBe(true);
    expect(context.comparableHistory.comparableEpisodeCount).toBe(0);
    expect(context.evidenceLabels).not.toContain("SIMILAR_PRIOR_EPISODES_FOUND");
    assertRepeatMoverContextIsEvidenceOnly(context);
  });

  it("passes freshness and coverage fields from stored profile without zero-fill", async () => {
    const profiles = new MemoryBehaviorProfileRepository();
    const built = buildSecurityBehaviorProfile({
      securityId: SECURITY_ID,
      dailyHistory: [daily("2024-05-01", 5)],
      episodes: [episode("2024-05-01", 5)],
      computedAt: "2026-09-21T12:00:00.000Z",
      config: { minSessionsForLimitedQuality: 1 },
    });
    await profiles.upsertSecurityBehaviorProfile(built);

    const context = await getRepeatMoverContext({
      securityId: SECURITY_ID,
      currentContext: { movePct: 5, sessionDate: "2024-05-02" },
      data: {
        getBehaviorProfile: () => profiles.getSecurityBehaviorProfile(SECURITY_ID),
        listDailyHistory: async () => [],
        listEpisodes: async () => [],
      },
      assembledAt: RECORDED,
    });

    expect(context.profile.computedAt).toBe("2026-09-21T12:00:00.000Z");
    expect(context.profile.sourceDailyRowCount).toBe(built.freshness.sourceDailyRowCount);
    expect(context.profile.latestSourceHistoryDate).toBe("2024-05-01");
    expect(unavailableRepeatMoverProfileSnapshot().episodeCount).toBeNull();
  });

  it("labels no comparables without similar label", () => {
    const profile = {
      ...unavailableRepeatMoverProfileSnapshot(),
      profileAvailable: true,
      sampleSizeQuality: "ADEQUATE" as const,
      episodeCount: 10,
      episodesPer30Sessions: 2,
    };
    const labels = deriveRepeatMoverEvidenceLabels({
      profile,
      comparableHistory: {
        comparableEpisodeCount: 0,
        closestComparableEpisodes: [],
        mostRecentComparableEpisode: null,
      },
    });
    expect(labels).toContain("RECURRING_MOVER");
    expect(labels).not.toContain("SIMILAR_PRIOR_EPISODES_FOUND");
  });
});
