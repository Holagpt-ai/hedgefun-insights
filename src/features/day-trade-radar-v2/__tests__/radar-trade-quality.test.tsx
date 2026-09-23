import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RadarGrid } from "../RadarGrid";
import { RadarMobileCard } from "../RadarMobileCard";
import { defaultRadarColumns } from "../radar-grid-columns";
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

function ranked(symbol = "AAA"): RadarRankedRow {
  return {
    tab_id: "day_trade_radar",
    symbol,
    company_name: "Alpha",
    price: 10,
    change_percent: 12,
    volume: 1_000_000,
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
    day_high: 11,
    day_low: 9,
    provider_as_of: "2026-09-21T14:00:00.000Z",
    sync_run_id: "11111111-1111-4111-8111-111111111111",
    updated_at: "2026-09-21T14:05:00.000Z",
    rank: 1,
    signal: "TOP LEADER",
    hod_distance_percent: 2,
  };
}

describe("Radar Trade Quality presentation", () => {
  it("does not show Trade Quality in the default scanner grid", () => {
    render(
      <MemoryRouter>
        <RadarGrid
          rows={[ranked()]}
          selectedSymbol="AAA"
          isPro
          freeRowLimit={3}
          onSelect={() => {}}
          visibleColumns={defaultRadarColumns()}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("columnheader", { name: /Trade Quality/ })).not.toBeInTheDocument();
  });

  it("14. mobile card does not surface Trade Quality in the default layout", () => {
    render(
      <MemoryRouter>
        <RadarMobileCard
          row={ranked()}
          selected={false}
          isPro
          freeRowLimit={3}
          onSelect={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("button", { name: "Trade Quality info" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dollar Volume info" })).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("AAA")).toBeInTheDocument();
  });
});
