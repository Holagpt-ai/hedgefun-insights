import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ScreenerTable } from "../ScreenerTable";
import { getScreenerTabById } from "@/config/screener-tabs.config";
import type { ScreenerResultRow } from "@/lib/screeners/contract";
import type { RadarRankingFields } from "@/features/day-trade-radar-v2/types";

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

function row(
  symbol: string,
  volume: number,
  extras: RadarRankingFields = {},
): ScreenerResultRow & RadarRankingFields {
  return {
    tab_id: "day_trade_radar",
    symbol,
    company_name: symbol,
    price: 10,
    change_percent: 12,
    volume,
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
    volume_ratio_prior_session: volume / 100_000,
    day_high: 11,
    day_low: 9,
    provider_as_of: "2026-09-21T14:00:00.000Z",
    sync_run_id: "11111111-1111-4111-8111-111111111111",
    updated_at: "2026-09-21T14:05:00.000Z",
    radar_trading_date: "2026-09-21",
    ...extras,
  };
}

describe("ScreenerTable Trigger Time column", () => {
  it("keeps Discovery order by default and does not sort by Trigger Time", () => {
    const tab = getScreenerTabById("day_trade_radar");
    render(
      <MemoryRouter>
        <ScreenerTable
          tab={tab!}
          isPro
          status="available"
          rows={[
            row("AAA", 1_000_000, { promoted_at: "2026-09-21T19:08:00.000Z" }),
            row("BBB", 9_000_000, { promoted_at: "2026-09-21T13:42:00.000Z" }),
          ]}
        />
      </MemoryRouter>,
    );

    const table = screen.getAllByRole("table")[0];
    const bodyRows = table.querySelectorAll("tbody tr");
    expect(bodyRows[0]).toHaveTextContent("AAA");
    expect(bodyRows[1]).toHaveTextContent("BBB");
    expect(bodyRows[0]).toHaveTextContent("#1");
    expect(bodyRows[1]).toHaveTextContent("#2");
    expect(screen.getByRole("columnheader", { name: /Trigger Time/ })).toBeInTheDocument();
  });

  it("16/17. renders Trigger Time on mobile as the Discovery clock or —", () => {
    const tab = getScreenerTabById("day_trade_radar");
    render(
      <MemoryRouter>
        <ScreenerTable
          tab={tab!}
          isPro
          status="available"
          rows={[
            row("AAA", 1_000_000, { promoted_at: "2026-09-21T13:42:00.000Z" }),
            row("BBB", 2_000_000),
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getAllByText("9:42 AM").length).toBeGreaterThan(0);
    expect(screen.getAllByTitle("Trigger Time unavailable").length).toBeGreaterThan(0);
  });
});
