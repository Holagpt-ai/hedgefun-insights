import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  resolveRadarSource,
  viewRadarV22Generation,
  type RadarV22BoardRow,
  type RadarV22FeedState,
  type RadarV22View,
} from "@/lib/radar-v22";
import {
  INITIAL_RADAR_SELECTION,
  radarSelectionReducer,
} from "@/features/day-trade-radar-v2/radar-selection";
import { rankRadarRows, signalForRank } from "@/features/day-trade-radar-v2/radar-metrics";
import type { ScreenerResultRow } from "@/lib/screeners/contract";

const TODAY = "2026-08-13";
const GEN = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function v21row(symbol: string, volume: number): ScreenerResultRow {
  return {
    tab_id: "day_trade_radar",
    symbol,
    company_name: symbol,
    price: 10,
    change_percent: 12,
    volume,
    avg_volume: null,
    rvol: null,
    float_shares: null,
    gap_percent: null,
    high_52w: null,
    low_52w: null,
    range_event: null,
    market_cap: null,
    prior_session_volume: 1_000,
    volume_ratio_prior_session: Math.round((volume / 1_000) * 10) / 10,
    day_high: 11,
    day_low: 9,
    provider_as_of: "2026-08-13T14:00:00.000Z",
    sync_run_id: GEN,
    updated_at: "2026-08-13T14:05:00.000Z",
  };
}

function v22row(symbol: string, rank: number, signal: string): RadarV22BoardRow {
  return {
    generation_id: GEN,
    rank,
    symbol,
    company_name: symbol,
    lifecycle: signal === "EXPLOSIVE" ? "ACTIVE" : "DETECTED",
    signal_status: signal,
    price: 10,
    change_percent: 12,
    volume: 1_000_000,
    prior_session_volume: 100_000,
    volume_ratio_prior_session: 10,
    day_high: 11,
    day_low: 9,
    rolling_volume_5s: 20_000,
    rolling_volume_15s: 40_000,
    rolling_volume_60s: 120_000,
    rolling_dollar_volume_60s: 1_200_000,
    acceleration_5m: null,
    session_vwap: 10,
    peak_volume_15s: 40_000,
    provider_as_of: "2026-08-13T14:00:01.000Z",
    updated_at: "2026-08-13T14:00:05.000Z",
  };
}

function v22View(rows: RadarV22BoardRow[], status: "available" | "stale" | "empty"): RadarV22View {
  const state: RadarV22FeedState = {
    state_key: "current",
    generation_id: GEN,
    status,
    session_date: TODAY,
    synced_at: "2026-08-13T14:00:05.000Z",
    provider_as_of_min: rows[0]?.provider_as_of ?? null,
    provider_as_of_max: rows[0]?.provider_as_of ?? null,
    last_provider_event_at: rows[0]?.provider_as_of ?? null,
    symbol_count: rows.length,
    feed_stale: status === "stale",
    updated_at: "2026-08-13T14:00:05.000Z",
  };
  return viewRadarV22Generation([state], rows, TODAY);
}

describe("Radar V2.1 fallback", () => {
  const v21 = {
    rows: [v21row("OLD1", 9_000_000), v21row("OLD2", 5_000_000)],
    status: "available" as const,
    syncedAt: "2026-08-13T14:00:00.000Z",
    providerAsOfMax: "2026-08-13T13:55:00.000Z",
  };

  it("keeps the V2.1 board when V2.2 has no valid current-session generation", () => {
    const decided = resolveRadarSource({
      todayEt: TODAY,
      adoptedSession: null,
      v21,
      v22: viewRadarV22Generation(null, null, TODAY),
    });
    expect(decided.source).toBe("v2.1");
    expect(decided.status).toBe("available");
    expect(decided.rows.map((r) => r.symbol)).toEqual(["OLD1", "OLD2"]);
  });

  it("uses V2.2 once a valid current-session board exists", () => {
    const decided = resolveRadarSource({
      todayEt: TODAY,
      adoptedSession: null,
      v21,
      v22: v22View([v22row("NEW1", 1, "EXPLOSIVE")], "available"),
    });
    expect(decided.source).toBe("v2.2");
    expect(decided.adoptedSession).toBe(TODAY);
    expect(decided.rows[0]?.symbol).toBe("NEW1");
    expect((decided.rows[0] as { signal: string }).signal).toBe("EXPLOSIVE");
  });

  it("stale freezes the V2.2 board rather than switching models", () => {
    const decided = resolveRadarSource({
      todayEt: TODAY,
      adoptedSession: TODAY,
      v21,
      v22: v22View([v22row("NEW1", 1, "EXPLOSIVE")], "stale"),
    });
    expect(decided.source).toBe("v2.2");
    expect(decided.status).toBe("stale");
    expect(decided.rows[0]?.symbol).toBe("NEW1");
    expect((decided.rows[0] as { signal: string }).signal).toBe("STALE");
  });
});

