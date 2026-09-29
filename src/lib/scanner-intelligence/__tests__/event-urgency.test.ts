import { describe, expect, it } from "vitest";
import {
  DAY_TRADE_FLOAT_MAX_SHARES,
  DAY_TRADE_RVOL_MIN,
  qualifiesDayTradeMomentum,
} from "@/features/day-trade-radar-v2/day-trade-strategy";
import { LEGACY_MOVE_MIN_PCT, LEGACY_PRICE_MAX, LEGACY_PRICE_MIN, LEGACY_VOLUME_RATIO_MIN } from "@/lib/screeners/legacy-confirmation";
import { compareCandidatesVolumeFirst, type RadarV2CandidateRow } from "@/lib/screeners/radar-v2-adapter";
import { compareEventUrgency, eventUrgencyScore } from "@/lib/scanner-intelligence/event-urgency";

function candidate(symbol: string, volume: number): RadarV2CandidateRow {
  return {
    symbol,
    generation_id: "11111111-1111-4111-8111-111111111111",
    trading_date: "2026-09-29",
    session_kind: "market",
    lifecycle: "ACTIVE",
    signal_status: "ACTIVE",
    last_price: 5,
    move_15s_pct: 0.2,
    move_60s_pct: 0.4,
    volume_5s: 1_000,
    volume_15s: 2_000,
    volume_60s: 10_000,
    session_volume: volume,
    dollar_volume_60s: 50_000,
    acceleration_5m: 1,
    rvol_5m: 1,
    volume_velocity: 10_000,
    volume_acceleration_pct: 10,
    primary_scanner_event: null,
    primary_scanner_event_at: null,
    scanner_events: [],
    session_high: 6,
    session_low: 4,
    distance_from_hod_pct: 1,
    session_vwap: 5,
    vwap_side: "above",
    freshness_class: "fresh",
    provider_as_of: "2026-09-29T15:00:00.000Z",
    updated_at: "2026-09-29T15:00:00.000Z",
  };
}

describe("event urgency secondary ranking", () => {
  it("keeps a 3x volume name ahead of a low-volume explosion", () => {
    const liquid = { symbol: "LIQ", volume: 3_000_000, events: [] as string[], catalystPresent: null };
    const thin = {
      symbol: "THIN",
      volume: 200_000,
      events: ["VOLUME_EXPLOSION", "RUNNING_UP"],
      catalystPresent: true as const,
    };
    expect(compareEventUrgency(liquid, thin)).toBeLessThan(0);
    expect(eventUrgencyScore(thin)).toBeGreaterThan(eventUrgencyScore(liquid));
  });

  it("lets stacked events reorder names inside the volume band", () => {
    const quiet = { symbol: "QUIET", volume: 1_200_000, events: [] as string[], catalystPresent: null };
    const burst = { symbol: "BURST", volume: 1_000_000, events: ["VOLUME_EXPLOSION", "RUNNING_UP"], catalystPresent: null };
    expect(compareEventUrgency(burst, quiet)).toBeLessThan(0);
  });

  it("does not give urgency to a sub-floor print", () => {
    expect(eventUrgencyScore({
      symbol: "DUST",
      volume: 10_000,
      events: ["VOLUME_EXPLOSION"],
      catalystPresent: true,
    })).toBe(0);
  });

  it("does not change the Radar volume-first comparator", () => {
    const high = candidate("HIGH", 9_000_000);
    const low = candidate("LOW", 100_000);
    low.primary_scanner_event = "VOLUME_EXPLOSION";
    expect(compareCandidatesVolumeFirst(high, low)).toBeLessThan(0);
  });

  it("leaves Day Trade qualification thresholds unchanged", () => {
    expect(DAY_TRADE_FLOAT_MAX_SHARES).toBe(10_000_000);
    expect(DAY_TRADE_RVOL_MIN).toBe(LEGACY_VOLUME_RATIO_MIN);
    expect(LEGACY_PRICE_MIN).toBe(2);
    expect(LEGACY_PRICE_MAX).toBe(20);
    expect(LEGACY_MOVE_MIN_PCT).toBe(10);
    expect(LEGACY_VOLUME_RATIO_MIN).toBe(5);
    expect(qualifiesDayTradeMomentum).toEqual(expect.any(Function));
  });
});
