import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RepeatMoverComparableEpisode, RepeatMoverContext } from "@/types/repeat-mover";
import { HistoryCell, HistoricalBehaviorSection, RepeatMoverBadge } from "../HistoricalBehavior";
import { HISTORY_BLANK } from "../scanner-metric-copy";

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
    expect(screen.getByText("7 prior runs")).toBeInTheDocument();

    rerender(<RepeatMoverBadge context={{ ...context, profile: { ...context.profile, profileAvailable: false } }} />);
    expect(screen.queryByText(/prior run/)).not.toBeInTheDocument();
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

  it("does not invent a count from similar episodes when episode count is missing", () => {
    render(
      <RepeatMoverBadge
        context={{
          ...context,
          profile: { ...context.profile, episodeCount: null },
        }}
      />,
    );
    expect(screen.queryByText(/prior run/)).not.toBeInTheDocument();
    expect(screen.queryByText("5")).not.toBeInTheDocument();
  });

  it("uses the requested no-history state without unavailable zero values", () => {
    render(<HistoricalBehaviorSection context={null} />);
    const section = screen.getByTestId("historical-behavior");
    expect(within(section).getByText("Historical behavior not available yet.")).toBeInTheDocument();
    expect(within(section).queryByText("0")).not.toBeInTheDocument();
  });
});

function withHistory(
  episodeCount: number,
  episodes: RepeatMoverComparableEpisode[],
  profileAvailable = true,
): RepeatMoverContext {
  return {
    ...context,
    profile: { ...context.profile, profileAvailable, episodeCount },
    comparableHistory: {
      comparableEpisodeCount: episodes.length,
      closestComparableEpisodes: episodes,
      mostRecentComparableEpisode: episodes[0] ?? null,
    },
  };
}

const richEpisode = context.comparableHistory.closestComparableEpisodes[0];
const bareEpisode: RepeatMoverComparableEpisode = {
  episodeId: "bare",
  sessionDate: "2024-06-18",
  tier: "NOTABLE",
  direction: "POSITIVE",
  movePct: null,
  volume: null,
  rvol: null,
  dollarVolume: null,
  closePosition: null,
  nextSessionMovePct: null,
  nextSessionContinuation: null,
  similarity: { sameDirection: true, sameTier: false, movePctDelta: null },
};

