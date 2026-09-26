import { describe, expect, it } from "vitest";
import { formatElapsedAge } from "@/lib/screeners/elapsed-age";
import { formatTriggerTimePrimaryLine } from "@/lib/screeners/screener-trigger-time";
import {
  acceptClosedSessionSnapshot,
  resolveClosedSessionSnapshotDecision,
  retainClosedSessionSnapshot,
  type RadarClosedSnapshotRow,
} from "@/lib/screeners/radar-closed-snapshot";
import {
  buildRadarV2Decision,
  type RadarV2CandidateRow,
  type RadarV2ScreenerRow,
} from "@/lib/screeners/radar-v2-adapter";
import { dayTradePanelTime } from "@/features/day-trade-radar-v2/multi-radar";

const GEN = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const PROMOTED = "2026-09-25T20:26:45.000Z";
const CAPTURED = "2026-09-26T00:00:05.000Z";
const CLOSED_NOW = Date.parse("2026-09-26T01:10:12.000Z");
const NEXT_SESSION = Date.parse("2026-09-26T08:05:00.000Z");

function live(overrides: Partial<RadarV2CandidateRow> = {}): RadarV2CandidateRow {
  return {
    symbol: "SHMD",
    generation_id: GEN,
    trading_date: "2026-09-25",
    session_kind: "after-hours",
    lifecycle: "ACTIVE",
    signal_status: "EXPLOSIVE",
    last_price: 4.37,
    move_15s_pct: null,
    move_60s_pct: null,
    volume_5s: 0,
    volume_15s: 0,
    volume_60s: 0,
    session_volume: 13_070_081,
    dollar_volume_60s: 0,
    acceleration_5m: null,
    rvol_5m: null,
    volume_velocity: null,
    volume_acceleration_pct: 32.4,
    primary_scanner_event: null,
    primary_scanner_event_at: null,
    scanner_events: [],
    session_high: 4.5,
    session_low: 3.2,
    distance_from_hod_pct: null,
    session_vwap: null,
    vwap_side: "unknown",
    freshness_class: "unknown",
    provider_as_of: CAPTURED,
    previous_close: 3.62,
    prior_session_volume: 524_062,
    updated_at: CAPTURED,
    promoted_at: PROMOTED,
    ...overrides,
  };
}

function snap(row: RadarV2CandidateRow, tradingDate = row.trading_date): RadarClosedSnapshotRow {
  return {
    ...row,
    trading_date: tradingDate,
    snapshot_kind: "closed_session",
    captured_at: CAPTURED,
  };
}

function closedFallback() {
  return buildRadarV2Decision({
    feedRows: [{
      state_key: "current",
      session_kind: "closed",
      sentinel_enabled: true,
      candidate_count: 0,
      v2_generation_id: GEN,
      v2_synced_at: CAPTURED,
      last_receive_at: CAPTURED,
      last_provider_event_at: null,
      feed_stale: false,
      updated_at: CAPTURED,
    }],
    candidateRows: [],
    tabId: "day_trade_radar",
    nowMs: CLOSED_NOW,
  });
}

