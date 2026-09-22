import { describe, expect, it, vi } from "vitest";
import { BEHAVIOR_PROFILE_VERSION } from "@/config/behavior-profile.config";
import { behaviorProfileFromRow, behaviorProfileToRow } from "@/lib/behavior-profile/behavior-profile-record";
import { buildSecurityBehaviorProfile } from "@/lib/behavior-profile/build-security-behavior-profile";
import { behaviorProfileForwardOutcomesFromAggregate } from "@/lib/behavior-profile/merge-forward-outcome-aggregates";
import {
  MemoryBehaviorProfileRepository,
} from "@/lib/behavior-profile/behavior-profile-repository";
import { profileNeedsRecompute, recomputeSecurityBehaviorProfile } from "@/lib/behavior-profile/recompute-behavior-profile";
import { repeatMoverProfileSnapshotFromBehaviorProfile } from "@/lib/repeat-movers/get-repeat-mover-context";
import { buildHistoricalMemoryFromRepeatMoverContext } from "@/lib/ai-analyst/historical-memory";
import { assertRepeatMoverContextIsEvidenceOnly } from "@/lib/repeat-movers/get-repeat-mover-context";
import type { RepeatMoverContext } from "@/types/repeat-mover";
import type { MarketBehaviorEpisode, SecurityDailyHistory } from "@/types/security-intelligence";
import { etSessionBounds } from "@/lib/historical-backfill/dates";

const SECURITY_ID = "11111111-1111-4111-8111-111111111111";

function daily(sessionDate: string): SecurityDailyHistory {
  return {
    securityId: SECURITY_ID,
    sessionDate,
    observedSymbol: "ABC",
    exchange: "NASDAQ",
    open: 10,
    high: 11,
    low: 9,
    close: 10.5,
    volume: 1_000_000,
    dollarVolume: 10_000_000,
    previousClose: 10,
    movePct: 5,
    source: "test",
    sourceAsOf: null,
    fetchedAt: null,
    computedAt: "2026-09-22T18:00:00.000Z",
    quality: "DERIVED",
    freshness: "UNKNOWN",
    provenance: "DERIVED",
  };
}

function episode(sessionDate: string): MarketBehaviorEpisode {
  const bounds = etSessionBounds(sessionDate)!;
  return {
    episodeId: `ep-${sessionDate}`,
    securityId: SECURITY_ID,
    episodeStart: bounds.open,
    episodeEnd: bounds.close,
    observedSymbol: "ABC",
    direction: "POSITIVE",
    tier: "NOTABLE",
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
    createdAt: "2026-09-22T18:00:00.000Z",
    updatedAt: "2026-09-22T18:00:00.000Z",
    source: "test",
    sourceAsOf: null,
    fetchedAt: null,
    computedAt: "2026-09-22T18:00:00.000Z",
    quality: "DERIVED",
    freshness: "UNKNOWN",
    provenance: "DERIVED",
  };
}

