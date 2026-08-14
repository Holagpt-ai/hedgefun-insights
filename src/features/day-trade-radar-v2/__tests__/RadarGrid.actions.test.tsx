import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RadarGrid } from "../RadarGrid";
import {
  RADAR_ACTIONS_MIN_WIDTH_PX,
  RADAR_ACTIONS_STICKY_CELL_CLASS,
  RADAR_ACTIONS_STICKY_HEADER_CLASS,
  RADAR_GRID_COLUMN_COUNT,
  RADAR_GRID_COLUMNS,
} from "../radar-grid-columns";
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

function ranked(symbol = "AAA"): RadarRankedRow {
  return {
    tab_id: "day_trade_radar",
    symbol,
    company_name: "Alpha",
    price: 10,
    change_percent: 4,
    volume: 1_000_000,
    avg_volume: null,
    rvol: null,
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
    provider_as_of: "2026-08-14T15:00:00.000Z",
    sync_run_id: "11111111-1111-4111-8111-111111111111",
    updated_at: "2026-08-14T15:05:00.000Z",
    rank: 1,
    signal: "TOP LEADER",
    hod_distance_percent: 2,
  };
}

describe("Day Trade Radar Actions sticky column", () => {
  it("keeps nine columns and a 160px sticky-right Actions contract", () => {
    expect(RADAR_GRID_COLUMN_COUNT).toBe(9);
    expect(RADAR_GRID_COLUMNS[RADAR_GRID_COLUMN_COUNT - 1]).toBe("Actions");
    expect(RADAR_ACTIONS_MIN_WIDTH_PX).toBe(160);
    expect(RADAR_ACTIONS_STICKY_HEADER_CLASS).toContain("sticky");
    expect(RADAR_ACTIONS_STICKY_HEADER_CLASS).toContain("right-0");
    expect(RADAR_ACTIONS_STICKY_HEADER_CLASS).toContain("bg-muted");
    expect(RADAR_ACTIONS_STICKY_CELL_CLASS).toContain("sticky");
    expect(RADAR_ACTIONS_STICKY_CELL_CLASS).toContain("right-0");
    expect(RADAR_ACTIONS_STICKY_CELL_CLASS).toContain("min-w-[160px]");
  });

  it("renders all four Actions controls without clipping the sticky column", () => {
    const { container } = render(
      <MemoryRouter>
        <RadarGrid
          rows={[ranked("AAA")]}
          selectedSymbol="AAA"
          isPro
          freeRowLimit={3}
          onSelect={() => {}}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("columnheader", { name: "Actions" }).className)
      .toContain("sticky");
    expect(screen.getByRole("columnheader", { name: "Actions" }).className)
      .toContain("right-0");

    const actionCell = container.querySelector("tbody td:last-child");
    expect(actionCell?.className).toContain("sticky");
    expect(actionCell?.className).toContain("right-0");
    expect(actionCell?.className).toContain("min-w-[160px]");
    expect(actionCell?.className).toContain("bg-accent-blue-light");

    expect(screen.getByRole("button", { name: "Add AAA to watchlist" }))
      .toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View catalysts for AAA" }))
      .toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ask AI Analyst about AAA" }))
      .toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open journal for AAA" }))
      .toBeInTheDocument();

    const scroller = container.querySelector(".overflow-x-auto");
    expect(scroller).toBeTruthy();
  });
});
