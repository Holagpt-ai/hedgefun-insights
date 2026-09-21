import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
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

function ranked(overrides: Partial<RadarRankedRow> = {}): RadarRankedRow {
  return {
    tab_id: "day_trade_radar",
    symbol: "AAA",
    company_name: "Alpha",
    price: 12,
    change_percent: null,
    volume: 10_000_000,
    avg_volume: null,
    rvol: null,
    avg_volume_20d: 2_000_000,
    rvol_20d: 3.8,
    float_shares: null,
    gap_percent: null,
    high_52w: null,
    low_52w: null,
    range_event: null,
    market_cap: null,
    prior_session_volume: null,
    volume_ratio_prior_session: null,
    day_high: 11,
    day_low: 9,
    provider_as_of: "2026-09-18T15:00:00.000Z",
    sync_run_id: "11111111-1111-4111-8111-111111111111",
    updated_at: "2026-09-18T15:05:00.000Z",
    rank: 1,
    signal: "TOP LEADER",
    hod_distance_percent: 2,
    ...overrides,
  };
}

describe("Day Trade Radar RVOL 20D and Dollar Volume presentation", () => {
  it("shows $ Volume and RVOL 20D in the default desktop columns", () => {
    expect(defaultRadarColumns()).toContain("dollar_volume");
    expect(defaultRadarColumns()).toContain("daily_rvol");
    render(
      <MemoryRouter>
        <RadarGrid
          rows={[ranked()]}
          selectedSymbol="AAA"
          isPro
          freeRowLimit={3}
          onSelect={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("columnheader", { name: /\$ Volume/ })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /RVOL 20D/ })).toBeInTheDocument();
    expect(screen.getByText("$120.0M")).toBeInTheDocument();
    expect(screen.getByText("3.8×")).toBeInTheDocument();
  });

  it("renders missing RVOL as — and does not use Vol/Prior", () => {
    render(
      <MemoryRouter>
        <RadarGrid
          rows={[ranked({ rvol_20d: null, volume_ratio_prior_session: 9.9 })]}
          selectedSymbol="AAA"
          isPro
          freeRowLimit={3}
          onSelect={() => {}}
        />
      </MemoryRouter>,
    );
    const rvolHeader = screen.getByRole("columnheader", { name: /RVOL 20D/ });
    const rvolIndex = [...rvolHeader.closest("tr")!.children].indexOf(rvolHeader);
    const rvolCell = screen.getAllByRole("row")[1].children[rvolIndex];
    expect(rvolCell).toHaveTextContent("—");
    expect(rvolCell).not.toHaveTextContent("9.9×");
  });

  it("shows both metrics on the compact mobile card", () => {
    render(
      <MemoryRouter>
        <RadarMobileCard
          row={ranked({ rvol_20d: null })}
          selected={false}
          isPro
          freeRowLimit={3}
          onSelect={() => {}}
        />
      </MemoryRouter>,
    );
    const row = screen.getByTestId("radar-mobile-liquidity");
    expect(row).toHaveTextContent("$ Vol");
    expect(row).toHaveTextContent("RVOL 20D");
    expect(within(row).getByText("—")).toBeInTheDocument();
    expect(within(row).getByText("$120.0M")).toBeInTheDocument();
  });
});
