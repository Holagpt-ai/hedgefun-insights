import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { RadarRepeatMoverCandidate, RadarRepeatMoversView } from "@/lib/radar/radar-repeat-movers-types";
import { RepeatMoversView } from "../RepeatMoversView";

function candidate(symbol: string, rank: number, overrides: Partial<RadarRepeatMoverCandidate> = {}): RadarRepeatMoverCandidate {
  return {
    discoveryRank: rank,
    symbol,
    securityId: null,
    currentMovePct: 12.4,
    volume: 1_250_000,
    rvol: 3.2,
    dollarVolume: null,
    lifecycle: "ACTIVE",
    signalStatus: "EXPLOSIVE",
    historicalContext: null,
    evidenceLabels: ["RECURRING_MOVER", "SIMILAR_PRIOR_EPISODES_FOUND"],
    sampleSizeQuality: "ROBUST",
    comparableEpisodeCount: 4,
    mostRecentComparableDate: "2026-09-10",
    profileFreshness: "FRESH",
    profileCoverage: {
      historyStartDate: "2024-01-02",
      historyEndDate: "2026-09-20",
      sessionsObserved: 600,
      sourceDailyRowCount: 600,
      sourceEpisodeCount: 8,
    },
    historicalAvailability: "AVAILABLE",
    qualification: { qualifies: true, reasons: [], evidenceStrength: "STRONG" },
    displayFacts: {
      similarPriorMovesLabel: "4 Similar Prior Moves",
      historicalEpisodesLabel: "8 Historical Episodes",
      sampleQualityLabel: "Robust History",
      mostRecentComparableLabel: "Most Recent: 2026-09-10",
      sessionsObservedLabel: "600 Sessions Observed",
      lines: ["4 Similar Prior Moves", "8 Historical Episodes", "Robust History"],
    },
    workflowHandoffs: {
      aiAnalyst: `/dashboard/ai?symbol=${symbol}`,
      catalyst: `/dashboard/catalyst?symbol=${symbol}`,
      watchlist: `/dashboard/watchlist?symbol=${symbol}`,
      journal: `/dashboard/journal?symbol=${symbol}`,
      actionCenter: "/dashboard/action-center",
    },
    profileComputedAt: "2026-09-22T12:00:00.000Z",
    latestSourceHistoryDate: "2026-09-20",
    ...overrides,
  };
}

const rows = [
  candidate("FIRST", 2),
  candidate("SECOND", 7, {
    evidenceLabels: ["LIMITED_HISTORY"],
    sampleSizeQuality: "LIMITED",
    historicalAvailability: "LIMITED",
    profileFreshness: "STALE",
  }),
];

const view: RadarRepeatMoversView = {
  version: "v2",
  generatedAt: "2026-09-22T16:00:00.000Z",
  filtersAvailable: ["all", "recurring_movers", "similar_prior_episodes", "adequate_or_robust_history", "limited_history"],
  presentationSortKeysAvailable: ["discovery_rank"],
  summary: {
    totalRadarRows: 3,
    repeatMoverCount: 2,
    unavailableHistoryCount: 1,
    limitedHistoryCount: 1,
    freshProfileCount: 1,
    staleProfileCount: 1,
  },
  repeatMovers: rows,
  candidates: rows,
};

describe("RepeatMoversView", () => {
  it("preserves canonical Discovery order and limits display facts", () => {
    render(
      <MemoryRouter>
        <RepeatMoversView view={view} activeFilter="all" onFilterChange={vi.fn()} onOpenDetails={vi.fn()} />
      </MemoryRouter>,
    );
    const desktop = screen.getByTestId("repeat-movers-view").querySelector(".md\\:block");
    expect(desktop).not.toBeNull();
    const text = desktop?.textContent ?? "";
    expect(text.indexOf("FIRST")).toBeLessThan(text.indexOf("SECOND"));
    expect(within(desktop as HTMLElement).getByText("#2")).toBeInTheDocument();
    expect(within(desktop as HTMLElement).getByText("#7")).toBeInTheDocument();
    expect(within(desktop as HTMLElement).queryByText("Robust History")).not.toBeInTheDocument();
    expect(within(desktop as HTMLElement).getAllByText("Repeat Mover")).toHaveLength(2);
    expect(within(desktop as HTMLElement).getByText("Stale profile")).toBeInTheDocument();
    expect(within(desktop as HTMLElement).getByRole("link", { name: "AI Analyst for FIRST" })).toHaveAttribute("href", "/dashboard/ai?symbol=FIRST");
  });

  it("exposes only the five compact filters and delegates selection", () => {
    const onFilterChange = vi.fn();
    render(
      <MemoryRouter>
        <RepeatMoversView view={view} activeFilter="all" onFilterChange={onFilterChange} onOpenDetails={vi.fn()} />
      </MemoryRouter>,
    );
    const filters = screen.getByLabelText("Repeat Movers filters");
    expect(within(filters).getAllByRole("button")).toHaveLength(5);
    expect(within(filters).queryByText(/Fresh Profile/i)).not.toBeInTheDocument();
    expect(within(filters).queryByText(/Stale Profile/i)).not.toBeInTheDocument();
    fireEvent.click(within(filters).getByRole("button", { name: "Limited History" }));
    expect(onFilterChange).toHaveBeenCalledWith("limited_history");
  });

  it("filters qualified rows without re-sorting", () => {
    render(
      <MemoryRouter>
        <RepeatMoversView view={view} activeFilter="limited_history" onFilterChange={vi.fn()} onOpenDetails={vi.fn()} />
      </MemoryRouter>,
    );
    const section = screen.getByTestId("repeat-movers-view");
    expect(within(section).queryByText("FIRST")).not.toBeInTheDocument();
    expect(within(section).getAllByText("SECOND")).toHaveLength(2);
  });
});