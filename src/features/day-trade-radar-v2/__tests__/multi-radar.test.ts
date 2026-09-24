import { describe, expect, it } from "vitest";
import type { RadarRankedRow } from "../types";
import {
  BREAKOUT_DEFAULT_COLUMNS,
  DAY_TRADE_DEFAULT_COLUMNS,
  MULTI_RADAR_DESK_NAME,
  PENNY_DEFAULT_COLUMNS,
  breakoutPanelTime,
  dayTradePanelTime,
  deskRowSignal,
  defaultWorkspaceState,
  formatVolumeSpeedCompact,
  formatVolumeSpeedSpotlight,
  loadWorkspaceState,
  mapVolumeTrend,
  panelAgeLabel,
  pennyPanelTime,
  qualifiesBreakouts,
  qualifiesPennyPrice,
  qualifyPanelRows,
  selectBreakoutLeader,
  selectDayTradeLeader,
} from "../multi-radar";
import { RADAR_COLUMN_STORAGE_KEY } from "../radar-grid-columns";

const PROMOTED = "2026-09-24T14:42:18.000Z";
const BREAKOUT_AT = "2026-09-24T15:02:18.000Z";
const UPDATED = "2026-09-24T18:00:00.000Z";

function row(overrides: Partial<RadarRankedRow> & Pick<RadarRankedRow, "symbol" | "rank">): RadarRankedRow {
  return {
    tab_id: "day_trade_radar",
    company_name: overrides.symbol,
    price: 2,
    change_percent: 10,
    volume: 1_000_000,
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
    prior_session_volume: null,
    volume_ratio_prior_session: null,
    day_high: 3,
    day_low: 1,
    provider_as_of: UPDATED,
    sync_run_id: "11111111-1111-4111-8111-111111111111",
    updated_at: UPDATED,
    signal: "VOLUME LEADER",
    hod_distance_percent: 1.2,
    promoted_at: PROMOTED,
    ...overrides,
  };
}

function memoryStore(seed: Record<string, string> = {}) {
  const data = { ...seed };
  return {
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
    removeItem: (key: string) => {
      delete data[key];
    },
    data,
  };
}

describe("multi-radar qualification", () => {
  const universe = [
    row({ symbol: "BENF", rank: 1, price: 2.9, promoted_at: PROMOTED }),
    row({
      symbol: "BRK",
      rank: 4,
      price: 8,
      primary_scanner_event: "HOD_BREAK",
      primary_scanner_event_at: BREAKOUT_AT,
      scanner_events: [{ type: "HOD_BREAK", triggered_at: BREAKOUT_AT, active: true }],
    }),
    row({ symbol: "P99", rank: 2, price: 0.99 }),
    row({ symbol: "P100", rank: 3, price: 1 }),
    row({ symbol: "P101", rank: 5, price: 1.01 }),
  ];

  it("keeps one radar universe and allows a name in more than one panel", () => {
    const pennyBreakout = row({
      symbol: "BOTH",
      rank: 6,
      price: 0.4,
      primary_scanner_event: "VWAP_RECLAIM",
      scanner_events: [{ type: "VWAP_RECLAIM", triggered_at: BREAKOUT_AT, active: true }],
    });
    const rows = [...universe, pennyBreakout];
    expect(qualifyPanelRows(rows, "day_trade").map((item) => item.symbol)).toContain("BOTH");
    expect(qualifyPanelRows(rows, "breakouts").map((item) => item.symbol)).toEqual(["BRK", "BOTH"]);
    expect(qualifyPanelRows(rows, "penny").map((item) => item.symbol)).toEqual(["P99", "BOTH"]);
  });

  it("qualifies penny prices strictly under $1", () => {
    expect(qualifiesPennyPrice(0.99)).toBe(true);
    expect(qualifiesPennyPrice(1)).toBe(false);
    expect(qualifiesPennyPrice(1.01)).toBe(false);
  });

  it("qualifies only active structural breakout events", () => {
    expect(qualifiesBreakouts(universe[1]!)).toBe(true);
    expect(qualifiesBreakouts(row({
      symbol: "LATE",
      rank: 8,
      primary_scanner_event: "VOLUME_EXPLOSION",
      scanner_events: [{ type: "VOLUME_EXPLOSION", triggered_at: BREAKOUT_AT, active: true }],
    }))).toBe(false);
    expect(qualifiesBreakouts(row({
      symbol: "OFF",
      rank: 9,
      scanner_events: [{ type: "RUNNING_UP", triggered_at: BREAKOUT_AT, active: false }],
    }))).toBe(false);
  });

  it("uses the existing radar field order for each desk", () => {
    expect(DAY_TRADE_DEFAULT_COLUMNS[0]).toBe("time");
    expect(DAY_TRADE_DEFAULT_COLUMNS).toContain("float");
    expect(BREAKOUT_DEFAULT_COLUMNS).toContain("vwap");
    expect(PENNY_DEFAULT_COLUMNS).toEqual(DAY_TRADE_DEFAULT_COLUMNS);
    expect(defaultWorkspaceState().desk).toBe(MULTI_RADAR_DESK_NAME);
  });
});