describe("HISTORY detail", () => {
  it("shows an em dash when there is no verified history", () => {
    const { rerender } = render(<HistoryCell context={null} />);
    expect(screen.getByRole("button", { name: new RegExp(HISTORY_BLANK) })).toHaveTextContent("—");
    expect(screen.queryByText(/prior run/)).not.toBeInTheDocument();

    rerender(<HistoryCell context={withHistory(0, [])} />);
    expect(screen.getByRole("button", { name: new RegExp(HISTORY_BLANK) })).toHaveTextContent("—");
    expect(screen.queryByText(/prior run/)).not.toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("labels one verified episode as 1 prior run", () => {
    render(<HistoryCell context={withHistory(1, [richEpisode])} />);
    expect(screen.getByRole("button", { name: /1 prior run/ })).toBeInTheDocument();
  });

  it("labels three verified episodes as 3 prior runs", () => {
    render(<HistoryCell context={withHistory(3, [richEpisode, bareEpisode, { ...bareEpisode, episodeId: "bare-2", sessionDate: "2024-05-02" }])} />);
    expect(screen.getByRole("button", { name: /3 prior runs/ })).toBeInTheDocument();
  });

  it("opens loaded episodes and says when the total count is larger", () => {
    const onSelect = vi.fn();
    render(
      <div onClick={onSelect}>
        <HistoryCell context={withHistory(7, [richEpisode, bareEpisode, { ...bareEpisode, episodeId: "bare-2", sessionDate: "2024-05-02" }])} />
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: /7 prior runs/ }));
    const detail = screen.getByTestId("history-detail");
    expect(within(detail).getByText("7 verified prior runs")).toBeInTheDocument();
    expect(within(detail).getByText("Showing 3 closest comparable episodes")).toBeInTheDocument();
    expect(within(detail).queryByText(/7 closest/)).not.toBeInTheDocument();
    expect(within(detail).getByText("Aug 15, 2026")).toBeInTheDocument();
    expect(within(detail).getByText("+12.5%")).toBeInTheDocument();
    expect(within(detail).getByText("900K")).toBeInTheDocument();
    expect(within(detail).getByText("2.4×")).toBeInTheDocument();
    expect(within(detail).getByText("+3.2%")).toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("omits missing episode fields instead of showing zeros", () => {
    render(<HistoryCell context={withHistory(1, [bareEpisode])} />);
    fireEvent.click(screen.getByRole("button", { name: /1 prior run/ }));
    const detail = screen.getByTestId("history-detail");
    expect(within(detail).getByText("Jun 18, 2024")).toBeInTheDocument();
    expect(within(detail).getByText("Notable")).toBeInTheDocument();
    expect(within(detail).queryByText("Volume")).not.toBeInTheDocument();
    expect(within(detail).queryByText("Move")).not.toBeInTheDocument();
    expect(within(detail).queryByText(/^Start:/)).not.toBeInTheDocument();
    expect(within(detail).queryByText("0")).not.toBeInTheDocument();
    expect(within(detail).queryByText(/retraced/i)).not.toBeInTheDocument();
  });

  it("shows optional verified episode fields when the episode object includes them", () => {
    render(
      <HistoryCell
        context={withHistory(1, [{
          ...richEpisode,
          observedIntradayReconstruction: {
            hodAt: "2026-08-15T13:42:00.000Z",
            closeVsHodPct: -8,
            largestPullbackPct: -72,
            recoveredFromPullback: true,
            haltCount: null,
            vwapReclaimCount: null,
            largestVolumeBurstAt: null,
            completenessState: "COMPLETE",
          },
          historicalEvents: [{
            eventType: "FDA_EVENT",
            title: "FDA approval",
            publishedAt: null,
            temporalRelationship: "EVENT_SAME_SESSION",
            source: null,
          }],
        }])}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /1 prior run/ }));
    const detail = screen.getByTestId("history-detail");
    expect(within(detail).getByText("9:42 AM")).toBeInTheDocument();
    expect(within(detail).getByText("-72.0%")).toBeInTheDocument();
    expect(within(detail).getByText("FDA approval")).toBeInTheDocument();
  });

  it("keeps the count when comparable episode details are empty", () => {
    render(<HistoryCell context={withHistory(4, [])} />);
    fireEvent.click(screen.getByRole("button", { name: /4 prior runs/ }));
    const detail = screen.getByTestId("history-detail");
    expect(within(detail).getByText("4 verified prior runs")).toBeInTheDocument();
    expect(within(detail).getByText("Comparable episode details are not available yet.")).toBeInTheDocument();
    expect(within(detail).queryByText("Aug 15, 2026")).not.toBeInTheDocument();
  });

  it("shows historical profile unavailable when the profile is unavailable", () => {
    render(<HistoryCell context={withHistory(7, [richEpisode], false)} />);
    const trigger = screen.getByRole("button", { name: /—/ });
    expect(trigger).toHaveTextContent("—");
    expect(screen.queryByText(/prior run/)).not.toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.getByText("Historical profile unavailable")).toBeInTheDocument();
  });

  it("uses the same history button for click and tap", () => {
    render(<HistoryCell context={withHistory(1, [richEpisode])} />);
    const trigger = screen.getByRole("button", { name: /1 prior run/ });
    expect(trigger.tagName).toBe("BUTTON");
    fireEvent.click(trigger);
    expect(screen.getByTestId("history-detail")).toBeInTheDocument();
    expect(screen.getByText("1 verified prior run")).toBeInTheDocument();
    expect(screen.queryByText("Showing 1 closest comparable episode")).not.toBeInTheDocument();
  });
});