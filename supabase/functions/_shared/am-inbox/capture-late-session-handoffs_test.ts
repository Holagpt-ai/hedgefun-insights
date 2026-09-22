import { assertEquals } from "jsr:@std/assert";
import { buildLateSessionHandoffUpsertsFromV22Candidates } from "./capture-late-session-handoffs.ts";
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
    last_price_at: "2026-07-15T20:00:00.000Z",
    move_15s_pct: null,
    move_60s_pct: 5,
    volume_5s: 0,
    volume_15s: 0,
    volume_60s: 0,
    session_volume: 6_000_000,
    dollar_volume_60s: 0,
    acceleration_5m: null,
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
    last_vwap_reclaim_at: null,
    last_vwap_loss_at: null,
    freshness_class: "fresh",
    freshness_age_ms: 1000,
    last_volume_burst_at: null,
    last_price_move_at: null,
    last_acceleration_at: null,
    promoted_at: null,
    lifecycle_entered_at: null,
    provider_as_of: "2026-07-15T20:00:00.000Z",
    updated_at: "2026-07-15T20:00:00.000Z",
    ...overrides,
  };
}

Deno.test("capture: does not fabricate categories when continuation evidence is incomplete", () => {
  const upserts = buildLateSessionHandoffUpsertsFromV22Candidates({
    tradingDate: "2026-07-15",
    sessionKind: "market",
    syncedAt: "2026-07-15T20:00:00.000Z",
    candidates: [candidate()],
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
