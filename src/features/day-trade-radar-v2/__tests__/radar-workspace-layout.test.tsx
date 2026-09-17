import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ScreenerResultRow } from "@/lib/screeners/contract";
import { DayTradeRadarV2 } from "../DayTradeRadarV2";
import { RadarLeaderStrip } from "../RadarLeaderStrip";
import type { RadarRankedRow } from "../types";

vi.mock("@/hooks/useAddToWatchlist", () => ({
  useAddToWatchlist: () => ({
    add: vi.fn(),
    isAdded: () => false,
    pendingSymbol: null,
  }),
}));

vi.mock("@/hooks/useCatalystEnrichmentForSymbols", () => ({
  useCatalystEnrichmentForSymbols: () => ({
    data: undefined,
    isPending: false,
    isFetching: false,
    isError: false,
  }),
}));

vi.mock("@/hooks/useRadarV22Board", () => ({
  useRadarV22Board: () => ({
    valid: false,
    status: "unavailable",
    sessionDate: null,
    generationId: null,
    rows: [],
    syncedAt: null,
    providerAsOfMax: null,
  }),
}));

vi.mock("../useRadarChartData", () => ({
  useRadarChartData: () => ({
    status: "idle",
    bars: [],
    latestBarIso: null,
    errorMessage: null,
    interval: null,
  }),
}));

vi.mock("@/hooks/useRadarFloatForSymbols", () => ({
  useRadarFloatForSymbols: () => ({
    bySymbol: new Map(),
    isPending: false,
    getFloat: () => null,
  }),
}));

vi.mock("@/hooks/useRecentProviderNewsForSymbols", () => ({
  useRecentProviderNewsForSymbols: () => ({
    bySymbol: new Map(),
    isPending: false,
    getHeadline: () => undefined,
    getStatus: () => "empty",
  }),
}));

const isMobileState = { value: false };
vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => isMobileState.value,
}));

function row(
  overrides: Partial<ScreenerResultRow> & Pick<ScreenerResultRow, "symbol" | "volume">,
): ScreenerResultRow {
  return {
    tab_id: "day_trade_radar",
    company_name: overrides.company_name ?? `${overrides.symbol} Corp`,
    price: overrides.price ?? 10,
    change_percent: overrides.change_percent ?? null,
    volume: overrides.volume,
    avg_volume: null,
    rvol: null,
    float_shares: null,
    gap_percent: null,
    high_52w: null,
    low_52w: null,
    range_event: null,
    market_cap: null,
    prior_session_volume: 200_000,
    volume_ratio_prior_session: 10,
    day_high: overrides.day_high ?? 11,
    day_low: overrides.day_low ?? 9,
    provider_as_of: "2026-09-16T15:00:00.000Z",
    sync_run_id: "11111111-1111-4111-8111-111111111111",
    updated_at: "2026-09-16T15:05:00.000Z",
    ...overrides,
  };
}

const BOARD = [
  row({ symbol: "PENNY", volume: 9_000_000, price: 0.8, day_low: 0.5, day_high: 1.2 }),
  row({ symbol: "AEHL", volume: 5_000_000, price: 8.84, day_low: 5, day_high: 10, change_percent: 71.3 }),
  row({ symbol: "HIGH", volume: 1_000_000, price: 15.2, day_low: 14, day_high: 16 }),
];

function renderRadar() {
  return render(
    <MemoryRouter>
      <DayTradeRadarV2
        rows={BOARD}
        status="available"
        isPro
        syncedAt="2026-09-16T15:12:00.000Z"
        providerAsOfMax="2026-09-16T15:00:00.000Z"
        freeRowLimit={20}
        source="radar-v2"
        session="market"
      />
    </MemoryRouter>,
  );
}

