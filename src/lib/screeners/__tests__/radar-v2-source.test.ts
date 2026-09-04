import { describe, expect, it, vi, beforeEach } from "vitest";
import { isRadarRowAccessible } from "@/features/day-trade-radar-v2/radar-metrics";
import { rankRadarRows } from "@/features/day-trade-radar-v2/radar-metrics";
import { mapCandidateToScreenerRow, type RadarV2CandidateRow, type RadarV2FeedStateRow } from "@/lib/screeners/radar-v2-adapter";
import {
  peekRadarV2LoadDiagnostic,
  resetRadarV2LoadDiagnostic,
} from "@/lib/screeners/radar-v2-diagnostics";
import type { RadarV2StoreReader } from "@/lib/screeners/radar-v2-source";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return { limit: () => Promise.resolve({ data: [], error: null }) };
                },
                limit: () => Promise.resolve({ data: [], error: null }),
                then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
              };
            },
          };
        },
      };
    },
  },
}));

import {
  loadRadarV2Decision,
  RADAR_V2_RETRY_DELAY_MS,
  RADAR_V2_STABLE_READ_ATTEMPTS,
} from "@/lib/screeners/radar-v2-source";

const GEN_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const GEN_B = "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const GEN_C = "cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const GEN_D = "dddddddd-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const NOW = Date.parse("2026-09-03T13:12:57.000Z");
const SYNCED = "2026-09-03T13:12:30.000Z";
const STALE = "2026-09-03T12:40:00.000Z";

function feedRow(overrides: Partial<RadarV2FeedStateRow> = {}): RadarV2FeedStateRow {
  return {
    state_key: "current",
    session_kind: "pre-market",
    sentinel_enabled: true,
    candidate_count: 1,
    v2_generation_id: GEN_A,
    v2_synced_at: SYNCED,
    last_receive_at: SYNCED,
    last_provider_event_at: "2026-09-03T12:57:30.000Z",
    feed_stale: false,
    updated_at: SYNCED,
    ...overrides,
  };
}

