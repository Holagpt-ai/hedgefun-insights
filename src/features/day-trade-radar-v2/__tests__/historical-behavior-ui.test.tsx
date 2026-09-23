import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { RepeatMoverContext } from "@/types/repeat-mover";
import { HistoricalBehaviorSection, RepeatMoverBadge } from "../HistoricalBehavior";

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
    dollarVolume: 10_000_000,
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
    positiveCloseUpperQuartilePct: 60,
    positiveCloseNearHighPct: 40,
    negativeCloseNearLowPct: null,
    nextSessionPositiveContinuationRate: 50,
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
    comparableEpisodeCount: 5,
    closestComparableEpisodes: [
      {
        episodeId: "episode-1",
        sessionDate: "2026-08-15",
        tier: "SIGNIFICANT",
        direction: "POSITIVE",
        movePct: 12.5,
        volume: 900_000,
        rvol: 2.4,
        dollarVolume: 8_000_000,
        closePosition: 0.8,
        nextSessionMovePct: 3.2,
        nextSessionContinuation: true,
        similarity: { sameDirection: true, sameTier: true, movePctDelta: 2.5 },
      },
      ...[2, 3, 4].map((index) => ({
        episodeId: `episode-${index}`,
        sessionDate: `2026-07-0${index}`,
        tier: "NOTABLE" as const,
        direction: "POSITIVE" as const,
        movePct: null,
        volume: null,
        rvol: null,
        dollarVolume: null,
        closePosition: null,
        nextSessionMovePct: null,
        nextSessionContinuation: null,
        similarity: { sameDirection: true, sameTier: false, movePctDelta: null },
      })),
    ],
    mostRecentComparableEpisode: null,
  },
  evidenceLabels: [],
  assembledAt: "2026-09-22T15:00:00.000Z",
};

describe("Repeat Movers UI V1", () => {
  it("shows one compact count badge only for useful history", () => {
    const { rerender } = render(<RepeatMoverBadge context={context} />);
    expect(screen.getByText("5 Similar")).toBeInTheDocument();

    rerender(<RepeatMoverBadge context={{ ...context, profile: { ...context.profile, profileAvailable: false } }} />);
    expect(screen.queryByText(/Similar Moves|Repeat Mover/)).not.toBeInTheDocument();
  });

  it("shows truthful profile facts, partial copy, and only three vertical comparables", () => {
    render(<HistoricalBehaviorSection context={context} />);
    const section = screen.getByTestId("historical-behavior");
    expect(within(section).getByText("Historical Behavior")).toBeInTheDocument();
    expect(within(section).getByText("Limited")).toBeInTheDocument();
    expect(within(section).getByText("48")).toBeInTheDocument();
    expect(within(section).getByText("7")).toBeInTheDocument();
    expect(within(section).getByText("Historical profile still building")).toBeInTheDocument();
    expect(within(section).getByText("+12.5%")).toBeInTheDocument();
    expect(within(section).getByText("2.4× RVOL")).toBeInTheDocument();
    expect(within(section).getByText("+3.2% next session")).toBeInTheDocument();
    expect(within(section).queryByText("Jul 4, 2026")).not.toBeInTheDocument();
  });

  it("uses the requested no-history state without unavailable zero values", () => {
    render(<HistoricalBehaviorSection context={null} />);
    const section = screen.getByTestId("historical-behavior");
    expect(within(section).getByText("Historical behavior not available yet.")).toBeInTheDocument();
    expect(within(section).queryByText("0")).not.toBeInTheDocument();
  });
});