describe("Radar workspace layout", () => {
  it("defaults to Core Momentum, keeps feed-wide timestamps, and shows lens-eligible Top Leader", () => {
    renderRadar();
    const preset = screen.getByLabelText("Trader Lens preset") as HTMLSelectElement;
    expect(preset.value).toBe("momentum_2_20");

    const feed = screen.getByTestId("radar-feed-line").textContent ?? "";
    expect(feed).toMatch(/15-minute delayed/);
    expect(feed).toMatch(/Data as of/);
    expect(screen.getByText("3 Radar candidates")).toBeInTheDocument();

    const strip = screen.getByTestId("radar-leader-strip");
    expect(within(strip).getByText("#2")).toBeInTheDocument();
    expect(within(strip).getByText("AEHL")).toBeInTheDocument();
    expect(within(strip).queryByText("PENNY")).not.toBeInTheDocument();
    expect(within(strip).getByText("VOLUME LEADER")).toBeInTheDocument();
    expect(within(strip).getByRole("button", { name: /Follow #1/ })).toBeInTheDocument();

    const table = screen.getByTestId("radar-scanner-table");
    expect(within(table).queryByText("PENNY")).not.toBeInTheDocument();
    expect(within(table).getByRole("link", { name: "AEHL" })).toBeInTheDocument();
    expect(within(table).getByText("#2")).toBeInTheDocument();

    fireEvent.change(preset, { target: { value: "all_movers" } });
    expect(within(screen.getByTestId("radar-scanner-table")).getByText("PENNY")).toBeInTheDocument();
    expect(within(screen.getByTestId("radar-leader-strip")).getByText("PENNY")).toBeInTheDocument();
    expect(within(screen.getByTestId("radar-leader-strip")).getByText("#1")).toBeInTheDocument();
    expect(screen.getByTestId("radar-feed-line").textContent).toBe(feed);
    expect(screen.queryByText("Trigger Time")).not.toBeInTheDocument();
  });

  it("opens the detail drawer from a row click without changing ranks, then restores the full scanner", () => {
    renderRadar();
    fireEvent.click(within(screen.getByTestId("radar-scanner-table")).getByText("#2"));
    const drawer = screen.getByTestId("radar-detail-drawer");
    expect(within(drawer).getByText("AEHL")).toBeInTheDocument();
    expect(within(drawer).getByText("Action Center")).toBeInTheDocument();
    expect(within(screen.getByTestId("radar-leader-strip")).getByText("AEHL")).toBeInTheDocument();
    expect(within(screen.getByTestId("radar-scanner-table")).getByText("#2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByTestId("radar-detail-drawer")).not.toBeInTheDocument();
    expect(screen.getByTestId("radar-scanner-table")).toBeInTheDocument();
  });

  it("keeps Follow #1 on the leader strip and opens details from Details", () => {
    renderRadar();
    const strip = screen.getByTestId("radar-leader-strip");
    expect(within(strip).getByRole("button", { name: /Follow #1/ }).textContent).toMatch(/✓/);
    fireEvent.click(within(screen.getByTestId("radar-scanner-table")).getByText("#2"));
    expect(screen.getByTestId("radar-detail-drawer")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(within(screen.getByTestId("radar-leader-strip")).getByRole("button", { name: "Follow #1" }).textContent).not.toMatch(/✓/);
    fireEvent.click(within(screen.getByTestId("radar-leader-strip")).getByRole("button", { name: "Follow #1" }));
    expect(within(screen.getByTestId("radar-leader-strip")).getByRole("button", { name: /Follow #1/ }).textContent).toMatch(/✓/);
    fireEvent.click(within(screen.getByTestId("radar-leader-strip")).getByRole("button", { name: "Details" }));
    expect(within(screen.getByTestId("radar-detail-drawer")).getByText("AEHL")).toBeInTheDocument();
  });

  it("uses compact mobile cards and a bottom-sheet detail instead of a permanent side panel", () => {
    isMobileState.value = true;
    try {
      renderRadar();
      expect(screen.getByTestId("radar-mobile-board")).toBeInTheDocument();
      fireEvent.click(within(screen.getByTestId("radar-mobile-board")).getByText("#2"));
      expect(screen.queryByTestId("radar-detail-drawer")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
      expect(screen.getAllByTestId("adaptive-day-range").length).toBeGreaterThan(0);
    } finally {
      isMobileState.value = false;
    }
  });
});

describe("RadarLeaderStrip", () => {
  it("displays the current #1 with truthful available fields", () => {
    const leader: RadarRankedRow = {
      ...BOARD[1],
      rank: 1,
      signal: "TOP LEADER",
      hod_distance_percent: 18.8,
      volume_ratio_prior_session: 17.2,
      change_percent: 71.3,
    } as RadarRankedRow;
    const onFollow = vi.fn();
    const onDetails = vi.fn();
    render(
      <RadarLeaderStrip
        row={leader}
        followingLeader
        showReturnToLeader={false}
        isPro
        freeRowLimit={20}
        onFollowLeader={onFollow}
        onReturnToLeader={() => {}}
        onOpenDetails={onDetails}
      />,
    );
    const strip = screen.getByTestId("radar-leader-strip");
    expect(strip).toHaveClass("h-[64px]");
    expect(within(strip).getByText("AEHL")).toBeInTheDocument();
    expect(within(strip).getByText("TOP LEADER")).toBeInTheDocument();
    expect(within(strip).getByText("$8.84")).toBeInTheDocument();
    expect(within(strip).getByText("+71.3%")).toBeInTheDocument();
    expect(within(strip).getByText("17.2× Prior")).toBeInTheDocument();
    expect(within(strip).getByText("18.8% from HOD")).toBeInTheDocument();
    expect(within(strip).getByText("No Catalyst")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Follow #1/ }));
    expect(onFollow).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(onDetails).toHaveBeenCalledTimes(1);
  });
});