function candRow(
  overrides: Partial<RadarV2CandidateRow> = {},
): RadarV2CandidateRow {
  return {
    symbol: "AAA",
    generation_id: GEN_A,
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

function ok<T>(rows: T[]) {
  return { rows, error: null as unknown };
}

function queuedReader(opts: {
  feeds: Array<{ rows: RadarV2FeedStateRow[] | null; error: unknown }>;
  cands: Array<{ rows: RadarV2CandidateRow[] | null; error: unknown }>;
}): RadarV2StoreReader & { feedCalls: () => number; candGens: () => string[] } {
  let fi = 0;
  let ci = 0;
  const candGens: string[] = [];
  return {
    feedCalls: () => fi,
    candGens: () => candGens,
    async readCurrentFeed() {
      const i = fi;
      fi += 1;
      if (i >= opts.feeds.length) {
        return opts.feeds[opts.feeds.length - 1];
      }
      return opts.feeds[i];
    },
    async readCandidatesByGeneration(generationId: string) {
      candGens.push(generationId);
      const i = ci;
      ci += 1;
      if (i >= opts.cands.length) {
        return opts.cands[opts.cands.length - 1];
      }
      return opts.cands[i];
    },
  };
}

const noSleep = async () => {};

beforeEach(() => {
  resetRadarV2LoadDiagnostic();
});

describe("Radar V2 source — stable-generation handshake (D11)", () => {
  it("does not use Promise.all for feed + candidate reads", () => {
    const src = readFileSync(resolve("src/lib/screeners/radar-v2-source.ts"), "utf8");
    expect(src).not.toMatch(/Promise\.all\s*\(/);
  });

  it("1. feed generation A + candidates A + feed A → V2 accepted", async () => {
    const reader = queuedReader({
      feeds: [ok([feedRow()]), ok([feedRow()])],
      cands: [ok([candRow()])],
    });
    const decision = await loadRadarV2Decision("day_trade_radar", NOW, { reader, sleep: noSleep });
    expect(decision.source).toBe("radar-v2");
    expect(decision.reason).toBe("radar_v2_available");
    expect(decision.view!.rows[0].symbol).toBe("AAA");
    expect(reader.feedCalls()).toBe(2);
    expect(reader.candGens()).toEqual([GEN_A]);
    expect(peekRadarV2LoadDiagnostic()?.reason).toBe("radar_v2_available");
    expect(peekRadarV2LoadDiagnostic()?.attempts).toBe(1);
  });

  it("2. first feed A, candidates lookup A, second feed B → retry, not fallback", async () => {
    const sleep = vi.fn(async () => {});
    const reader = queuedReader({
      feeds: [
        ok([feedRow({ v2_generation_id: GEN_A })]),
        ok([feedRow({ v2_generation_id: GEN_B })]),
        ok([feedRow({ v2_generation_id: GEN_B })]),
        ok([feedRow({ v2_generation_id: GEN_B })]),
      ],
      cands: [
        ok([candRow({ generation_id: GEN_A })]),
        ok([candRow({ symbol: "BAOS", generation_id: GEN_B, session_volume: 2_000_000 })]),
      ],
    });
    const decision = await loadRadarV2Decision("day_trade_radar", NOW, { reader, sleep });
    expect(decision.source).toBe("radar-v2");
    expect(decision.reason).toBe("radar_v2_available");
    expect(decision.view!.rows[0].symbol).toBe("BAOS");
    expect(sleep).toHaveBeenCalledWith(RADAR_V2_RETRY_DELAY_MS);
    expect(reader.candGens()).toEqual([GEN_A, GEN_B]);
    expect(peekRadarV2LoadDiagnostic()?.attempts).toBe(2);
    expect(peekRadarV2LoadDiagnostic()?.reason).not.toBe("generation_race");
  });

  it("3. attempt 2 reads stable B → V2 accepted", async () => {
    const reader = queuedReader({
      feeds: [
        ok([feedRow({ v2_generation_id: GEN_A })]),
        ok([feedRow({ v2_generation_id: GEN_B })]),
        ok([feedRow({ v2_generation_id: GEN_B })]),
        ok([feedRow({ v2_generation_id: GEN_B })]),
      ],
      cands: [
        ok([candRow({ generation_id: GEN_A })]),
        ok([candRow({ symbol: "SOXL", generation_id: GEN_B })]),
      ],
    });
    const decision = await loadRadarV2Decision("day_trade_radar", NOW, { reader, sleep: noSleep });
    expect(decision.source).toBe("radar-v2");
    expect(decision.view!.rows[0].symbol).toBe("SOXL");
    expect(decision.reason).toBe("radar_v2_available");
  });

  it("4. generation keeps changing for all attempts → bounded fallback with retry-exhausted", async () => {
    const sleep = vi.fn(async () => {});
    const reader = queuedReader({
      feeds: [
        ok([feedRow({ v2_generation_id: GEN_A })]),
        ok([feedRow({ v2_generation_id: GEN_B })]),
        ok([feedRow({ v2_generation_id: GEN_B })]),
        ok([feedRow({ v2_generation_id: GEN_C })]),
        ok([feedRow({ v2_generation_id: GEN_C })]),
        ok([feedRow({ v2_generation_id: GEN_D })]),
      ],
      cands: [
        ok([candRow({ generation_id: GEN_A })]),
        ok([candRow({ generation_id: GEN_B })]),
        ok([candRow({ generation_id: GEN_C })]),
      ],
    });
    const decision = await loadRadarV2Decision("day_trade_radar", NOW, { reader, sleep });
    expect(decision.source).toBe("fallback");
    expect(decision.reason).toBe("radar_v2_retry_exhausted");
    expect(decision.view).toBeNull();
    expect(sleep).toHaveBeenCalledTimes(RADAR_V2_STABLE_READ_ATTEMPTS - 1);
    expect(reader.candGens()).toHaveLength(RADAR_V2_STABLE_READ_ATTEMPTS);
    const diag = peekRadarV2LoadDiagnostic();
    expect(diag?.reason).toBe("radar_v2_retry_exhausted");
    expect(diag?.lastAttemptReason).toBe("generation_race");
    expect(diag?.attempts).toBe(3);
  });

  it("5. fresh pre-market generation with 128 candidates never falls back solely due to generation race", async () => {
    const many = Array.from({ length: 128 }, (_, i) =>
      candRow({
        symbol: `S${i}`,
        generation_id: GEN_B,
        session_volume: 1_000_000 - i,
      }),
    );
    const reader = queuedReader({
      feeds: [
        ok([feedRow({ v2_generation_id: GEN_A, candidate_count: 128 })]),
        ok([feedRow({ v2_generation_id: GEN_B, candidate_count: 128 })]),
        ok([feedRow({ v2_generation_id: GEN_B, candidate_count: 128 })]),
        ok([feedRow({ v2_generation_id: GEN_B, candidate_count: 128 })]),
      ],
      cands: [
        ok([candRow({ generation_id: GEN_A })]),
        ok(many),
      ],
    });
    const decision = await loadRadarV2Decision("day_trade_radar", NOW, { reader, sleep: noSleep });
    expect(decision.source).toBe("radar-v2");
    expect(decision.reason).toBe("radar_v2_available");
    expect(decision.view!.rows).toHaveLength(128);
    expect(decision.reason).not.toBe("generation_race");
    expect(peekRadarV2LoadDiagnostic()?.reason).not.toBe("generation_race");
  });

  it("retries adapter generation_race (declared count, no matching rows) instead of falling back immediately", async () => {
    const sleep = vi.fn(async () => {});
    const reader = queuedReader({
      feeds: [
        ok([feedRow({ candidate_count: 128 })]),
        ok([feedRow({ candidate_count: 128 })]),
        ok([feedRow({ candidate_count: 128 })]),
        ok([feedRow({ candidate_count: 128 })]),
      ],
      cands: [
        ok([]),
        ok([candRow({ symbol: "IMRN" })]),
      ],
    });
    const decision = await loadRadarV2Decision("day_trade_radar", NOW, { reader, sleep });
    expect(decision.source).toBe("radar-v2");
    expect(decision.view!.rows[0].symbol).toBe("IMRN");
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(peekRadarV2LoadDiagnostic()?.attempts).toBe(2);
  });

  it("6. healthy V2 empty → honest Radar V2 empty", async () => {
    const reader = queuedReader({
      feeds: [
        ok([feedRow({ candidate_count: 0 })]),
        ok([feedRow({ candidate_count: 0 })]),
      ],
      cands: [ok([])],
    });
    const decision = await loadRadarV2Decision("day_trade_radar", NOW, { reader, sleep: noSleep });
    expect(decision.source).toBe("radar-v2");
    expect(decision.reason).toBe("radar_v2_empty");
    expect(decision.view!.status).toBe("empty");
    expect(decision.view!.rows).toEqual([]);
  });

  it("7. stale V2 → fallback without retry", async () => {
    const sleep = vi.fn(async () => {});
    const reader = queuedReader({
      feeds: [
        ok([feedRow({ v2_synced_at: STALE, last_receive_at: STALE })]),
        ok([feedRow({ v2_synced_at: STALE, last_receive_at: STALE })]),
      ],
      cands: [ok([candRow()])],
    });
    const decision = await loadRadarV2Decision("day_trade_radar", NOW, { reader, sleep });
    expect(decision.source).toBe("fallback");
    expect(decision.reason).toBe("radar_v2_stale");
    expect(sleep).not.toHaveBeenCalled();
    expect(peekRadarV2LoadDiagnostic()?.attempts).toBe(1);
  });

  it("8. closed session → fallback without retry", async () => {
    const sleep = vi.fn(async () => {});
    const reader = queuedReader({
      feeds: [
        ok([feedRow({ session_kind: "closed" })]),
        ok([feedRow({ session_kind: "closed" })]),
      ],
      cands: [ok([candRow({ session_kind: "closed" })])],
    });
    const decision = await loadRadarV2Decision("day_trade_radar", NOW, { reader, sleep });
    expect(decision.source).toBe("fallback");
    expect(decision.reason).toBe("session_not_active:closed");
    expect(sleep).not.toHaveBeenCalled();
  });

  it("14. stable-generation handshake still works in market session", async () => {
    const reader = queuedReader({
      feeds: [
        ok([feedRow({ session_kind: "market", v2_generation_id: GEN_A })]),
        ok([feedRow({ session_kind: "market", v2_generation_id: GEN_A })]),
      ],
      cands: [ok([candRow({ session_kind: "market", symbol: "SOXL" })])],
    });
    const decision = await loadRadarV2Decision("day_trade_radar", NOW, { reader, sleep: noSleep });
    expect(decision.source).toBe("radar-v2");
    expect(decision.session).toBe("market");
    expect(decision.view!.rows[0].symbol).toBe("SOXL");
  });

  it("15. stable-generation handshake still works in after-hours session", async () => {
    const reader = queuedReader({
      feeds: [
        ok([feedRow({ session_kind: "after-hours", v2_generation_id: GEN_A })]),
        ok([feedRow({ session_kind: "after-hours", v2_generation_id: GEN_A })]),
      ],
      cands: [ok([candRow({ session_kind: "after-hours", symbol: "BTAI" })])],
    });
    const decision = await loadRadarV2Decision("day_trade_radar", NOW, { reader, sleep: noSleep });
    expect(decision.source).toBe("radar-v2");
    expect(decision.session).toBe("after-hours");
    expect(decision.view!.rows[0].symbol).toBe("BTAI");
  });

  it("11. PM → market generation transition retries then adopts market without fallback", async () => {
    const sleep = vi.fn(async () => {});
    const reader = queuedReader({
      feeds: [
        ok([feedRow({ session_kind: "pre-market", v2_generation_id: GEN_A })]),
        ok([feedRow({ session_kind: "market", v2_generation_id: GEN_B })]),
        ok([feedRow({ session_kind: "market", v2_generation_id: GEN_B })]),
        ok([feedRow({ session_kind: "market", v2_generation_id: GEN_B })]),
      ],
      cands: [
        ok([candRow({ generation_id: GEN_A, session_kind: "pre-market" })]),
        ok([candRow({ symbol: "SNXX", generation_id: GEN_B, session_kind: "market" })]),
      ],
    });
    const decision = await loadRadarV2Decision("day_trade_radar", NOW, { reader, sleep });
    expect(decision.source).toBe("radar-v2");
    expect(decision.session).toBe("market");
    expect(decision.view!.rows[0].symbol).toBe("SNXX");
    expect(sleep).toHaveBeenCalled();
  });

  it("12. market → after-hours generation transition retries then adopts AH", async () => {
    const sleep = vi.fn(async () => {});
    const reader = queuedReader({
      feeds: [
        ok([feedRow({ session_kind: "market", v2_generation_id: GEN_A })]),
        ok([feedRow({ session_kind: "after-hours", v2_generation_id: GEN_B })]),
        ok([feedRow({ session_kind: "after-hours", v2_generation_id: GEN_B })]),
        ok([feedRow({ session_kind: "after-hours", v2_generation_id: GEN_B })]),
      ],
      cands: [
        ok([candRow({ generation_id: GEN_A, session_kind: "market" })]),
        ok([candRow({ symbol: "BAOS", generation_id: GEN_B, session_kind: "after-hours" })]),
      ],
    });
    const decision = await loadRadarV2Decision("day_trade_radar", NOW, { reader, sleep });
    expect(decision.source).toBe("radar-v2");
    expect(decision.session).toBe("after-hours");
    expect(decision.view!.rows[0].symbol).toBe("BAOS");
  });

  it("falls back on a reader error without retrying as a generation race", async () => {
    const reader = queuedReader({
      feeds: [{ rows: null, error: { message: "boom" } }],
      cands: [ok([])],
    });
    const decision = await loadRadarV2Decision("day_trade_radar", NOW, { reader, sleep: noSleep });
    expect(decision.source).toBe("fallback");
    expect(decision.reason).toBe("radar_v2_fetch_error");
    expect(peekRadarV2LoadDiagnostic()?.reason).toBe("radar_v2_fetch_error");
  });

  it("short-circuits non-Radar-backed tabs to fallback", async () => {
    const decision = await loadRadarV2Decision("gappers", NOW, { sleep: noSleep });
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

    expect(isRadarRowAccessible(board[0].rank, false, 2)).toBe(true);
    expect(isRadarRowAccessible(board[1].rank, false, 2)).toBe(true);
    expect(isRadarRowAccessible(board[2].rank, false, 2)).toBe(false);
    expect(board.every((r) => isRadarRowAccessible(r.rank, true, 2))).toBe(true);
  });
});