describe("closed-session radar snapshot", () => {
  it("keeps live candidates on an active session and ignores a snapshot", () => {
    const next = retainClosedSessionSnapshot(
      { live: [], snapshot: [] },
      {
        tradingDate: "2026-09-25",
        sessionKind: "after-hours",
        candidates: [live()],
        capturedAt: CAPTURED,
      },
    );
    expect(next.live).toHaveLength(1);
    expect(next.snapshot).toEqual([]);
    const decision = resolveClosedSessionSnapshotDecision({
      liveDecision: {
        source: "radar-v2",
        reason: "radar_v2_available",
        session: "after-hours",
        view: { status: "available", rows: [], synced_at: CAPTURED, provider_as_of_max: null },
      },
      tabId: "day_trade_radar",
      nowMs: CLOSED_NOW,
      rows: [snap(live())],
    });
    expect(decision).toBeNull();
  });

  it("copies the last live generation on park_closed and leaves the live set empty", () => {
    const parked = retainClosedSessionSnapshot(
      { live: [live()], snapshot: [] },
      {
        tradingDate: "2026-09-25",
        sessionKind: "closed",
        candidates: [],
        capturedAt: CAPTURED,
      },
    );
    expect(parked.live).toEqual([]);
    expect(parked.snapshot).toHaveLength(1);
    expect(parked.snapshot[0]?.promoted_at).toBe(PROMOTED);
    expect(parked.snapshot[0]?.volume_acceleration_pct).toBe(32.4);
    expect(parked.snapshot[0]?.snapshot_kind).toBe("closed_session");

    const again = retainClosedSessionSnapshot(parked, {
      tradingDate: "2026-09-25",
      sessionKind: "closed",
      candidates: [],
      capturedAt: "2026-09-26T01:10:12.000Z",
    });
    expect(again.live).toEqual([]);
    expect(again.snapshot[0]?.captured_at).toBe(CAPTURED);
  });

  it("accepts the same-session snapshot and rejects it after the surveillance rollover", () => {
    const row = snap(live());
    expect(acceptClosedSessionSnapshot({
      feedSessionKind: "closed",
      surveillanceDate: "2026-09-25",
      rows: [row],
    })?.[0]?.symbol).toBe("SHMD");
    expect(acceptClosedSessionSnapshot({
      feedSessionKind: "closed",
      surveillanceDate: "2026-09-26",
      rows: [row],
    })).toBeNull();
    expect(acceptClosedSessionSnapshot({
      feedSessionKind: "after-hours",
      surveillanceDate: "2026-09-25",
      rows: [row],
    })).toBeNull();

    const rolled = retainClosedSessionSnapshot(
      { live: [], snapshot: [row] },
      {
        tradingDate: "2026-09-26",
        sessionKind: "pre-market",
        candidates: [],
        capturedAt: "2026-09-26T08:00:01.000Z",
      },
    );
    expect(rolled.snapshot).toEqual([]);
    expect(rolled.live).toEqual([]);
  });

  it("maps promoted_at and volume trend into the closed row, and falls back when the snapshot is missing", () => {
    const adopted = resolveClosedSessionSnapshotDecision({
      liveDecision: closedFallback(),
      tabId: "day_trade_radar",
      nowMs: CLOSED_NOW,
      rows: [snap(live())],
    });
    expect(adopted?.source).toBe("radar-v2");
    expect(adopted?.view?.closedSnapshot).toBe(true);
    const mapped = adopted?.view?.rows[0] as RadarV2ScreenerRow | undefined;
    expect(mapped?.promoted_at).toBe(PROMOTED);
    expect(mapped?.volume_acceleration_pct).toBe(32.4);
    expect(dayTradePanelTime({ promoted_at: mapped?.promoted_at, updated_at: mapped?.updated_at ?? "" }).iso).toBe(PROMOTED);
    expect(formatTriggerTimePrimaryLine(mapped?.promoted_at)).toBe("4:26:45 PM");
    const age = formatElapsedAge(mapped?.promoted_at, CLOSED_NOW);
    const later = formatElapsedAge(mapped?.promoted_at, CLOSED_NOW + 1000);
    expect(age).toBe("4h 43m 27s ago");
    expect(later).toBe("4h 43m 28s ago");

    const missing = resolveClosedSessionSnapshotDecision({
      liveDecision: closedFallback(),
      tabId: "day_trade_radar",
      nowMs: CLOSED_NOW,
      rows: [],
    });
    expect(missing).toBeNull();
    expect(closedFallback().source).toBe("fallback");

    const staleDate = resolveClosedSessionSnapshotDecision({
      liveDecision: closedFallback(),
      tabId: "day_trade_radar",
      nowMs: NEXT_SESSION,
      rows: [snap(live())],
    });
    expect(staleDate).toBeNull();
  });
});
