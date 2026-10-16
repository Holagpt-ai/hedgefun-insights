import { describe, expect, it } from "vitest";
import {
  buildCurrentSetupFromRadarRow,
  dedupeHistoricalTopMatches,
  filterComparableEpisodesForSession,
  rankHistoricalMatches,
  type HistoricalTopMatch,
} from "@/lib/historical-intelligence/historical-match-engine";
import { summarizeHistoricalMatches } from "@/lib/historical-intelligence/historical-match-summary";
import { formatHistoricalMatchChip } from "@/lib/historical-intelligence/radar-handoff";
import type { RepeatMoverComparableEpisode, RepeatMoverContext } from "@/types/repeat-mover";

function episode(
  partial: Partial<RepeatMoverComparableEpisode> & Pick<RepeatMoverComparableEpisode, "episodeId" | "sessionDate">,
): RepeatMoverComparableEpisode {
  return {
    tier: "NOTABLE",
    direction: "POSITIVE",
    movePct: 10,
    volume: 1_000_000,
    rvol: 3,
    dollarVolume: null,
    closePosition: 0.7,
    nextSessionMovePct: null,
    nextSessionContinuation: null,
    similarity: { sameDirection: true, sameTier: true, movePctDelta: 1 },
    ...partial,
  };
}

function contextWithEpisodes(
  episodes: RepeatMoverComparableEpisode[],
  sessionDate = "2026-09-26",
): RepeatMoverContext {
  return {
    version: "v1",
    securityId: "11111111-1111-1111-1111-111111111111" as RepeatMoverContext["securityId"],
    currentSymbol: "AAA",
    currentContext: {
      observedSymbol: "AAA",
      sessionDate,
      movePct: 12,
      volume: 2_000_000,
      rvol: 4,
      dollarVolume: null,
      direction: "POSITIVE",
      tier: "NOTABLE",
      recordedAt: null,
    },
    profile: {
      profileAvailable: true,
      sampleSizeQuality: "ADEQUATE",
      sessionsObserved: 40,
      episodeCount: 8,
      notableCount: 3,
      significantCount: 1,
      extremeCount: 0,
      positiveEpisodeCount: null,
      negativeEpisodeCount: null,
      mixedEpisodeCount: null,
      positiveEpisodePct: null,
      negativeEpisodePct: null,
      episodesPer30Sessions: null,
      episodesPer90Sessions: null,
      medianDaysBetweenEpisodes: null,
      positiveCloseUpperQuartilePct: null,
      positiveCloseNearHighPct: null,
      negativeCloseNearLowPct: null,
      nextSessionPositiveContinuationRate: null,
      nextSessionNegativeContinuationRate: null,
      historyStartDate: "2024-01-01",
      historyEndDate: "2026-09-20",
      computedAt: null,
      latestSourceHistoryDate: "2026-09-20",
      latestEpisodeDateUsed: null,
      sourceDailyRowCount: 40,
      sourceEpisodeCount: 8,
      episodesWithD1Outcome: null,
      episodesWithD5Outcome: null,
      forwardOutcomeCoveragePctD1: null,
      medianD1ReturnPct: null,
      medianD5ReturnPct: null,
      positiveD1Pct: null,
      negativeD1Pct: null,
      observedNextSessionSampleSize: null,
      observedNextSessionPositivePct: null,
      observedNextSessionNegativePct: null,
    },
    comparableHistory: {
      comparableEpisodeCount: episodes.length,
      closestComparableEpisodes: episodes,
      mostRecentComparableEpisode: episodes[0] ?? null,
    },
    evidenceLabels: [],
    assembledAt: "2026-09-26T12:00:00.000Z",
  };
}

const current = buildCurrentSetupFromRadarRow({
  symbol: "AAA",
  change_percent: 12,
  volume: 2_000_000,
  rvol: 4,
  rvol_5m: 3,
  vol_velocity: 40_000,
  primary_scanner_event: "RUNNING_UP",
});

