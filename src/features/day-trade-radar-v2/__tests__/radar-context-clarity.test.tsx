import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RadarGrid } from "../RadarGrid";
import { formatRadarContextMultiplier, formatRadarContextVolume } from "../radar-metrics";
import type { RadarRankedRow } from "../types";

const newsStatusBySymbol = vi.hoisted(() => ({ current: new Map<string, "ok" | "empty" | "unavailable" | "pending">() }));

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
    getFloat: () => 2_400_000,
  }),
}));

vi.mock("@/hooks/useRecentProviderNewsForSymbols", () => ({
  useRecentProviderNewsForSymbols: () => ({
    bySymbol: new Map(),
    isPending: false,
    getHeadline: () => undefined,
    getStatus: (symbol: string) => newsStatusBySymbol.current.get(symbol) ?? "empty",
  }),
}));

function ranked(overrides: Partial<RadarRankedRow> = {}): RadarRankedRow {
  return {
    tab_id: "day_trade_radar",
    symbol: "AAA",
    company_name: "Alpha",
    price: 10,
    change_percent: 4,
    volume: 3_700_000,
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
    prior_session_volume: 196_000,
    volume_ratio_prior_session: 18.8,
    day_high: 11,
    day_low: 9,
    provider_as_of: "2026-08-14T15:00:00.000Z",
    sync_run_id: "11111111-1111-4111-8111-111111111111",
    updated_at: "2026-08-14T15:05:00.000Z",
    rank: 1,
    signal: "TOP LEADER",
    hod_distance_percent: 2,
    ...overrides,
  };
}

function renderGrid(rows: RadarRankedRow[], onSelect = vi.fn()) {
  return {
    onSelect,
    ...render(
      <MemoryRouter>
        <RadarGrid rows={rows} selectedSymbol="AAA" isPro freeRowLimit={20} onSelect={onSelect} />
      </MemoryRouter>,
    ),
  };
}

beforeEach(() => {
  newsStatusBySymbol.current = new Map();
});

describe("Radar volume story", () => {
  it("splits prior volume, today volume, and vol/prior", () => {
    expect(formatRadarContextVolume(196_000)).toBe("196K");
    expect(formatRadarContextVolume(3_700_000)).toBe("3.7M");
    expect(formatRadarContextMultiplier(18.8)).toBe("18.8×");
    expect(formatRadarContextVolume(null)).toBe("Unavailable");
    expect(formatRadarContextMultiplier(null)).toBe("Unavailable");

    renderGrid([ranked()]);
    expect(screen.getByRole("columnheader", { name: "Prior Vol" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Today Vol" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Vol / Prior" })).toBeInTheDocument();
    expect(screen.getByText("196K")).toBeInTheDocument();
    expect(screen.getByText("3.7M")).toBeInTheDocument();
    expect(screen.getByText("18.8×")).toBeInTheDocument();
  });

  it("keeps missing prior volume unavailable instead of 0", () => {
    renderGrid([ranked({ prior_session_volume: null, volume_ratio_prior_session: null })]);
    expect(screen.getAllByText("Unavailable").length).toBeGreaterThan(0);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});

describe("Radar news empty copy", () => {
  it("does not repeat No confirmed catalyst", () => {
    renderGrid([ranked()]);
    expect(screen.getByText("No verified news found")).toBeInTheDocument();
    expect(screen.queryByText("No confirmed catalyst")).not.toBeInTheDocument();
    expect(screen.queryByText(/reason for move/i)).not.toBeInTheDocument();
  });

  it("keeps empty and unavailable news copy per symbol in the same batch", () => {
    newsStatusBySymbol.current = new Map([
      ["AAA", "empty"],
      ["BBB", "unavailable"],
    ]);
    renderGrid([ranked({ symbol: "AAA", rank: 1 }), ranked({ symbol: "BBB", rank: 2, company_name: "Beta" })]);
    const rows = screen.getAllByRole("row");
    expect(within(rows[1]).getByText("No verified news found")).toBeInTheDocument();
    expect(within(rows[1]).queryByText("News unavailable")).not.toBeInTheDocument();
    expect(within(rows[2]).getByText("News unavailable")).toBeInTheDocument();
    expect(within(rows[2]).queryByText("No verified news found")).not.toBeInTheDocument();
  });
});

describe("Radar action tooltips", () => {
  it("keeps aria-labels and stopPropagation on action clicks", () => {
    const { onSelect } = renderGrid([ranked()]);
    const watchlist = screen.getByRole("button", { name: "Add AAA to watchlist" });
    expect(watchlist).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View catalysts for AAA" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ask AI Analyst about AAA" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open journal for AAA" })).toBeInTheDocument();
    fireEvent.click(watchlist);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