describe("selected-symbol stability / Follow #1 with V2.2 signals", () => {
  it("Follow #1 tracks the new leader and uses V2.2 signal labels", () => {
    const first = rankRadarRows(
      [v21row("LEAD", 10_000_000), v21row("TWO", 5_000_000)],
      "available",
    ).map((row, i) =>
      i === 0 ? { ...row, signal_status: "EXPLOSIVE", signal: signalForRank(1, "available", false, "EXPLOSIVE") } : row,
    );
    const nextBoard = rankRadarRows(
      [v21row("NEW1", 50_000_000), v21row("LEAD", 10_000_000)],
      "available",
    ).map((row, i) =>
      i === 0
        ? { ...row, signal_status: "BUILDING", signal: signalForRank(1, "available", false, "BUILDING") }
        : row,
    );
    const following = radarSelectionReducer(
      { mode: "follow_leader", selectedSymbol: "LEAD", snapshot: first[0], inactive: false },
      { type: "board_updated", rows: nextBoard },
    );
    expect(following.selectedSymbol).toBe("NEW1");
    expect(following.mode).toBe("follow_leader");
    expect(nextBoard[0].signal).toBe("BUILDING");
  });

  it("manual selection stays on a ticker that left the board", () => {
    const board = rankRadarRows(
      [v21row("LEAD", 10_000_000), v21row("TWO", 5_000_000)],
      "available",
    );
    const next = radarSelectionReducer(
      { mode: "manual", selectedSymbol: "TWO", snapshot: board[1], inactive: false },
      { type: "board_updated", rows: rankRadarRows([v21row("LEAD", 10_000_000)], "available") },
    );
    expect(next.inactive).toBe(true);
    expect(next.snapshot?.signal).toBe("INACTIVE");
  });
});

describe("no browser-side rolling calculations", () => {
  it("Radar V2.2 client files do not subscribe to raw market events or compute rolling windows", () => {
    const files = [
      "src/hooks/useRadarV22Board.ts",
      "src/lib/radar-v22.ts",
      "src/features/day-trade-radar-v2/DayTradeRadarV2.tsx",
    ];
    const root = process.cwd();
    for (const rel of files) {
      const src = readFileSync(resolve(root, rel), "utf8");
      expect(src).not.toMatch(/massive\.com/);
      expect(src).not.toMatch(/polygon\.io/);
      expect(src).not.toMatch(/["']A\.\*/);
      expect(src).not.toMatch(/rolling_volume_5s\s*\+/);
      expect(src).not.toMatch(/WebSocket\(/);
    }
  });
});

describe("V2.2 signal mapping", () => {
  it("uses signal_status instead of TOP LEADER / VOLUME LEADER", () => {
    expect(signalForRank(1, "available", false, "EXPLOSIVE")).toBe("EXPLOSIVE");
    expect(signalForRank(2, "available", false, "BUILDING")).toBe("BUILDING");
    expect(signalForRank(1, "available", false)).toBe("TOP LEADER");
    expect(signalForRank(1, "stale", false, "EXPLOSIVE")).toBe("STALE");
  });
});
