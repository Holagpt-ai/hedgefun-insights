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

function triggerCellTitle(clockText: string): string {
  const clock = screen.getByText(clockText);
  const host = clock.closest("[title]");
  expect(host).toBeTruthy();
  return host?.getAttribute("title") ?? "";
}

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
    ...overrides,
  };
}

describe("Radar Triggered presentation", () => {
  it("renders Triggered as the first desktop column with HH:MM:SS ET", () => {
    render(
      <MemoryRouter>
        <RadarGrid
          rows={[ranked({ promoted_at: "2026-09-21T13:42:00.000Z" })]}
          selectedSymbol="AAA"
          isPro
          freeRowLimit={3}
          onSelect={() => {}}
          visibleColumns={defaultRadarColumns()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("columnheader", { name: /Triggered/ })).toBeInTheDocument();
    expect(screen.getByText("9:42:00 AM")).toBeInTheDocument();
    expect(screen.getByText("09/21/26 ET")).toBeInTheDocument();
    const title = triggerCellTitle("9:42:00 AM");
    expect(title).toMatch(/Discovery trigger/);
    expect(title).toMatch(/Last observed|Historical|participation/i);
    expect(screen.queryByText("NEW")).not.toBeInTheDocument();
  });

  it("includes promotion reason and participation evidence in the visible trigger title", () => {
    render(
      <MemoryRouter>
        <RadarGrid
          rows={[
            ranked({
              promoted_at: "2026-09-21T13:42:00.000Z",
              primary_scanner_event: "VOLUME_EXPLOSION",
              primary_scanner_event_at: "2026-09-21T08:00:00.000Z",
              participation_state: "COOLING",
              volume_acceleration_pct: -12,
              promotion_reason: {
                version: "v1",
                primaryEvent: {
                  type: "VOLUME_EXPLOSION",
                  eventAt: "2026-09-21T08:00:00.000Z",
                },
                supportingEvents: [],
                triggerTimestamp: null,
              },
            }),
          ]}
          selectedSymbol="AAA"
          isPro
          freeRowLimit={3}
          onSelect={() => {}}
          visibleColumns={["trigger_time", "symbol"]}
        />
      </MemoryRouter>,
    );
    const title = triggerCellTitle("4:00:00 AM");
    expect(title).toMatch(/Promotion: VOLUME EXPLOSION/);
    expect(title).toMatch(/Historical/i);
    expect(title).toMatch(/Last observed COOLING/i);
    expect(title).not.toMatch(/\bnow\b/i);
  });

  it("16. mobile card renders Triggered before rank", () => {
    render(
      <MemoryRouter>
        <RadarMobileCard
          row={ranked({ promoted_at: "2026-09-21T14:17:00.000Z" })}
          selected={false}
          isPro
          freeRowLimit={3}
          onSelect={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("10:17:00 AM")).toBeInTheDocument();
    expect(triggerCellTitle("10:17:00 AM")).toMatch(/Discovery trigger/);
  });

  it("17. unavailable Triggered displays —", () => {
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
    expect(screen.getByRole("columnheader", { name: /Triggered/ })).toBeInTheDocument();
    expect(screen.getByTitle("Triggered unavailable")).toHaveTextContent("—");
  });

  it("does not treat Data Time as Triggered", () => {
    render(
      <MemoryRouter>
        <RadarGrid
          rows={[ranked({ promoted_at: "2026-09-21T13:42:00.000Z" })]}
          selectedSymbol="AAA"
          isPro
          freeRowLimit={3}
          onSelect={() => {}}
          visibleColumns={["rank", "symbol", "trigger_time", "data_time", "actions"]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("Triggered")).toBeInTheDocument();
    expect(screen.getByText("Data Time")).toBeInTheDocument();
    expect(screen.getByText("9:42:00 AM")).toBeInTheDocument();
  });
});
