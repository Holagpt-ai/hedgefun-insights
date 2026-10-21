import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { RepeatMoverContext } from "@/types/repeat-mover";
import { HistoricalEpisodeExplorer } from "../HistoricalEpisodeExplorer";

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
    sampleSizeQuality: "LIMITED",
    sessionsObserved: 48,
    episodeCount: 7,
    notableCount: 5,
    significantCount: 2,
    extremeCount: 0,
    positiveEpisodeCount: 7,
    negativeEpisodeCount: 0,
    mixedEpisodeCount: 0,
    positiveEpisodePct: 100,
    negativeEpisodePct: 0,
    episodesPer30Sessions: 4,
    episodesPer90Sessions: 7,
    medianDaysBetweenEpisodes: 6,
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
    sourceDailyRowCount: 48,
    sourceEpisodeCount: 7,
  },
  comparableHistory: {
    comparableEpisodeCount: 1,
    closestComparableEpisodes: [
      {
        episodeId: "episode-1",
        sessionDate: "2026-08-15",
        tier: "SIGNIFICANT",
        direction: "POSITIVE",
        movePct: 12.5,
        volume: 900_000,
        rvol: 2.4,
        dollarVolume: null,
        closePosition: null,
        nextSessionMovePct: null,
        nextSessionContinuation: null,
        similarity: { sameDirection: true, sameTier: true, movePctDelta: 2.5 },
        observedIntradayReconstruction: {
          largestVolumeBurstAt: "2026-08-15T14:30:00.000Z",
          hodAt: "2026-08-15T15:00:00.000Z",
          closeVsHodPct: null,
          largestPullbackPct: null,
          recoveredFromPullback: null,
          haltCount: null,
          vwapReclaimCount: null,
          completenessState: "COMPLETE",
        },
      },
    ],
    mostRecentComparableEpisode: null,
  },
  evidenceLabels: [],
  assembledAt: "2026-09-22T15:00:00.000Z",
};

describe("HistoricalEpisodeExplorer UI", () => {
  it("renders episode picker and limitation copy", () => {
    render(
      <MemoryRouter>
        <HistoricalEpisodeExplorer symbol="MOVE" context={context} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("historical-episode-explorer")).toBeInTheDocument();
    expect(screen.getByText(/Historical Episode Explorer/i)).toBeInTheDocument();
    expect(screen.getByText(/stored observations only/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Replay step scrubber")).toBeInTheDocument();
  });
});
