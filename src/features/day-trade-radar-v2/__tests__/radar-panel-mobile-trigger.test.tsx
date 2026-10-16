import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RadarPanelBoard } from "../RadarPanelBoard";
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

function panelRow(overrides: Partial<RadarRankedRow> = {}): RadarRankedRow {
  return {
    tab_id: "day_trade_radar",
    symbol: "MOB",
    company_name: "Mobile",
    price: 4.2,
    change_percent: 6,
    volume: 2_000_000,
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
    prior_session_volume: 100_000,
    volume_ratio_prior_session: 10,
    day_high: 4.5,
    day_low: 3.9,
    provider_as_of: "2026-09-21T19:30:00.000Z",
    sync_run_id: "11111111-1111-4111-8111-111111111111",
    updated_at: "2026-09-21T19:31:00.000Z",
    rank: 1,
    signal: "TOP LEADER",
    hod_distance_percent: 1,
    radar_trading_date: "2026-09-21",
    promoted_at: "2026-09-21T13:42:00.000Z",
    primary_scanner_event: "VOLUME_EXPLOSION",
    primary_scanner_event_at: "2026-09-21T08:00:00.000Z",
    participation_state: "COOLING",
    promotion_reason: {
      version: "v1",
      primaryEvent: { type: "VOLUME_EXPLOSION", eventAt: "2026-09-21T08:00:00.000Z" },
      supportingEvents: [],
      triggerTimestamp: null,
    },
    ...overrides,
  };
}

describe("RadarPanel mobile trigger evidence", () => {
  it("shows promotion plus historical participation on mobile cards", () => {
    render(
      <MemoryRouter>
        <RadarPanelBoard
          panel="day_trade"
          rows={[panelRow()]}
          leader={panelRow()}
          layout="cards"
          columns={["time", "symbol", "move"]}
          sort="rank"
          filters={{ minPrice: "", maxPrice: "", minVolume: "", minMovePct: "" }}
          priceBand="under_1"
          selectedSymbol={null}
          isPro
          freeRowLimit={10}
          nowMs={Date.parse("2026-10-14T12:00:00.000Z")}
          onSelect={() => {}}
          onOpenDetails={() => {}}
          onSort={() => {}}
          onFilters={() => {}}
          onToggleColumn={() => {}}
          onPriceBand={() => {}}
        />
      </MemoryRouter>,
    );

    const card = screen.getByTestId("panel-cards-day_trade").querySelector("[data-symbol='MOB']");
    expect(card).toBeTruthy();
    const triggerHost = card?.querySelector("[title]");
    const title = triggerHost?.getAttribute("title") ?? "";
    expect(title).toMatch(/Promotion: VOLUME EXPLOSION/);
    expect(title).toMatch(/Market-event time/i);
    expect(title).toMatch(/Historical/i);
    expect(title).toMatch(/Last observed COOLING/i);
  });
});
