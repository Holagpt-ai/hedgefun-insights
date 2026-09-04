import { describe, expect, it } from "vitest";
import {
  buildRadarV2Decision,
  compareCandidatesVolumeFirst,
  currentRadarV2Feed,
  isRadarV2ActiveSession,
  isRadarV2BackedTab,
  isSameAcceptedRadarV2Generation,
  mapCandidateToScreenerRow,
  qualifyCandidateForTab,
  rankRadarV2Candidates,
  tabDisplayLimit,
  RADAR_V2_CANDIDATE_CAP,
  type RadarV2CandidateRow,
  type RadarV2FeedStateRow,
} from "@/lib/screeners/radar-v2-adapter";
import { MAX_TAB_ROWS } from "@/lib/screeners/contract";
import { rankRadarRows } from "@/features/day-trade-radar-v2/radar-metrics";

const GEN = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const OTHER_GEN = "ffffffff-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const NOW = Date.parse("2026-09-03T13:12:57.000Z");
const SYNCED = "2026-09-03T13:12:30.000Z"; // ~27s old → fresh
const PROVIDER = "2026-09-03T12:57:30.000Z"; // ~15m delayed tape

function candidate(overrides: Partial<RadarV2CandidateRow> = {}): RadarV2CandidateRow {
  return {
    symbol: "AAA",
    generation_id: GEN,
    trading_date: "2026-09-03",
    session_kind: "pre-market",
    lifecycle: "ACTIVE",
    signal_status: "EXPLOSIVE",
    last_price: 10,
    move_15s_pct: 1.2,
    move_60s_pct: 3.4,
    volume_5s: 20_000,
    volume_15s: 40_000,
    volume_60s: 120_000,
    session_volume: 1_000_000,
    dollar_volume_60s: 1_200_000,
    acceleration_5m: 0.5,
    session_high: 11,
    session_low: 9,
    distance_from_hod_pct: 1.5,
    session_vwap: 10,
    vwap_side: "above",
    freshness_class: "fresh",
    provider_as_of: PROVIDER,
    updated_at: SYNCED,
    ...overrides,
  };
}

function feed(overrides: Partial<RadarV2FeedStateRow> = {}): RadarV2FeedStateRow {
  return {
    state_key: "current",
    session_kind: "pre-market",
    sentinel_enabled: true,
    candidate_count: 1,
    v2_generation_id: GEN,
    v2_synced_at: SYNCED,
    last_receive_at: SYNCED,
    last_provider_event_at: PROVIDER,
    feed_stale: false,
    updated_at: SYNCED,
    ...overrides,
  };
}

describe("Radar V2 adapter — session + tab eligibility", () => {
  it("1–4. activates pre-market, market, and after-hours; closed stays inactive", () => {
    expect(isRadarV2ActiveSession("pre-market")).toBe(true);
    expect(isRadarV2ActiveSession("market")).toBe(true);
    expect(isRadarV2ActiveSession("after-hours")).toBe(true);
    expect(isRadarV2ActiveSession("closed")).toBe(false);
    expect(isRadarV2ActiveSession("nonsense")).toBe(false);
  });

  it("marks Radar-backed tabs and excludes gappers / new_highs_lows", () => {
    expect(isRadarV2BackedTab("day_trade_radar")).toBe(true);
    expect(isRadarV2BackedTab("volume_spikes")).toBe(true);
    expect(isRadarV2BackedTab("unusual_volume")).toBe(true);
    expect(isRadarV2BackedTab("gainers_losers")).toBe(true);
    expect(isRadarV2BackedTab("gappers")).toBe(false);
    expect(isRadarV2BackedTab("new_highs_lows")).toBe(false);
  });
});