describe("behavior profile v2 forward outcomes", () => {
  const aggregate = {
    episode_count_d1: 2,
    episode_count_d5: 1,
    median_return_d1: 0,
    median_return_d5: null,
    positive_return_d1_count: 0,
    negative_return_d1_count: 0,
    zero_return_d1_count: 2,
    positive_return_d5_count: 0,
    negative_return_d5_count: 0,
    zero_return_d5_count: 0,
    median_max_gain_d1: 3,
    median_max_drawdown_d1: -1,
    median_max_gain_d5: null,
    median_max_drawdown_d5: null,
    observed_next_session_positive_sample_size: 2,
    observed_next_session_positive_continuation_count: 1,
    observed_next_session_negative_sample_size: 0,
    observed_next_session_negative_continuation_count: 0,
  };

  it("merges aggregate with zero return preserved", () => {
    const fo = behaviorProfileForwardOutcomesFromAggregate({ episodeCount: 3, aggregate });
    expect(fo.zeroD1Count).toBe(2);
    expect(fo.medianD1ReturnPct).toBe(0);
    expect(fo.forwardOutcomeCoveragePctD5).toBeCloseTo(33.333, 1);
    expect(fo.episodesWithD5Outcome).toBe(1);
  });

  it("builds v2 profile with partial D5 coverage", () => {
    const profile = buildSecurityBehaviorProfile({
      securityId: SECURITY_ID,
      dailyHistory: [daily("2026-09-01"), daily("2026-09-02"), daily("2026-09-03")],
      episodes: [episode("2026-09-01"), episode("2026-09-02")],
      computedAt: "2026-09-22T19:00:00.000Z",
      forwardOutcomeAggregate: aggregate,
    });
    expect(profile.version).toBe(BEHAVIOR_PROFILE_VERSION);
    expect(profile.forwardOutcomes.episodesWithD1Outcome).toBe(2);
    expect(profile.freshness.forwardOutcomeD1Count).toBe(2);
  });

  it("invalidates v1 stored profile via version mismatch", () => {
    expect(profileNeedsRecompute({
      candidateMaxHistoryDate: "2026-09-03",
      candidateMaxEpisodeDate: "2026-09-02",
      storedLatestHistoryDate: "2026-09-03",
      storedLatestEpisodeDate: "2026-09-02",
      storedProfileVersion: "v1",
    })).toBe(true);
  });

  it("invalidates when forward outcome counts increase", () => {
    expect(profileNeedsRecompute({
      candidateMaxHistoryDate: "2026-09-03",
      candidateMaxEpisodeDate: "2026-09-02",
      storedLatestHistoryDate: "2026-09-03",
      storedLatestEpisodeDate: "2026-09-02",
      storedProfileVersion: BEHAVIOR_PROFILE_VERSION,
      candidateForwardOutcomeD1Count: 5,
      storedForwardOutcomeD1Count: 2,
    })).toBe(true);
  });

  it("round-trips v2 columns through row mapper", () => {
    const built = buildSecurityBehaviorProfile({
      securityId: SECURITY_ID,
      dailyHistory: [daily("2026-09-01")],
      episodes: [episode("2026-09-01")],
      computedAt: "2026-09-22T19:00:00.000Z",
      forwardOutcomeAggregate: aggregate,
    });
    const roundTrip = behaviorProfileFromRow(behaviorProfileToRow(built));
    expect(roundTrip.version).toBe("v2");
    expect(roundTrip.forwardOutcomes.zeroD1Count).toBe(2);
  });

  it("recomputes idempotently with aggregate reader", async () => {
    const memory = new MemoryBehaviorProfileRepository();
    const getAggregate = vi.fn(async () => aggregate);
    const profiles = Object.assign(memory, { getForwardOutcomeAggregate: getAggregate });
    const source = {
      listDailyHistory: async () => [daily("2026-09-01")],
      listEpisodes: async () => [episode("2026-09-01")],
    };
    await recomputeSecurityBehaviorProfile({ securityId: SECURITY_ID, profiles, source });
    await recomputeSecurityBehaviorProfile({ securityId: SECURITY_ID, profiles, source });
    expect(getAggregate).toHaveBeenCalledTimes(2);
    const stored = await memory.getSecurityBehaviorProfile(SECURITY_ID);
    expect(stored?.version).toBe("v2");
  });

  it("exposes forward outcomes on Repeat Movers snapshot and AI memory without predictive fields", () => {
    const profile = buildSecurityBehaviorProfile({
      securityId: SECURITY_ID,
      dailyHistory: [daily("2026-09-01")],
      episodes: [episode("2026-09-01")],
      computedAt: "2026-09-22T19:00:00.000Z",
      forwardOutcomeAggregate: aggregate,
    });
    const snapshot = repeatMoverProfileSnapshotFromBehaviorProfile(profile);
    expect(snapshot.medianD1ReturnPct).toBe(0);
    expect(snapshot.episodesWithD1Outcome).toBe(2);

    const context: RepeatMoverContext = {
      version: "v1",
      securityId: SECURITY_ID,
      currentSymbol: "ABC",
      currentContext: {
        observedSymbol: "ABC",
        sessionDate: "2026-09-01",
        movePct: 5,
        volume: 1,
        rvol: 2,
        dollarVolume: 3,
        direction: "POSITIVE",
        tier: "NOTABLE",
        recordedAt: null,
      },
      profile: snapshot,
      comparableHistory: {
        comparableEpisodeCount: 0,
        closestComparableEpisodes: [],
        mostRecentComparableEpisode: null,
      },
      evidenceLabels: ["LIMITED_HISTORY"],
      assembledAt: "2026-09-22T19:00:00.000Z",
    };
    const memory = buildHistoricalMemoryFromRepeatMoverContext(context);
    expect(memory.medianD1ReturnPct).toBe(0);
    expect(JSON.stringify(memory).toLowerCase()).not.toContain("winrate");
    assertRepeatMoverContextIsEvidenceOnly(context);
  });
});
