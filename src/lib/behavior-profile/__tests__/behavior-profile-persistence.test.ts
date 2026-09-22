import { describe, expect, it, vi } from "vitest";
import { BEHAVIOR_PROFILE_VERSION } from "@/config/behavior-profile.config";
import { behaviorProfileFromRow, behaviorProfileToRow } from "@/lib/behavior-profile/behavior-profile-record";
import {
  MemoryBehaviorProfileRepository,
} from "@/lib/behavior-profile/behavior-profile-repository";
import { getComparableHistoricalEpisodes } from "@/lib/behavior-profile/comparable-historical-episodes";
import { profileNeedsRecompute, recomputeSecurityBehaviorProfile } from "@/lib/behavior-profile/recompute-behavior-profile";
import { recomputeSecurityBehaviorProfiles } from "@/lib/behavior-profile/recompute-security-behavior-profiles";
import { buildSecurityBehaviorProfile } from "@/lib/behavior-profile/build-security-behavior-profile";
import { etSessionBounds } from "@/lib/historical-backfill/dates";
import type { MarketBehaviorEpisode, SecurityDailyHistory } from "@/types/security-intelligence";

const SECURITY_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const RECORDED = "2026-09-22T18:00:00.000Z";

function daily(sessionDate: string, movePct: number): SecurityDailyHistory {
  return {
    securityId: SECURITY_ID,
    sessionDate,
    observedSymbol: "ABC",
    exchange: "NASDAQ",
    open: 10,
    high: 11,
    low: 9,
    close: 10 + movePct / 10,
    volume: 1_000_000,
    dollarVolume: 10_000_000,
    previousClose: 10,
    movePct,
    source: "test",
    sourceAsOf: null,
    fetchedAt: null,
    computedAt: RECORDED,
    quality: "DERIVED",
    freshness: "UNKNOWN",
    provenance: "DERIVED",
  };
}

