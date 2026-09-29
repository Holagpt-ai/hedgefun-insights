import { describe, expect, it } from "vitest";
import { moverFromPolygonTicker } from "@/lib/markets/movers-integrity";
import { resolveStockHeaderPriceState } from "@/lib/price-utils";
import { mapCandidateToScreenerRow, type RadarV2CandidateRow } from "@/lib/screeners/radar-v2-adapter";
import { sessionMovePercent, volumeVersusPriorSession } from "@/lib/screeners/session-move";

/**
 * One neutral symbol shared by homepage movers, Radar-backed screener rows,
 * and the stock header. Gap rows are produced by the screener edge function
 * and covered in the Deno suite with the same inputs.
 *
 * Legitimate differences:
 * - After-hours change uses the same-day regular close, not the prior close.
 * - Radar rows leave gap_percent null. Gap is not a MOVE alias.
 * - Gainers qualification may use a short-window move; the displayed MOVE does not.
 */
const NOW = Date.parse("2026-09-29T13:00:00.000Z");
const PREV_CLOSE = 2;
const PREMARKET_PRICE = 3;
const SESSION_VOLUME = 2_000_000;
const PRIOR_VOLUME = 100_000;

function snapshot() {
  return {
    ticker: "ZZX",
    name: "Example Neutral",
    todaysChangePerc: 50,
    todaysChange: 1,
    day: { c: 0, v: SESSION_VOLUME },
    prevDay: { c: PREV_CLOSE, v: PRIOR_VOLUME },
    lastTrade: { p: PREMARKET_PRICE, t: NOW },
    min: { c: PREMARKET_PRICE, v: SESSION_VOLUME },
    updated: NOW,
  };
}

function candidate(): RadarV2CandidateRow {
  return {
    symbol: "ZZX",
    generation_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    trading_date: "2026-09-29",
    session_kind: "pre-market",
    lifecycle: "ACTIVE",
    signal_status: "ACTIVE",
    last_price: PREMARKET_PRICE,
    move_15s_pct: 1,
    move_60s_pct: 4,
    volume_5s: 1_000,
    volume_15s: 2_000,
    volume_60s: 3_000,
    session_volume: SESSION_VOLUME,
    dollar_volume_60s: 9_000,
    acceleration_5m: null,
    rvol_5m: null,
    volume_velocity: null,
    volume_acceleration_pct: null,
    primary_scanner_event: null,
    primary_scanner_event_at: null,
    scanner_events: [],
    session_high: PREMARKET_PRICE,
    session_low: PREV_CLOSE,
    distance_from_hod_pct: null,
    session_vwap: null,
    vwap_side: null,
    freshness_class: "fresh",
    provider_as_of: new Date(NOW).toISOString(),
    updated_at: new Date(NOW).toISOString(),
    previous_close: PREV_CLOSE,
    prior_session_volume: PRIOR_VOLUME,
  };
}

describe("cross-surface premarket consistency", () => {
  it("uses +50% MOVE and 20× VOL/YDAY from the same prices and volumes", () => {
    const header = resolveStockHeaderPriceState(snapshot(), "pre-market");
    const mover = moverFromPolygonTicker(snapshot(), "premarket", NOW);
    const move = sessionMovePercent(PREMARKET_PRICE, PREV_CLOSE);
    const ratio = volumeVersusPriorSession(SESSION_VOLUME, PRIOR_VOLUME);

    expect(header.displayedPrice).toBe(PREMARKET_PRICE);
    expect(header.referencePrice).toBe(PREV_CLOSE);
    expect(header.change).toBe(1);
    expect(header.changePercent).toBe(50);

    expect(mover.valid).toBe(true);
    expect(mover.price).toBe(PREMARKET_PRICE);
    expect(mover.reference_price).toBe(PREV_CLOSE);
    expect(mover.change_percent).toBe(50);
    expect(mover.volume).toBe(SESSION_VOLUME);

    expect(move).toBe(50);
    expect(ratio).toBe(20);

    for (const tabId of ["day_trade_radar", "volume_spikes", "unusual_volume", "gainers_losers"]) {
      const row = mapCandidateToScreenerRow(candidate(), tabId);
      expect(row.symbol).toBe("ZZX");
      expect(row.price).toBe(PREMARKET_PRICE);
      expect(row.change_percent).toBe(50);
      expect(row.volume).toBe(SESSION_VOLUME);
      expect(row.prior_session_volume).toBe(PRIOR_VOLUME);
      expect(row.volume_ratio_prior_session).toBe(20);
      expect(row.gap_percent).toBeNull();
    }
  });

  it("does not copy a short-window gainers move into the session MOVE", () => {
    const row = mapCandidateToScreenerRow(candidate(), "gainers_losers");
    expect(row.change_percent).toBe(50);
    expect(row.change_percent).not.toBe(candidate().move_60s_pct);
  });
});
