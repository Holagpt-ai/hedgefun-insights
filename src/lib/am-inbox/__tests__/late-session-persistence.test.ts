import { describe, expect, it, beforeEach } from "vitest";
import { buildAmInboxLateSessionViewFromContexts } from "@/lib/am-inbox/am-inbox-late-session-view";
import { buildLateSessionContinuationContext } from "@/lib/am-inbox/build-late-session-continuation-context";
import { mapPersistedLateSessionRow, type PersistedLateSessionHandoffRow } from "@/lib/am-inbox/late-session-handoff-persistence";
import { resetLateSessionHandoffStoreForTests } from "@/lib/am-inbox/late-session-handoff-storage";
import { compareCandidatesVolumeFirst, type RadarV2CandidateRow } from "@/lib/screeners/radar-v2-adapter";

function persistedRow(
  overrides: Partial<PersistedLateSessionHandoffRow> = {},
): PersistedLateSessionHandoffRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    security_id: null,
    symbol: "AAA",
    source_session_date: "2026-09-21",
    source_timestamp: "2026-09-21T20:00:00.000Z",
    source_category: "STRONG_CLOSE_NEAR_HOD",
    last_price: 10,
    session_move_pct: 5,
    volume: 1_000_000,
    rvol: null,
    dollar_volume: 10_000_000,
    close_distance_from_hod_pct: 0.4,
    after_hours_extends: null,
    catalyst_present: null,
    float_turnover: null,
    historical_context_available: false,
    evidence_labels: [],
    sample_size_quality: null,
    comparable_episode_count: null,
    most_recent_comparable_date: null,
    profile_freshness: "UNKNOWN",
    valid_from_session_date: "2026-09-22",
    valid_through_session_date: "2026-09-22",
    capture_freshness_class: "active",
    ...overrides,
  };
}

describe("Late-session server persistence V1", () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetLateSessionHandoffStoreForTests();
  });

  it("maps persisted row with null RVOL and null catalyst", () => {
    const ctx = mapPersistedLateSessionRow(persistedRow(), "2026-09-22");
    expect(ctx.rvol).toBeNull();
    expect(ctx.catalystPresent).toBeNull();
    expect(ctx.historicalContextAvailable).toBe(false);
  });

  it("builds AM view from server contexts without sessionStorage seed", () => {
    const ctx = mapPersistedLateSessionRow(persistedRow(), "2026-09-22");
    const view = buildAmInboxLateSessionViewFromContexts("2026-09-22", [ctx]);
    expect(view.candidates).toHaveLength(1);
    expect(view.candidates[0]?.context.symbol).toBe("AAA");
  });

  it("Day-Two row active on second eligible session", () => {
    const ctx = buildLateSessionContinuationContext({
      symbol: "DT",
      sourceSessionDate: "2026-09-21",
      sourceTimestamp: "2026-09-21T20:00:00.000Z",
      sourceCategory: "DAY_TWO_WATCH",
      amSessionDate: "2026-09-23",
    });
    const view = buildAmInboxLateSessionViewFromContexts("2026-09-23", [ctx]);
    expect(view.candidates).toHaveLength(1);
  });

  it("does not change Discovery volume-first order", () => {
    const low: RadarV2CandidateRow = {
      symbol: "LOW",
      generation_id: "11111111-1111-4111-8111-111111111111",
      trading_date: "2026-09-21",
      session_kind: "regular",
      lifecycle: "active",
      signal_status: "active",
      last_price: 10,
      move_15s_pct: null,
      move_60s_pct: null,
      volume_5s: null,
      volume_15s: null,
      volume_60s: null,
      session_volume: 1_000_000,
      dollar_volume_60s: null,
      acceleration_5m: null,
      rvol_5m: null,
      volume_velocity: null,
      volume_acceleration_pct: null,
      session_high: null,
      session_low: null,
      distance_from_hod_pct: null,
      session_vwap: null,
      vwap_side: null,
      freshness_class: null,
      provider_as_of: "2026-09-21T19:30:00.000Z",
      updated_at: "2026-09-21T19:30:00.000Z",
    };
    const high = { ...low, symbol: "HIGH", session_volume: 9_000_000 };
    expect(compareCandidatesVolumeFirst(low, high)).toBeGreaterThan(0);
    mapPersistedLateSessionRow(persistedRow({ symbol: "HIGH" }), "2026-09-22");
    expect(compareCandidatesVolumeFirst(high, low)).toBeLessThan(0);
  });
});