describe("Radar V2 adapter — mapping (Phase C)", () => {
  it("1. pre-market Radar V2 rows map into Screener rows", () => {
    const decision = buildRadarV2Decision({
      feedRows: [feed()],
      candidateRows: [candidate()],
      tabId: "day_trade_radar",
      nowMs: NOW,
    });
    expect(decision.source).toBe("radar-v2");
    expect(decision.session).toBe("pre-market");
    expect(decision.view?.status).toBe("available");
    const row = decision.view!.rows[0];
    expect(row.tab_id).toBe("day_trade_radar");
    expect(row.symbol).toBe("AAA");
    expect(row.volume).toBe(1_000_000);
    expect(row.price).toBe(10);
    expect(row.day_high).toBe(11);
    expect(row.sync_run_id).toBe(GEN);
    expect(decision.view!.synced_at).toBe(SYNCED);
    expect(decision.view!.provider_as_of_max).toBe(PROVIDER);
  });

  it("10. missing RVOL / prior-close fields stay null so the UI renders —", () => {
    const row = mapCandidateToScreenerRow(candidate(), "day_trade_radar");
    expect(row.rvol).toBeNull();
    expect(row.change_percent).toBeNull();
    expect(row.avg_volume).toBeNull();
    expect(row.gap_percent).toBeNull();
    expect(row.prior_session_volume).toBeNull();
    expect(row.volume_ratio_prior_session).toBeNull();
    expect(row.high_52w).toBeNull();
    expect(row.low_52w).toBeNull();
    expect(row.market_cap).toBeNull();
    expect(row.float_shares).toBeNull();
  });

  it("never surfaces the short-window Radar move as a day/session % change", () => {
    // change_percent stays null (rendered `—`); no prior-close % is fabricated
    // and move_60s/move_15s are never mislabeled as a day change.
    expect(mapCandidateToScreenerRow(candidate(), "gainers_losers").change_percent).toBeNull();
    expect(
      mapCandidateToScreenerRow(
        candidate({ move_60s_pct: 8.8, move_15s_pct: -2.1 }),
        "gainers_losers",
      ).change_percent,
    ).toBeNull();
    expect(mapCandidateToScreenerRow(candidate(), "day_trade_radar").change_percent).toBeNull();
  });

  it("9. ticker handoff identity is preserved (normalized symbol + generation id)", () => {
    const row = mapCandidateToScreenerRow(candidate({ symbol: "  aaa " }), "day_trade_radar");
    expect(row.symbol).toBe("AAA"); // /stocks/AAA, watchlist, catalyst, AI all key off this
    expect(row.sync_run_id).toBe(GEN);
  });
});

describe("Radar V2 adapter — ranking (Phase D: VOLUME IS KING)", () => {
  it("12. volume-first ordering by session_volume desc", () => {
    const ranked = rankRadarV2Candidates([
      candidate({ symbol: "LOW", session_volume: 100_000 }),
      candidate({ symbol: "HIGH", session_volume: 9_000_000 }),
      candidate({ symbol: "MID", session_volume: 1_000_000 }),
    ]);
    expect(ranked.map((r) => r.symbol)).toEqual(["HIGH", "MID", "LOW"]);
  });

  it("13. a materially higher-volume name outranks a lower-volume name with stronger secondary signals", () => {
    const highVol = candidate({
      symbol: "BIG",
      session_volume: 5_000_000,
      acceleration_5m: 0.01,
      move_60s_pct: 0.1,
    });
    const lowVol = candidate({
      symbol: "SMALL",
      session_volume: 200_000,
      acceleration_5m: 99,
      move_60s_pct: 50,
    });
    expect(compareCandidatesVolumeFirst(highVol, lowVol)).toBeLessThan(0);
    const ranked = rankRadarV2Candidates([lowVol, highVol]);
    expect(ranked[0].symbol).toBe("BIG");
  });

  it("uses velocity then acceleration to break equal-volume ties", () => {
    const ranked = rankRadarV2Candidates([
      candidate({ symbol: "SLOW", session_volume: 1_000_000, volume_60s: 50_000, acceleration_5m: 1 }),
      candidate({ symbol: "FAST", session_volume: 1_000_000, volume_60s: 90_000, acceleration_5m: 0 }),
    ]);
    expect(ranked.map((r) => r.symbol)).toEqual(["FAST", "SLOW"]);
  });
});

