import { assertEquals } from "jsr:@std/assert";
import {
  buildLateSessionHandoffUpsertsFromV22Candidates,
} from "./capture-late-session-handoffs.ts";
import { v22CandidateToContinuationInput } from "./v22-to-continuation-input.ts";
import type { RadarV22CandidateRow } from "../radar-v22/persistence-v2.ts";

function candidate(overrides: Partial<RadarV22CandidateRow> = {}): RadarV22CandidateRow {
  return {
    generation_id: "11111111-1111-4111-8111-111111111111",
    trading_date: "2026-07-15",
    session_kind: "market",
    symbol: "AAA",
    lifecycle: "ACTIVE",
    signal_status: "active",
    last_price: 10,
    last_price_at: "2026-07-15T19:30:00.000Z",
    move_15s_pct: null,
    move_60s_pct: 5,
    volume_5s: 0,
    volume_15s: 0,
    volume_60s: 0,
    session_volume: 6_000_000,
    dollar_volume_60s: 0,
    acceleration_5m: null,
    rvol_5m: 4,
    volume_velocity: 60_000,
    volume_acceleration_pct: 20,
    session_high: 10.05,
    session_low: 9.5,
    distance_from_hod_pct: 0.4,
    session_vwap: 9.8,
    vwap_side: "above",
    geometry_partial: false,
    vwap_partial: false,
    last_new_hod_at: null,
    last_hod_attempt_at: null,
    last_hod_break_at: null,
    last_hod_reject_at: null,
    last_vwap_cross_at: null,
    last_vwap_reclaim_at: "2026-07-15T19:00:00.000Z",
    last_vwap_loss_at: null,
    freshness_class: "fresh",
    freshness_age_ms: 1000,
    last_volume_burst_at: null,
    last_price_move_at: null,
    last_acceleration_at: null,
    promoted_at: null,
    lifecycle_entered_at: null,
    provider_as_of: "2026-07-15T19:30:00.000Z",
    primary_scanner_event: "MOMENTUM_TRIGGER",
    primary_scanner_event_at: null,
    scanner_events: [],
    promotion_reason: null,
    radar_event_lifecycle: "MOMENTUM",
    radar_engine_events: [{ type: "RE_ACCELERATION", event_at: "2026-07-15T19:00:00.000Z" }],
    time_adjusted_rvol: 4.5,
    volume_5m: 100_000,
    volume_15m: 250_000,
    volume_60m: 800_000,
    volume_velocity_5m: 55_000,
    volume_velocity_15m: 40_000,
    volume_velocity_60m: 30_000,
    dollar_volume_velocity_5m: 500_000,
    participation_state: "SURGING",
    participation_baseline_session_count: 12,
    participation_calculated_at: null,
    participation_source_as_of: null,
    regular_session_close: null,
    previous_close: null,
    prior_session_volume: null,
    updated_at: "2026-07-15T19:30:00.000Z",
    ...overrides,
  };
}

Deno.test("capture: does not fabricate categories when continuation evidence is incomplete", () => {
  const upserts = buildLateSessionHandoffUpsertsFromV22Candidates({
    tradingDate: "2026-07-15",
    sessionKind: "market",
    syncedAt: "2026-07-15T12:00:00.000Z",
    candidates: [candidate({
      session_volume: 50_000,
      volume_velocity: 100,
      participation_state: null,
      time_adjusted_rvol: null,
    })],
  });
  assertEquals(upserts.length, 0);
});

Deno.test("capture: skips pre-market session kind", () => {
  const upserts = buildLateSessionHandoffUpsertsFromV22Candidates({
    tradingDate: "2026-07-15",
    sessionKind: "pre-market",
    syncedAt: "2026-07-15T12:00:00.000Z",
    candidates: [candidate()],
  });
  assertEquals(upserts.length, 0);
});

Deno.test("capture: power hour qualifies and emits one row per category", () => {
  const upserts = buildLateSessionHandoffUpsertsFromV22Candidates({
    tradingDate: "2026-07-15",
    sessionKind: "market",
    syncedAt: "2026-07-15T19:30:00.000Z",
    candidates: [candidate()],
  });
  assertEquals(upserts.length >= 2, true);
  const categories = upserts.map((row) => row.source_category);
  assertEquals(categories.includes("POWER_HOUR_MOMENTUM"), true);
  assertEquals(categories.includes("STRONG_CLOSE_NEAR_HOD"), true);
});

Deno.test("v22 mapper: does not fabricate AH continuation during RTH", () => {
  const input = v22CandidateToContinuationInput(candidate());
  assertEquals(input.afterHoursExtendsSession, "UNKNOWN");
});

Deno.test("v22 mapper: AH continuation requires after-hours session", () => {
  const input = v22CandidateToContinuationInput(candidate({
    session_kind: "after-hours",
    provider_as_of: "2026-07-15T21:00:00.000Z",
    regular_session_close: 10,
    last_price: 10.2,
    time_adjusted_rvol: 3.5,
  }));
  assertEquals(input.afterHoursExtendsSession, "TRUE");
});
