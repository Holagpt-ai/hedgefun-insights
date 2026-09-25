import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { ScreenerResultRow } from "@/lib/screeners/contract";
import type { RadarRepeatMoversView } from "@/lib/radar/radar-repeat-movers-types";
import { historyContextLabel } from "../HistoricalBehavior";
import { DayTradeRadarV2 } from "../DayTradeRadarV2";
import { RadarRepeatMoversSection } from "../RadarRepeatMoversSection";

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

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
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
    avg_volume_20d: null,
    rvol_20d: null,
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
  row({ symbol: "AEHL", volume: 5_000_000, price: 8.84, change_percent: 71.3 }),
  row({ symbol: "HIGH", volume: 1_000_000, price: 15.2 }),
];

const emptyRepeatMoversView: RadarRepeatMoversView = {
  version: "v2",
  generatedAt: "2026-09-22T16:00:00.000Z",
  filtersAvailable: ["all"],
  presentationSortKeysAvailable: ["discovery_rank"],
  summary: {
    totalRadarRows: 2,
    repeatMoverCount: 0,
    unavailableHistoryCount: 2,
    limitedHistoryCount: 0,
    freshProfileCount: 0,
    staleProfileCount: 0,
  },
  repeatMovers: [],
  candidates: [],
};

describe("Repeat Movers failure isolation", () => {
  it("A/B: malformed historical context does not throw in History labels", () => {
    const malformed = {
      securityId: "x",
      profile: { profileAvailable: true, episodeCount: 2 },
    } as Parameters<typeof historyContextLabel>[0];
    expect(() => historyContextLabel(malformed)).not.toThrow();
    expect(historyContextLabel(malformed)).toBe("2 prior runs");
  });

  it("A: HTTP 500 maps to Repeat Movers unavailable + Retry", () => {
    render(
      <RadarRepeatMoversSection
        loadState={{ status: "unavailable", reason: "service_http_error" }}
        onRetry={vi.fn()}
        onOpenDetails={vi.fn()}
      />,
    );
    expect(screen.getByTestId("repeat-movers-unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry repeat movers/i })).toBeInTheDocument();
  });

  it("A: Repeat Movers enrichment failure shows unavailable panel only", () => {
    render(
      <RadarRepeatMoversSection
        loadState={{ status: "unavailable", reason: "enrichment_failed" }}
        onRetry={vi.fn()}
        onOpenDetails={vi.fn()}
      />,
    );
    expect(screen.getByTestId("repeat-movers-unavailable")).toBeInTheDocument();
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument();
  });

  it("C: empty Repeat Movers result renders ready section without fabricated rows", () => {
    render(
      <RadarRepeatMoversSection
        loadState={{ status: "ready", view: emptyRepeatMoversView }}
        onOpenDetails={vi.fn()}
      />,
    );
    expect(screen.getByTestId("repeat-movers-section")).toBeInTheDocument();
    expect(screen.queryByTestId("repeat-movers-unavailable")).not.toBeInTheDocument();
  });

  it("D/E: Discovery workspace and Active Symbol survive Repeat Movers failure", () => {
    render(
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
          repeatMoversLoadState={{ status: "unavailable", reason: "service_http_error" }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("multi-radar-workspace")).toBeInTheDocument();
    expect(screen.getByTestId("radar-panel-day_trade")).toBeInTheDocument();
    expect(screen.getByTestId("repeat-movers-unavailable")).toBeInTheDocument();

    const dayTrade = screen.getByTestId("radar-panel-day_trade");
    fireEvent.click(within(dayTrade).getAllByRole("row").find((r) => r.textContent?.includes("AEHL"))!);
    expect(within(screen.getByTestId("active-symbol-rail")).getByText("AEHL")).toBeInTheDocument();
  });

  it("F: retry invokes reload callback", () => {
    const onRetry = vi.fn();
    render(
      <RadarRepeatMoversSection
        loadState={{ status: "unavailable", reason: "enrichment_failed" }}
        onRetry={onRetry}
        onOpenDetails={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /retry repeat movers/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
