import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RadarGrid } from "../RadarGrid";
import { RadarMobileCard } from "../RadarMobileCard";
import { RADAR_GRID_COLUMN_COUNT, defaultRadarColumns } from "../radar-grid-columns";
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

function ranked(overrides: Partial<RadarRankedRow> = {}): RadarRankedRow {
  return {
    tab_id: "day_trade_radar",
    symbol: "AAA",
    company_name: "Alpha",
    price: 10,
    change_percent: 12,
    volume: 2_500_000,
    avg_volume: null,
    rvol: null,
    avg_volume_20d: null,
    rvol_20d: 5,
    float_shares: null,
    gap_percent: null,
    high_52w: null,
    low_52w: null,
    range_event: null,
    market_cap: null,
    prior_session_volume: 100_000,
    volume_ratio_prior_session: 10,
    day_high: 10.5,
    day_low: 9,
    provider_as_of: "2026-09-21T19:30:00.000Z",
    sync_run_id: "11111111-1111-4111-8111-111111111111",
    updated_at: "2026-09-21T19:31:00.000Z",
    rank: 1,
    signal: "TOP LEADER",
    hod_distance_percent: 0.9,
    radar_trading_date: "2026-09-21",
    promoted_at: "2026-09-21T13:42:00.000Z",
    ...overrides,
  };
}

describe("Radar Continuation presentation", () => {
  it("15. keeps primary columns and shows unavailable continuation on desktop", () => {
    expect(RADAR_GRID_COLUMN_COUNT).toBe(19);
    render(
      <MemoryRouter>
        <RadarGrid
          rows={[ranked(), ranked({ symbol: "BBB", rank: 2, volume: 9_000_000 })]}
          selectedSymbol="AAA"
          isPro
          freeRowLimit={3}
          onSelect={() => {}}
          visibleColumns={defaultRadarColumns()}
        />
      </MemoryRouter>,
    );
    const table = screen.getByTestId("radar-scanner-table");
    const bodyRows = table.querySelectorAll("tbody tr");
    expect(bodyRows[0]).toHaveTextContent("AAA");
    expect(bodyRows[1]).toHaveTextContent("BBB");
    expect(screen.queryByRole("columnheader", { name: /Continuation/ })).not.toBeInTheDocument();
    expect(screen.getAllByTitle("Continuation unavailable")[0]).toHaveTextContent("—");
    expect(screen.getAllByText("09:42:00").length).toBeGreaterThan(0);
  });

  it("16. shows unavailable continuation on the mobile card", () => {
    render(
      <MemoryRouter>
        <RadarMobileCard row={ranked()} selected={false} isPro freeRowLimit={3} onSelect={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByTitle("Continuation unavailable")).toHaveTextContent("—");
    expect(screen.getByText("09:42:00")).toBeInTheDocument();
  });
});
