import { describe, expect, it, vi, beforeEach } from "vitest";
import { isRadarRowAccessible } from "@/features/day-trade-radar-v2/radar-metrics";
import { rankRadarRows } from "@/features/day-trade-radar-v2/radar-metrics";
import { mapCandidateToScreenerRow, type RadarV2CandidateRow } from "@/lib/screeners/radar-v2-adapter";

// Mutable Supabase responses per test.
const responses: {
  feed: { data: unknown; error: unknown };
  cand: { data: unknown; error: unknown };
} = {
  feed: { data: [], error: null },
  cand: { data: [], error: null },
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from(table: string) {
      return {
        select() {
          return {
            eq: () => Promise.resolve(table === "radar_v22_feed_state" ? responses.feed : responses.cand),
            limit: () => Promise.resolve(table === "radar_v22_candidates" ? responses.cand : responses.feed),
          };
        },
      };
    },
  },
}));

import { loadRadarV2Decision } from "@/lib/screeners/radar-v2-source";

const GEN = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const NOW = Date.parse("2026-09-03T13:12:57.000Z");
const SYNCED = "2026-09-03T13:12:30.000Z";

function feedRow() {
  return {
    state_key: "current",
    session_kind: "pre-market",
    sentinel_enabled: true,
    candidate_count: 1,
    v2_generation_id: GEN,
    v2_synced_at: SYNCED,
    last_receive_at: SYNCED,
    last_provider_event_at: "2026-09-03T12:57:30.000Z",
    feed_stale: false,
    updated_at: SYNCED,
  };
}

function candRow(overrides: Partial<RadarV2CandidateRow> = {}) {
  return {
    symbol: "AAA",
    generation_id: GEN,
    trading_date: "2026-09-03",
    session_kind: "pre-market",
    lifecycle: "ACTIVE",
    signal_status: "EXPLOSIVE",
    last_price: 10,
    move_15s_pct: 1,
    move_60s_pct: 2,
    volume_5s: 1,
    volume_15s: 1,
    volume_60s: 1,
    session_volume: 1_000_000,
    dollar_volume_60s: 1,
    acceleration_5m: 0,
    session_high: 11,
    session_low: 9,
    distance_from_hod_pct: 1,
    session_vwap: 10,
    vwap_side: "above",
    freshness_class: "fresh",
    provider_as_of: "2026-09-03T12:57:30.000Z",
    updated_at: SYNCED,
    ...overrides,
  };
}

beforeEach(() => {
  responses.feed = { data: [], error: null };
  responses.cand = { data: [], error: null };
});

describe("Radar V2 source wiring", () => {
  it("maps fetched candidates into a radar-v2 decision", async () => {
    responses.feed = { data: [feedRow()], error: null };
    responses.cand = { data: [candRow()], error: null };
    const decision = await loadRadarV2Decision("day_trade_radar", NOW);
    expect(decision.source).toBe("radar-v2");
    expect(decision.view!.rows[0].symbol).toBe("AAA");
  });

  it("falls back on a Supabase read error", async () => {
    responses.feed = { data: null, error: { message: "boom" } };
    responses.cand = { data: null, error: null };
    const decision = await loadRadarV2Decision("day_trade_radar", NOW);
    expect(decision.source).toBe("fallback");
    expect(decision.reason).toBe("radar_v2_fetch_error");
  });

  it("short-circuits non-Radar-backed tabs to fallback", async () => {
    const decision = await loadRadarV2Decision("gappers", NOW);
    expect(decision.source).toBe("fallback");
    expect(decision.reason).toBe("tab_not_radar_backed");
  });
});

describe("Radar V2 free/Pro entitlement gating remains intact", () => {
  it("7. free users are limited to freeRowLimit rows by rank; Pro sees all", () => {
    const rows = [
      candRow({ symbol: "AAA", session_volume: 5_000_000 }),
      candRow({ symbol: "BBB", session_volume: 4_000_000 }),
      candRow({ symbol: "CCC", session_volume: 3_000_000 }),
    ].map((c) => mapCandidateToScreenerRow(c as RadarV2CandidateRow, "day_trade_radar"));
    const board = rankRadarRows(rows, "available");

    // Free (limit 2): ranks 1-2 accessible, rank 3 gated.
    expect(isRadarRowAccessible(board[0].rank, false, 2)).toBe(true);
    expect(isRadarRowAccessible(board[1].rank, false, 2)).toBe(true);
    expect(isRadarRowAccessible(board[2].rank, false, 2)).toBe(false);

    // Pro: every rank accessible.
    expect(board.every((r) => isRadarRowAccessible(r.rank, true, 2))).toBe(true);
  });
});