function episode(sessionDate: string, tier: "NOTABLE" | "SIGNIFICANT" = "NOTABLE"): MarketBehaviorEpisode {
  const bounds = etSessionBounds(sessionDate)!;
  return {
    episodeId: `ep-${sessionDate}`,
    securityId: SECURITY_ID,
    episodeStart: bounds.open,
    episodeEnd: bounds.close,
    observedSymbol: "ABC",
    direction: "POSITIVE",
    tier,
    startPrice: 10,
    highPrice: 11,
    lowPrice: 9,
    endPrice: 10.5,
    maxPositiveMovePct: 10,
    maxNegativeMovePct: -2,
    volume: 1_000_000,
    dollarVolume: 10_000_000,
    rvol: 2,
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

describe("behavior profile persistence", () => {
  it("maps null metrics through row round-trip", () => {
    const built = buildSecurityBehaviorProfile({
      securityId: SECURITY_ID,
      dailyHistory: [daily("2024-01-02", 5)],
      episodes: [],
      computedAt: RECORDED,
      config: { minSessionsForLimitedQuality: 1 },
    });
    const row = behaviorProfileToRow(built);
    expect(row.positive_episode_pct).toBeNull();
    const restored = behaviorProfileFromRow({ ...row, security_id: SECURITY_ID });
    expect(restored.moveBehavior.medianEpisodeMovePct).toBeNull();
    expect(restored.freshness.sourceDailyRowCount).toBe(1);
  });

  it("inserts and updates profile idempotently", async () => {
    const profiles = new MemoryBehaviorProfileRepository();
    const source = {
      listDailyHistory: async () => [daily("2024-01-02", 8), daily("2024-01-03", 9)],
      listEpisodes: async () => [episode("2024-01-02")],
    };
    const first = await recomputeSecurityBehaviorProfile({
      securityId: SECURITY_ID,
      profiles,
      source,
      computedAt: RECORDED,
    });
    const second = await recomputeSecurityBehaviorProfile({
      securityId: SECURITY_ID,
      profiles,
      source,
      computedAt: RECORDED,
    });
    expect(first.profile.coverage.episodeCount).toBe(1);
    expect(second.profile.coverage.episodeCount).toBe(1);
    const stored = await profiles.getSecurityBehaviorProfile(SECURITY_ID);
    expect(stored?.coverage.sessionsObserved).toBe(2);
    expect(stored?.freshness.latestSourceHistoryDate).toBe("2024-01-03");
  });

  it("detects freshness staleness when history extends", () => {
    expect(profileNeedsRecompute({
      candidateMaxHistoryDate: "2024-02-01",
      candidateMaxEpisodeDate: null,
      storedLatestHistoryDate: "2024-01-01",
      storedLatestEpisodeDate: null,
      storedProfileVersion: BEHAVIOR_PROFILE_VERSION,
    })).toBe(true);
    expect(profileNeedsRecompute({
      candidateMaxHistoryDate: "2024-01-01",
      candidateMaxEpisodeDate: null,
      storedLatestHistoryDate: "2024-01-01",
      storedLatestEpisodeDate: null,
      storedProfileVersion: BEHAVIOR_PROFILE_VERSION,
    })).toBe(false);
    expect(profileNeedsRecompute({
      candidateMaxHistoryDate: "2024-01-01",
      candidateMaxEpisodeDate: null,
      storedLatestHistoryDate: "2024-01-01",
      storedLatestEpisodeDate: null,
      storedProfileVersion: "v0",
    })).toBe(true);
  });

  it("batch recomputes with resume cursor and skips fresh profiles", async () => {
    const profiles = new MemoryBehaviorProfileRepository();
    profiles.candidates.push(
      {
        securityId: SECURITY_ID,
        maxHistoryDate: "2024-03-01",
        maxEpisodeDate: "2024-03-01",
        dailyRowCount: 2,
        episodeRowCount: 1,
        profileComputedAt: null,
        profileLatestHistoryDate: null,
        profileLatestEpisodeDate: null,
        profileVersion: null,
      },
      {
        securityId: OTHER_ID,
        maxHistoryDate: "2024-03-02",
        maxEpisodeDate: null,
        dailyRowCount: 1,
        episodeRowCount: 0,
        profileComputedAt: RECORDED,
        profileLatestHistoryDate: "2024-03-02",
        profileLatestEpisodeDate: null,
        profileVersion: BEHAVIOR_PROFILE_VERSION,
      },
    );
    const listEpisodes = vi.fn(async (securityId: string) =>
      securityId === SECURITY_ID ? [episode("2024-03-01")] : [],
    );
    const source = {
      listDailyHistory: async (securityId: string) =>
        securityId === SECURITY_ID
          ? [daily("2024-03-01", 10)]
          : [{ ...daily("2024-03-02", 2), securityId: OTHER_ID }],
      listEpisodes,
    };
    const batch = await recomputeSecurityBehaviorProfiles({
      profiles,
      source,
      batchSize: 2,
    });
    expect(batch.processed).toBe(2);
    expect(batch.recomputed).toBe(1);
    expect(batch.skipped).toBe(1);
    expect(batch.done).toBe(false);
    expect(batch.nextAfterSecurityId).toBe(OTHER_ID);
    expect(await profiles.getSecurityBehaviorProfile(SECURITY_ID)).not.toBeNull();
    expect(await profiles.getSecurityBehaviorProfile(OTHER_ID)).toBeNull();
  });

  it("returns comparable episodes for same security with similarity evidence", () => {
    const episodes = [episode("2024-04-01"), episode("2024-04-02", "SIGNIFICANT")];
    const comparables = getComparableHistoricalEpisodes({
      securityId: SECURITY_ID,
      dailyHistory: [daily("2024-04-01", 10), daily("2024-04-02", 12)],
      episodes,
      currentContext: { direction: "POSITIVE", movePct: 12, tier: "SIGNIFICANT", sessionDate: "2024-04-02" },
      config: { comparableMovePctTolerance: 3 },
      limit: 5,
    });
    expect(comparables).toHaveLength(1);
    expect(comparables[0]?.sessionDate).toBe("2024-04-01");
    expect(comparables[0]?.similarity.movePctDelta).toBe(2);
    expect(comparables[0]).not.toHaveProperty("winProbability");
  });
});