describe("Radar V2 adapter — capacity (Phase C/H)", () => {
  it("6. accepts the full 128-candidate promoted set", () => {
    const many = Array.from({ length: 128 }, (_, i) =>
      candidate({ symbol: `S${i}`, session_volume: 1_000_000 - i }),
    );
    const ranked = rankRadarV2Candidates(many);
    expect(ranked).toHaveLength(128);
    expect(ranked[0].symbol).toBe("S0");
    expect(ranked[127].symbol).toBe("S127");
  });

  it("accepts up to the 200 hard cap fetched by the source", () => {
    expect(RADAR_V2_CANDIDATE_CAP).toBe(200);
    const many = Array.from({ length: 200 }, (_, i) =>
      candidate({ symbol: `S${i}`, session_volume: 1_000_000 - i }),
    );
    expect(rankRadarV2Candidates(many)).toHaveLength(200);
  });

  it("8. Pro full board tab returns the whole ranked board; table tabs keep the 20-row cap", () => {
    expect(tabDisplayLimit("day_trade_radar")).toBe(RADAR_V2_CANDIDATE_CAP);
    expect(tabDisplayLimit("volume_spikes")).toBe(MAX_TAB_ROWS);

    const many = Array.from({ length: 128 }, (_, i) =>
      candidate({ symbol: `S${i}`, session_volume: 1_000_000 - i }),
    );
    const radar = buildRadarV2Decision({
      feedRows: [feed({ candidate_count: 128 })],
      candidateRows: many,
      tabId: "day_trade_radar",
      nowMs: NOW,
    });
    expect(radar.view!.rows).toHaveLength(128);

    const table = buildRadarV2Decision({
      feedRows: [feed({ candidate_count: 128 })],
      candidateRows: many,
      tabId: "volume_spikes",
      nowMs: NOW,
    });
    expect(table.view!.rows).toHaveLength(MAX_TAB_ROWS);
  });
});

describe("Radar V2 adapter — freshness & fallback (Phase G)", () => {
  it("2. one-generation valid candidates render", () => {
    const decision = buildRadarV2Decision({
      feedRows: [feed({ candidate_count: 2 })],
      candidateRows: [
        candidate({ symbol: "AAA", session_volume: 2_000_000 }),
        candidate({ symbol: "BBB", session_volume: 1_000_000 }),
      ],
      tabId: "day_trade_radar",
      nowMs: NOW,
    });
    expect(decision.source).toBe("radar-v2");
    expect(decision.view!.rows.map((r) => r.symbol)).toEqual(["AAA", "BBB"]);
  });

  it("3a. stale v2_synced_at falls back to the existing path (not shown as live)", () => {
    const decision = buildRadarV2Decision({
      feedRows: [feed({ v2_synced_at: "2026-09-03T12:40:00.000Z" })], // >20m old
      candidateRows: [candidate()],
      tabId: "day_trade_radar",
      nowMs: NOW,
    });
    expect(decision.source).toBe("fallback");
    expect(decision.reason).toBe("radar_v2_stale");
    expect(decision.view).toBeNull();
  });

  it("3b. legacy feed_stale=true does NOT gate V2 health when V2 fields are fresh", () => {
    // Production reality: the V1 publish_generation path can fail (feed_stale=true)
    // while the V2 pipeline is fully healthy. feed_stale is legacy V1 and must not
    // demote a fresh, advancing V2 generation.
    const decision = buildRadarV2Decision({
      feedRows: [feed({ feed_stale: true })],
      candidateRows: [candidate()],
      tabId: "day_trade_radar",
      nowMs: NOW,
    });
    expect(decision.source).toBe("radar-v2");
    expect(decision.reason).toBe("radar_v2_available");
    expect(decision.view!.status).toBe("available");
  });

  it("3c. missing feed / missing v2 generation falls back", () => {
    expect(
      buildRadarV2Decision({ feedRows: null, candidateRows: [candidate()], tabId: "day_trade_radar", nowMs: NOW }).source,
    ).toBe("fallback");
    expect(
      buildRadarV2Decision({
        feedRows: [feed({ v2_generation_id: null })],
        candidateRows: [candidate()],
        tabId: "day_trade_radar",
        nowMs: NOW,
      }).reason,
    ).toBe("no_v2_generation");
  });

  it("3d. checkpoint race (declared count but no current-generation rows) falls back", () => {
    const decision = buildRadarV2Decision({
      feedRows: [feed({ candidate_count: 128 })],
      candidateRows: [candidate({ generation_id: OTHER_GEN })],
      tabId: "day_trade_radar",
      nowMs: NOW,
    });
    expect(decision.source).toBe("fallback");
    expect(decision.reason).toBe("generation_race");
  });

  it("4 & 5. zero candidates produce an honest empty state with no fake rows", () => {
    const decision = buildRadarV2Decision({
      feedRows: [feed({ candidate_count: 0 })],
      candidateRows: [],
      tabId: "day_trade_radar",
      nowMs: NOW,
    });
    expect(decision.source).toBe("radar-v2");
    expect(decision.view!.status).toBe("empty");
    expect(decision.view!.rows).toEqual([]);
  });
});