describe("panel time", () => {
  it("never displays updated_at", () => {
    const bare = row({ symbol: "AAA", rank: 1, promoted_at: null, updated_at: UPDATED });
    expect(dayTradePanelTime(bare).iso).toBeNull();
    expect(pennyPanelTime(bare).iso).toBeNull();
    expect(breakoutPanelTime(bare).iso).toBeNull();
  });

  it("shows a scanner event or NEW and hides VOLUME LEADER", () => {
    const plain = row({ symbol: "AAA", rank: 2, signal: "VOLUME LEADER" });
    expect(deskRowSignal(plain, "12m")).toBeNull();
    expect(deskRowSignal(plain, "NEW")).toBe("NEW");
    const running = row({
      symbol: "RUN",
      rank: 3,
      signal: "VOLUME LEADER",
      primary_scanner_event: "RUNNING_UP",
    });
    expect(deskRowSignal(running, "NEW")).toBe("RUNNING UP");
    expect(deskRowSignal(row({
      symbol: "HOD",
      rank: 4,
      signal: "TOP LEADER",
      primary_scanner_event: "HOD_BREAK",
    }), null)).toBe("HOD BREAK");
  });

  it("keeps day trade and penny on promoted_at and breakouts on the event clock", () => {
    const item = row({
      symbol: "BENF",
      rank: 1,
      promoted_at: PROMOTED,
      primary_scanner_event: "RUNNING_UP",
      primary_scanner_event_at: BREAKOUT_AT,
      scanner_events: [{ type: "RUNNING_UP", triggered_at: BREAKOUT_AT, active: true }],
      updated_at: UPDATED,
    });
    expect(dayTradePanelTime(item)).toEqual({ iso: PROMOTED, source: "promoted_at" });
    expect(pennyPanelTime(item).iso).toBe(PROMOTED);
    expect(breakoutPanelTime(item).iso).toBe(BREAKOUT_AT);
    expect(dayTradePanelTime(item).iso).not.toBe(UPDATED);
  });

  it("shows NEW for the first 3 minutes and then a stable age", () => {
    const start = Date.parse(PROMOTED);
    expect(panelAgeLabel(PROMOTED, start + 2 * 60_000)).toBe("NEW");
    expect(panelAgeLabel(PROMOTED, start + 3 * 60_000)).toBe("3m");
    expect(panelAgeLabel(PROMOTED, start + 4 * 60_000)).toBe("4m");
    expect(panelAgeLabel(PROMOTED, start + 12 * 60_000)).toBe("12m");
    expect(panelAgeLabel(null, start)).toBeNull();
  });
});

describe("volume language", () => {
  it("formats speed from the real velocity and leaves null unavailable", () => {
    expect(formatVolumeSpeedCompact(497_000)).toBe("497K/min");
    expect(formatVolumeSpeedCompact(1_020_000)).toBe("1.0M/min");
    expect(formatVolumeSpeedCompact(null)).toBe("—");
    expect(formatVolumeSpeedSpotlight(496_736)).toEqual({ value: "496,736", unit: "shares/min" });
    expect(formatVolumeSpeedSpotlight(1_020_000)?.value).toBe("1.02M");
    expect(formatVolumeSpeedSpotlight(null)).toBeNull();
  });

  it("maps acceleration bands without inventing a trend", () => {
    expect(mapVolumeTrend(-20).label).toBe("COOLING ↓");
    expect(mapVolumeTrend(0).label).toBe("STEADY");
    expect(mapVolumeTrend(49.5).label).toBe("RISING ↑");
    expect(mapVolumeTrend(80).label).toBe("SURGING ↑↑");
    expect(mapVolumeTrend(100).label).toBe("EXTREME ↑↑");
    expect(mapVolumeTrend(null).label).toBe("—");
    expect(mapVolumeTrend(49.5).title).toMatch(/\+49\.5%/);
  });
});

describe("leaders and storage reset", () => {
  it("picks the best radar rank for day trade and event priority for breakouts", () => {
    const rows = [
      row({ symbol: "SLOW", rank: 2, vol_velocity: 10, volume: 9_000_000 }),
      row({ symbol: "FAST", rank: 1, vol_velocity: 496_736, volume: 1_000 }),
      row({
        symbol: "GAP",
        rank: 1,
        primary_scanner_event: "GAP_CONTINUATION",
        scanner_events: [{ type: "GAP_CONTINUATION", triggered_at: PROMOTED, active: true }],
      }),
      row({
        symbol: "HOD",
        rank: 9,
        volume: 100,
        primary_scanner_event: "HOD_BREAK",
        scanner_events: [{ type: "HOD_BREAK", triggered_at: BREAKOUT_AT, active: true }],
      }),
    ];
    expect(selectDayTradeLeader(rows)?.symbol).toBe("FAST");
    expect(selectBreakoutLeader(rows)?.symbol).toBe("HOD");
  });

  it("resets legacy scanner column storage onto DAY TRADE DESK", () => {
    const store = memoryStore({
      [RADAR_COLUMN_STORAGE_KEY]: JSON.stringify(["rank", "symbol"]),
      "stocksist-theme": "dark",
    });
    const loaded = loadWorkspaceState(store);
    expect(loaded.desk).toBe("DAY TRADE DESK");
    expect(loaded.panels.day_trade.sort).toBe("rank");
    expect(store.data[RADAR_COLUMN_STORAGE_KEY]).toBeUndefined();
    expect(store.data["stocksist-theme"]).toBe("dark");
    expect(JSON.stringify(loaded)).not.toMatch(/momentum_2_20/);
  });
});
