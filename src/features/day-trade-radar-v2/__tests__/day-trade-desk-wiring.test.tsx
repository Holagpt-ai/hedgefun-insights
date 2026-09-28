import { describe, expect, it, vi } from "vitest";

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
  }),
}));

vi.mock("@/hooks/useRadarFloatForSymbols", () => ({
  useRadarFloatForSymbols: () => ({
    getFloat: () => null,
    isPending: false,
  }),
}));

vi.mock("@/hooks/useRecentProviderNewsForSymbols", () => ({
  useRecentProviderNewsForSymbols: () => ({
    getHeadline: () => undefined,
    getStatus: () => "empty",
    isPending: false,
  }),
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ScreenerResultRow } from "@/lib/screeners/contract";
import { DAY_TRADE_RADAR_MAX_ROWS } from "../day-trade-strategy";
import { authoritativeDayTradeLeader, buildAuthoritativeDayTradeDesk } from "../day-trade-desk";
import { evaluateDayTradeFreshness, formatDayTradeLeaderTiming, qualifiesDayTradeFreshness } from "../day-trade-freshness";
import { qualifiesDayTradeMomentum } from "../day-trade-strategy";
import { rankRadarRows } from "../radar-metrics";
import { MultiRadarWorkspace } from "../MultiRadarWorkspace";
import { qualifyPanelRows } from "../multi-radar";
import type { RadarRankedRow, RadarRankingFields } from "../types";
import { DAY_TRADE_EMPTY_MESSAGE } from "../day-trade-strategy";

const NOW = Date.parse("2026-09-16T15:00:00.000Z");
const MORNING = Date.parse("2026-09-16T04:20:00.000Z");
const AFTERNOON = Date.parse("2026-09-16T14:45:00.000Z");

type RowInput = Partial<ScreenerResultRow & RadarRankingFields> & Pick<ScreenerResultRow, "symbol">;

function row(overrides: RowInput): ScreenerResultRow & RadarRankingFields {
  return {
    tab_id: "day_trade_radar",
    company_name: overrides.symbol,
    price: overrides.price ?? 10,
    change_percent: overrides.change_percent ?? 15,
    volume: overrides.volume ?? 1_000_000,
    avg_volume: null,
    rvol: null,
    avg_volume_20d: null,
    rvol_20d: null,
    float_shares: 5_000_000,
    gap_percent: null,
    high_52w: null,
    low_52w: null,
    range_event: null,
    market_cap: null,
    prior_session_volume: 100_000,
    volume_ratio_prior_session: 10,
    day_high: 11,
    day_low: 9,
    provider_as_of: "2026-09-16T14:55:00.000Z",
    sync_run_id: "11111111-1111-4111-8111-111111111111",
    updated_at: "2026-09-16T14:55:00.000Z",
    promoted_at: "2026-09-16T14:55:00.000Z",
    primary_scanner_event_at: "2026-09-16T14:55:00.000Z",
    vol_velocity: 180_000,
    rolling_volume_60s: 120_000,
    volume_acceleration_pct: 80,
    freshness_class: "fresh",
    signal_status: "EXPLOSIVE",
    ...overrides,
  };
}

function rank(rows: RowInput[]): RadarRankedRow[] {
  return rankRadarRows(
    rows.map((entry) => row({ volume: 1_000_000, ...entry })),
    "available",
  );
}

describe("Day Trade desk wiring regressions", () => {
  it("TEST 1 — low-price SOAR cannot leak into main Day Trade", () => {
    const universe = rank([
      row({
        symbol: "SOAR",
        price: 0.36,
        change_percent: 100,
        volume: 20_000_000,
        vol_velocity: 500_000,
        float_shares: 4_000_000,
      }),
      row({
        symbol: "VALID",
        price: 8,
        change_percent: 35,
        volume: 6_000_000,
        float_shares: 5_000_000,
        vol_velocity: 200_000,
      }),
    ]);
    const board = buildAuthoritativeDayTradeDesk(universe, NOW);
    expect(board.topOpportunities.some((r) => r.symbol === "SOAR")).toBe(false);
    expect(board.topOpportunities[0]?.symbol).toBe("VALID");
    expect(qualifyPanelRows(universe, "penny").map((r) => r.symbol)).toContain("SOAR");
  });

  it("TEST 2 — 100 radar rows produce at most 10 Day Trade table rows", () => {
    const universe = rankRadarRows(
      Array.from({ length: 100 }, (_, index) =>
        row({
          symbol: `T${index}`,
          price: 8,
          change_percent: 12 + (index % 5),
          volume: 3_000_000 + index * 10_000,
          vol_velocity: 40_000 + index * 2_000,
          rolling_volume_60s: 20_000 + index * 500,
          distance_from_hod_pct: 0.5 + (index % 3),
        }),
      ),
      "available",
    );
    const board = buildAuthoritativeDayTradeDesk(universe, NOW);
    const strategyPassed = universe.filter(
      (r) => qualifiesDayTradeMomentum(r) && qualifiesDayTradeFreshness(r, NOW),
    );
    expect(universe.length).toBe(100);
    expect(strategyPassed.length).toBeGreaterThan(10);
    expect(board.topOpportunities.length).toBe(DAY_TRADE_RADAR_MAX_ROWS);
  });

  it("TEST 3 — empty strategy means empty desk, no universe fallback", () => {
    const universe = rank(
      Array.from({ length: 100 }, (_, index) =>
        row({
          symbol: `T${index}`,
          price: index % 2 === 0 ? 0.5 : 50,
          change_percent: 5,
        }),
      ),
    );
    const board = buildAuthoritativeDayTradeDesk(universe, NOW);
    expect(board.topOpportunities.length).toBe(0);
    render(
      <MemoryRouter>
        <MultiRadarWorkspace
          rows={universe}
          dayTradeRows={board.topOpportunities}
          dayTradeEmptyMessage={DAY_TRADE_EMPTY_MESSAGE}
          selectedSymbol={null}
          isPro
          freeRowLimit={20}
          nowMs={NOW}
          onSelect={() => {}}
          onOpenDetails={() => {}}
        />
      </MemoryRouter>,
    );
    const panel = screen.getByTestId("radar-panel-day_trade");
    expect(within(panel).getByTestId("panel-empty-day_trade")).toHaveTextContent(DAY_TRADE_EMPTY_MESSAGE);
    expect(within(panel).queryAllByRole("row").filter((r) => r.getAttribute("data-symbol")).length).toBe(0);
    expect(screen.queryByTestId("panel-leader-day_trade")).not.toBeInTheDocument();
  });

  it("TEST 4 — stale morning leader exits current Day Trade Top 10", () => {
    const stale = row({
      symbol: "STALE",
      price: 9,
      change_percent: 40,
      volume: 20_000_000,
      promoted_at: new Date(MORNING).toISOString(),
      primary_scanner_event_at: new Date(MORNING).toISOString(),
      vol_velocity: 500,
      rolling_volume_60s: 800,
      volume_acceleration_pct: -40,
      signal_status: "COOLING",
      freshness_class: "cooling",
    });
    const freshness = evaluateDayTradeFreshness(rank([stale])[0]!, NOW);
    expect(freshness.state).toBe("STALE");
    const board = buildAuthoritativeDayTradeDesk(rank([stale]), NOW);
    expect(board.topOpportunities.length).toBe(0);
  });

  it("TEST 5 — old trigger can reactivate with fresh activity", () => {
    const reactivated = row({
      symbol: "REACT",
      price: 7,
      change_percent: 22,
      volume: 6_000_000,
      promoted_at: new Date(MORNING).toISOString(),
      primary_scanner_event_at: new Date(AFTERNOON).toISOString(),
      last_hod_break_at: new Date(AFTERNOON).toISOString(),
      vol_velocity: 120_000,
      rolling_volume_60s: 90_000,
      volume_acceleration_pct: 80,
      signal_status: "REACTIVATED",
      freshness_class: "fresh",
    });
    const evalFresh = evaluateDayTradeFreshness(rank([reactivated])[0]!, NOW);
    expect(evalFresh.state).toBe("REACTIVATED");
    const board = buildAuthoritativeDayTradeDesk(rank([reactivated]), NOW);
    expect(board.topOpportunities[0]?.symbol).toBe("REACT");
  });

  it("TEST 6 — Top Leader timing renders ET + relative age", () => {
    const leader = rank([
      row({
        symbol: "LEAD",
        promoted_at: "2026-09-16T14:42:00.000Z",
        primary_scanner_event_at: "2026-09-16T14:42:00.000Z",
      }),
    ])[0]!;
    const copy = formatDayTradeLeaderTiming(leader, NOW);
    expect(copy).toMatch(/ET · /);
    render(
      <MemoryRouter>
        <MultiRadarWorkspace
          rows={rank([row({ symbol: "LEAD" })])}
          dayTradeRows={[{ ...leader, day_trade_rank: 1, rank: 1 }]}
          selectedSymbol={null}
          isPro
          freeRowLimit={20}
          nowMs={NOW}
          onSelect={() => {}}
          onOpenDetails={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("day-trade-leader-timing").textContent).toMatch(/ET · /);
  });

  it("TEST 7 — expensive stock stays out of main Day Trade", () => {
    const universe = rank([
      row({ symbol: "NVDA", price: 250, change_percent: 20, volume: 50_000_000, vol_velocity: 900_000 }),
      row({ symbol: "MID", price: 12, change_percent: 18, volume: 4_000_000 }),
    ]);
    const board = buildAuthoritativeDayTradeDesk(universe, NOW);
    expect(board.topOpportunities.some((r) => r.symbol === "NVDA")).toBe(false);
    expect(universe.length).toBe(2);
  });

  it("TEST 8 — leader equals authoritative first row", () => {
    const board = buildAuthoritativeDayTradeDesk(
      rank([row({ symbol: "A" }), row({ symbol: "B", vol_velocity: 999_999 })]),
      NOW,
    );
    expect(authoritativeDayTradeLeader(board.topOpportunities)?.symbol).toBe(board.topOpportunities[0]?.symbol);
  });
});