describe("Radar V2 adapter — session integrity (Phase F / D12)", () => {
  it("11a. a closed feed session falls back and is never relabeled", () => {
    const decision = buildRadarV2Decision({
      feedRows: [feed({ session_kind: "closed" })],
      candidateRows: [candidate({ session_kind: "closed" })],
      tabId: "day_trade_radar",
      nowMs: NOW,
    });
    expect(decision.source).toBe("fallback");
    expect(decision.reason).toBe("session_not_active:closed");
    expect(decision.session).toBe("closed");
  });

  it("market and after-hours generations are accepted as Radar V2", () => {
    for (const session of ["market", "after-hours"] as const) {
      const decision = buildRadarV2Decision({
        feedRows: [feed({ session_kind: session })],
        candidateRows: [candidate({ session_kind: session, symbol: "SOXL" })],
        tabId: "day_trade_radar",
        nowMs: NOW,
      });
      expect(decision.source).toBe("radar-v2");
      expect(decision.session).toBe(session);
      expect(decision.view!.rows[0].symbol).toBe("SOXL");
      expect(decision.view!.rows[0].rvol).toBeNull();
      expect(decision.view!.rows[0].change_percent).toBeNull();
    }
  });

  it("11b. candidates whose session_kind differs from the feed are excluded, not mislabeled", () => {
    const decision = buildRadarV2Decision({
      feedRows: [feed({ candidate_count: 2 })],
      candidateRows: [
        candidate({ symbol: "PM", session_kind: "pre-market", session_volume: 2_000_000 }),
        candidate({ symbol: "RTH", session_kind: "market", session_volume: 9_000_000 }),
      ],
      tabId: "day_trade_radar",
      nowMs: NOW,
    });
    expect(decision.source).toBe("radar-v2");
    expect(decision.view!.rows.map((r) => r.symbol)).toEqual(["PM"]);
  });
});

describe("Radar V2 adapter — tab semantics (Phase E)", () => {
  it("15. per-tab qualification classifies rows on persisted fields only", () => {
    const noMove = candidate({ symbol: "NM", move_60s_pct: null, move_15s_pct: null });
    const noVol = candidate({ symbol: "NV", session_volume: 0 });

    expect(qualifyCandidateForTab(candidate(), "day_trade_radar")).toBe(true);
    expect(qualifyCandidateForTab(noMove, "day_trade_radar")).toBe(true);

    expect(qualifyCandidateForTab(candidate(), "gainers_losers")).toBe(true);
    expect(qualifyCandidateForTab(noMove, "gainers_losers")).toBe(false);

    expect(qualifyCandidateForTab(candidate(), "volume_spikes")).toBe(true);
    expect(qualifyCandidateForTab(noVol, "volume_spikes")).toBe(false);
    expect(qualifyCandidateForTab(candidate(), "unusual_volume")).toBe(true);
  });

  it("non-Radar-backed tabs (gappers / new_highs_lows) always fall back", () => {
    for (const tabId of ["gappers", "new_highs_lows"]) {
      const decision = buildRadarV2Decision({
        feedRows: [feed()],
        candidateRows: [candidate()],
        tabId,
        nowMs: NOW,
      });
      expect(decision.source).toBe("fallback");
      expect(decision.reason).toBe("tab_not_radar_backed");
    }
  });
});

