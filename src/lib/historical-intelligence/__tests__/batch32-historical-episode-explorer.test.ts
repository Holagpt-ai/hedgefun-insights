import { describe, expect, it } from "vitest";
import {
  buildEpisodeMatchRationale,
  buildHistoricalEpisodeExplorerModel,
  listHistoricalExplorerEpisodes,
} from "@/lib/historical-intelligence/historical-episode-explorer";
import type { RepeatMoverIntradayEvidence } from "@/lib/intraday-reconstruction/intraday-reconstruction-types";
import type { RepeatMoverComparableEpisode, RepeatMoverContext } from "@/types/repeat-mover";

function intradayEvidence(
  partial: Partial<RepeatMoverIntradayEvidence> & Record<string, unknown> = {},
): RepeatMoverIntradayEvidence {
  return {
    hodAt: null,
    closeVsHodPct: null,
    largestPullbackPct: null,
    recoveredFromPullback: null,
    haltCount: null,
    vwapReclaimCount: null,
    largestVolumeBurstAt: null,
    completenessState: "COMPLETE",
    ...partial,
  } as RepeatMoverIntradayEvidence;
}

const NOW = Date.parse("2026-09-22T16:00:00.000Z");

function baseEpisode(overrides: Partial<RepeatMoverComparableEpisode> = {}): RepeatMoverComparableEpisode {
  return {
    episodeId: "ep-1",
    sessionDate: "2026-08-15",
    tier: "SIGNIFICANT",
    direction: "POSITIVE",
    movePct: 12,
    volume: 900_000,
    rvol: 2.4,
    dollarVolume: null,
    closePosition: null,
    nextSessionMovePct: 4,
    nextSessionContinuation: true,
    similarity: { sameDirection: true, sameTier: true, movePctDelta: 2 },
    ...overrides,
  };
}

const context: RepeatMoverContext = {
  version: "v1",
  securityId: "11111111-1111-4111-8111-111111111111",
  currentSymbol: "MOVE",
  currentContext: {
    observedSymbol: "MOVE",
    sessionDate: "2026-09-22",
    movePct: 15,
    volume: 1_000_000,
    rvol: 3,
    dollarVolume: null,
    direction: "POSITIVE",
    tier: "SIGNIFICANT",
    recordedAt: "2026-09-22T15:00:00.000Z",
  },
  profile: {
    profileAvailable: true,
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
    sampleSizeQuality: "ADEQUATE",
    sessionsObserved: 40,
    episodeCount: 6,
    notableCount: 4,
    significantCount: 2,
    extremeCount: 0,
    positiveEpisodeCount: 6,
    negativeEpisodeCount: 0,
    mixedEpisodeCount: 0,
    positiveEpisodePct: 100,
    negativeEpisodePct: 0,
    episodesPer30Sessions: 3,
    episodesPer90Sessions: 6,
    medianDaysBetweenEpisodes: 5,
    positiveCloseUpperQuartilePct: null,
    positiveCloseNearHighPct: null,
    negativeCloseNearLowPct: null,
    nextSessionPositiveContinuationRate: null,
    nextSessionNegativeContinuationRate: null,
    historyStartDate: "2026-01-02",
    historyEndDate: "2026-09-19",
    computedAt: "2026-09-22T15:00:00.000Z",
    latestSourceHistoryDate: "2026-09-19",
    latestEpisodeDateUsed: "2026-09-12",
    sourceDailyRowCount: 40,
    sourceEpisodeCount: 6,
  },
  comparableHistory: {
    comparableEpisodeCount: 2,
    closestComparableEpisodes: [baseEpisode(), baseEpisode({ episodeId: "ep-2", sessionDate: "2026-07-01" })],
    mostRecentComparableEpisode: null,
  },
  evidenceLabels: [],
  assembledAt: "2026-09-22T15:00:00.000Z",
};

describe("Batch 32 historical episode explorer", () => {
  it("lists bounded episodes in stored order", () => {
    const models = listHistoricalExplorerEpisodes(context, "MOVE", { max: 1, nowMs: NOW });
    expect(models).toHaveLength(1);
    expect(models[0]?.episodeId).toBe("ep-1");
  });

  it("sorts replay steps chronologically and rejects future timestamps", () => {
    const model = buildHistoricalEpisodeExplorerModel({
      episode: baseEpisode({
        observedIntradayReconstruction: intradayEvidence({
          hodAt: "2026-08-15T19:00:00.000Z",
          largestVolumeBurstAt: "2026-08-15T18:30:00.000Z",
          vwapReclaimCount: 2,
        }),
      }),
      symbol: "MOVE",
      nowMs: NOW,
    });
    expect(model.replayMode).toBe("observation_timeline");
    const times = model.replaySteps
      .map((s) => s.eventAtMs)
      .filter((ms): ms is number => ms != null);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(model.replaySteps.some((s) => s.eventAt?.startsWith("2099"))).toBe(false);
  });

  it("uses stored timeline when present without fabricating prices", () => {
    const model = buildHistoricalEpisodeExplorerModel({
      episode: baseEpisode({
        observedIntradayReconstruction: intradayEvidence({
          timeline: [
            {
              episodeEventId: "t1",
              eventType: "VOLUME_ACCELERATION",
              eventAt: "2026-08-15T14:05:00.000Z",
              price: 10.5,
              volume: 50_000,
            },
            {
              episodeEventId: "t2",
              eventType: "HOD",
              eventAt: "2026-08-15T15:00:00.000Z",
              price: 11.2,
              volume: null,
            },
          ],
        }),
      }),
      symbol: "MOVE",
      nowMs: NOW,
    });
    expect(model.replayMode).toBe("stored_timeline");
    expect(model.replaySteps.filter((s) => s.price != null)).toHaveLength(2);
  });

  it("keeps next-session outcomes out of known-at-event match rationale", () => {
    const rationale = buildEpisodeMatchRationale(baseEpisode());
    expect(rationale.knownAtEventLines.some((l) => /next session/i.test(l))).toBe(false);
    expect(rationale.observedAfterwardLines.some((l) => /next session/i.test(l))).toBe(true);
  });

  it("surfaces forward outcome windows only when stored", () => {
    const model = buildHistoricalEpisodeExplorerModel({
      episode: baseEpisode({
        observedIntradayReconstruction: intradayEvidence({
          postMomentumForwardOutcomes: {
            15: {
              horizon: 15,
              availabilityState: "AVAILABLE",
              referenceTimestamp: "2026-08-15T15:00:00.000Z",
              windowEndTimestamp: "2026-08-15T15:15:00.000Z",
              maxFavorablePct: 2,
              maxAdversePct: 0.5,
              endReturnPct: 1.2,
              exceededReferenceHigh: false,
              continuation: true,
            },
          },
        }),
      }),
      symbol: "MOVE",
      nowMs: NOW,
    });
    const fwd = model.replaySteps.filter((s) => s.phase === "observed_afterward" && s.label.includes("+15"));
    expect(fwd.length).toBeGreaterThan(0);
    expect(model.postMomentumOutcomes?.[15]?.endReturnPct).toBe(1.2);
  });
});