describe("Batch 10 — historical outcome integrity", () => {
  it("counts five comparables but only two known continuation outcomes in the rate", () => {
    const episodes = [
      episode({ episodeId: "e1", sessionDate: "2026-08-01", nextSessionContinuation: true, nextSessionMovePct: 2 }),
      episode({ episodeId: "e2", sessionDate: "2026-08-02", nextSessionContinuation: false, nextSessionMovePct: -1 }),
      episode({ episodeId: "e3", sessionDate: "2026-08-03", nextSessionContinuation: null }),
      episode({ episodeId: "e4", sessionDate: "2026-08-04", nextSessionContinuation: null }),
      episode({ episodeId: "e5", sessionDate: "2026-08-05", nextSessionContinuation: null }),
    ];
    const summary = summarizeHistoricalMatches(rankHistoricalMatches(current, contextWithEpisodes(episodes)));
    expect(summary.matchCount).toBe(5);
    expect(summary.continuationKnownCount).toBe(2);
    expect(summary.continuationRate).toBe(0.5);
    expect(summary.outcomeObservedCount).toBeGreaterThanOrEqual(2);
  });

  it("excludes null continuation from rate denominators", () => {
    const episodes = [
      episode({ episodeId: "e1", sessionDate: "2026-08-01", nextSessionContinuation: null }),
    ];
    const summary = summarizeHistoricalMatches(rankHistoricalMatches(current, contextWithEpisodes(episodes)));
    expect(summary.continuationKnownCount).toBe(0);
    expect(summary.continuationRate).toBeNull();
  });

  it("computes medians only from valid observations", () => {
    const episodes = [
      episode({
        episodeId: "e1",
        sessionDate: "2026-08-01",
        nextSessionMovePct: 4,
        nextSessionContinuation: true,
      }),
      episode({
        episodeId: "e2",
        sessionDate: "2026-08-02",
        nextSessionMovePct: null,
        nextSessionContinuation: null,
      }),
    ];
    const summary = summarizeHistoricalMatches(rankHistoricalMatches(current, contextWithEpisodes(episodes)));
    expect(summary.medianNextSessionReturn).toBe(4);
    expect(summary.medianMfe).toBeNull();
    expect(summary.medianMae).toBeNull();
  });

  it("dedupes duplicate episode IDs", () => {
    const dup: HistoricalTopMatch = {
      episodeId: "dup",
      date: "2026-08-01",
      similarityScore: 0.8,
      setup: null,
      catalystType: null,
      continuation: null,
      nextDayReturn: null,
      mfe: null,
      mae: null,
      featuresCompared: 3,
      featuresWithBothSides: 3,
      matchEvidenceQuality: "MODERATE",
    };
    const deduped = dedupeHistoricalTopMatches([
      dup,
      { ...dup, similarityScore: 0.6 },
      { ...dup, similarityScore: 0.9 },
    ]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.similarityScore).toBe(0.9);
  });

  it("excludes current-session and future episodes when session date is known", () => {
    const episodes = [
      episode({ episodeId: "past", sessionDate: "2026-09-20" }),
      episode({ episodeId: "today", sessionDate: "2026-09-26" }),
      episode({ episodeId: "future", sessionDate: "2026-09-27" }),
    ];
    const filtered = filterComparableEpisodesForSession(episodes, "2026-09-26");
    expect(filtered.map((e) => e.episodeId)).toEqual(["past"]);
  });
});

describe("Batch 10 — evidence quality presentation", () => {
  it("labels sparse-feature matches and limited outcome coverage honestly", () => {
    const episodes = [
      episode({ episodeId: "e1", sessionDate: "2026-08-01", movePct: null, rvol: null, volume: null }),
      episode({ episodeId: "e2", sessionDate: "2026-08-02", movePct: null, rvol: null, volume: null }),
    ];
    const summary = summarizeHistoricalMatches(rankHistoricalMatches(current, contextWithEpisodes(episodes)));
    expect(summary.matchSimilarityQuality).toBe("SPARSE");
    expect(summary.outcomeConfidence).toBe("INSUFFICIENT");
    const chip = formatHistoricalMatchChip(summary);
    expect(chip).toMatch(/Limited outcome history/);
  });

  it("shows limited outcome history instead of unsupported continuation percent", () => {
    const episodes = [
      episode({ episodeId: "e1", sessionDate: "2026-08-01", nextSessionContinuation: true }),
    ];
    const summary = summarizeHistoricalMatches(rankHistoricalMatches(current, contextWithEpisodes(episodes)));
    expect(summary.continuationRate).toBeNull();
    expect(formatHistoricalMatchChip(summary)).toMatch(/Limited outcome history/);
  });
});