describe("Radar V2 adapter — ranking metadata preserved through mapping (D5.3)", () => {
  it("8, 9, 10. signal_status, lifecycle→signal_tier, rolling volumes and acceleration survive without fabrication", () => {
    const row = mapCandidateToScreenerRow(
      candidate({
        signal_status: "EXPLOSIVE",
        lifecycle: "ACTIVE",
        volume_5s: 21_000,
        volume_15s: 41_000,
        volume_60s: 121_000,
        acceleration_5m: 0.75,
      }),
      "day_trade_radar",
    );
    expect(row.signal_status).toBe("EXPLOSIVE");
    expect(row.signal_tier).toBe("ACTIVE");
    expect(row.rolling_volume_5s).toBe(21_000);
    expect(row.rolling_volume_15s).toBe(41_000);
    expect(row.rolling_volume_60s).toBe(121_000);
    expect(row.acceleration_5m).toBe(0.75);
  });

  it("does not fabricate metadata when Radar fields are missing", () => {
    const row = mapCandidateToScreenerRow(
      candidate({ volume_5s: null, volume_15s: null, volume_60s: null, acceleration_5m: null }),
      "day_trade_radar",
    );
    expect(row.rolling_volume_5s).toBeNull();
    expect(row.rolling_volume_15s).toBeNull();
    expect(row.rolling_volume_60s).toBeNull();
    expect(row.acceleration_5m).toBeNull();
  });

  it("carries signal_status into the Day Trade Radar board signal label", () => {
    const rows = rankRadarV2Candidates([
      candidate({ symbol: "AAA", session_volume: 3_000_000, signal_status: "EXPLOSIVE", lifecycle: "ACTIVE" }),
    ]).map((c) => mapCandidateToScreenerRow(c, "day_trade_radar"));
    const board = rankRadarRows(rows, "available");
    expect(board[0].signal).toBe("EXPLOSIVE");
    expect(board[0].signal_tier).toBe("ACTIVE");
  });
});

describe("Radar V2 adapter — downstream contract (Phase H)", () => {
  it("14. mapped rows pass through the Radar board ranker (mobile/card contract intact)", () => {
    const rows = rankRadarV2Candidates([
      candidate({ symbol: "AAA", session_volume: 3_000_000 }),
      candidate({ symbol: "BBB", session_volume: 1_000_000 }),
    ]).map((c) => mapCandidateToScreenerRow(c, "day_trade_radar"));

    const board = rankRadarRows(rows, "available");
    expect(board.map((r) => r.symbol)).toEqual(["AAA", "BBB"]);
    expect(board[0].rank).toBe(1);
    expect(board[1].rank).toBe(2);
    // Free/Pro gating is driven purely by rank order, which volume-first preserves.
    expect(board[0].rvol).toBeNull();
  });
});

describe("Radar V2 adapter — handshake helpers (D11)", () => {
  it("accepts a matching current feed pair for the same generation", () => {
    const a = feed();
    const b = feed();
    expect(isSameAcceptedRadarV2Generation(a, b)).toBe(true);
    expect(currentRadarV2Feed([a])?.v2_generation_id).toBe(GEN);
  });

  it("rejects a generation or session or synced_at change", () => {
    expect(isSameAcceptedRadarV2Generation(feed(), feed({ v2_generation_id: OTHER_GEN }))).toBe(false);
    expect(isSameAcceptedRadarV2Generation(feed(), feed({ session_kind: "market" }))).toBe(false);
    expect(isSameAcceptedRadarV2Generation(feed(), feed({ v2_synced_at: "2026-09-03T13:13:00.000Z" }))).toBe(false);
  });
});

describe("Radar V2 adapter — V2 health gate (D8.1)", () => {
  // >20m before NOW (13:12:57Z) is stale under the 20-minute threshold.
  const STALE_TS = "2026-09-03T12:40:00.000Z";

  it("1. feed_stale=true + fresh v2_synced_at + fresh last_receive_at → Radar V2 authoritative", () => {
    const decision = buildRadarV2Decision({
      feedRows: [feed({ feed_stale: true, v2_synced_at: SYNCED, last_receive_at: SYNCED })],
      candidateRows: [candidate()],
      tabId: "day_trade_radar",
      nowMs: NOW,
    });
    expect(decision.source).toBe("radar-v2");
    expect(decision.view!.status).toBe("available");
  });

  it("2. feed_stale=true + stale v2_synced_at → fallback (stale pipeline)", () => {
    const decision = buildRadarV2Decision({
      feedRows: [feed({ feed_stale: true, v2_synced_at: STALE_TS })],
      candidateRows: [candidate()],
      tabId: "day_trade_radar",
      nowMs: NOW,
    });
    expect(decision.source).toBe("fallback");
    expect(decision.reason).toBe("radar_v2_stale");
  });

  it("3. feed_stale=false + stale v2_synced_at → fallback (stale pipeline)", () => {
    const decision = buildRadarV2Decision({
      feedRows: [feed({ feed_stale: false, v2_synced_at: STALE_TS })],
      candidateRows: [candidate()],
      tabId: "day_trade_radar",
      nowMs: NOW,
    });
    expect(decision.source).toBe("fallback");
    expect(decision.reason).toBe("radar_v2_stale");
  });

  it("4. fresh v2_synced_at + stale last_receive_at → fallback (ingest liveness)", () => {
    const decision = buildRadarV2Decision({
      feedRows: [feed({ v2_synced_at: SYNCED, last_receive_at: STALE_TS })],
      candidateRows: [candidate()],
      tabId: "day_trade_radar",
      nowMs: NOW,
    });
    expect(decision.source).toBe("fallback");
    expect(decision.reason).toBe("radar_v2_receive_stale");
  });

  it("5. fresh v2_synced_at + fresh last_receive_at → Radar V2 available", () => {
    const decision = buildRadarV2Decision({
      feedRows: [feed({ v2_synced_at: SYNCED, last_receive_at: SYNCED })],
      candidateRows: [candidate()],
      tabId: "day_trade_radar",
      nowMs: NOW,
    });
    expect(decision.source).toBe("radar-v2");
    expect(decision.reason).toBe("radar_v2_available");
  });

  it("6. missing last_receive_at is allowed when v2_synced_at itself is fresh", () => {
    // Documented safe behavior: v2_synced_at freshness already proves the current
    // V2 generation is fresh, so a null ingest marker does not demote it.
    const decision = buildRadarV2Decision({
      feedRows: [feed({ v2_synced_at: SYNCED, last_receive_at: null })],
      candidateRows: [candidate()],
      tabId: "day_trade_radar",
      nowMs: NOW,
    });
    expect(decision.source).toBe("radar-v2");
    expect(decision.view!.status).toBe("available");
  });

  it("6b. present-but-unparseable last_receive_at cannot prove liveness → fallback", () => {
    const decision = buildRadarV2Decision({
      feedRows: [feed({ v2_synced_at: SYNCED, last_receive_at: "not-a-timestamp" })],
      candidateRows: [candidate()],
      tabId: "day_trade_radar",
      nowMs: NOW,
    });
    expect(decision.source).toBe("fallback");
    expect(decision.reason).toBe("radar_v2_receive_stale");
  });

  it("7. generation mismatch still falls back even with feed_stale=true", () => {
    const decision = buildRadarV2Decision({
      feedRows: [feed({ feed_stale: true, candidate_count: 128 })],
      candidateRows: [candidate({ generation_id: OTHER_GEN })],
      tabId: "day_trade_radar",
      nowMs: NOW,
    });
    expect(decision.source).toBe("fallback");
    expect(decision.reason).toBe("generation_race");
  });

  it("8. session mismatch is still rejected even with feed_stale=true", () => {
    const decision = buildRadarV2Decision({
      feedRows: [feed({ feed_stale: true, candidate_count: 2 })],
      candidateRows: [
        candidate({ symbol: "PM", session_kind: "pre-market", session_volume: 2_000_000 }),
        candidate({ symbol: "RTH", session_kind: "market", session_volume: 9_000_000 }),
      ],
      tabId: "day_trade_radar",
      nowMs: NOW,
    });
    expect(decision.source).toBe("radar-v2");
    expect(decision.view!.rows.map((r) => r.symbol)).toEqual(["PM"]);
  });

  it("9. a healthy but empty V2 generation stays an honest empty even with feed_stale=true", () => {
    const decision = buildRadarV2Decision({
      feedRows: [feed({ feed_stale: true, candidate_count: 0 })],
      candidateRows: [],
      tabId: "day_trade_radar",
      nowMs: NOW,
    });
    expect(decision.source).toBe("radar-v2");
    expect(decision.view!.status).toBe("empty");
    expect(decision.view!.rows).toEqual([]);
  });
});
