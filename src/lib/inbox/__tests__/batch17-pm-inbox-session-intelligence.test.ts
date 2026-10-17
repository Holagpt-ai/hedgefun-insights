import { describe, expect, it } from "vitest";
import {
  classifyPmPrimaryEventFreshness,
  resolvePmApplicableTradingDate,
  resolvePmRadarBoardContext,
} from "@/lib/inbox/pm-session-evidence";
import { buildPmSessionSummaryRows } from "@/lib/inbox/pm-session-summary";
import { dedupePmSessionSummaryRows } from "@/lib/inbox/pm-session-summary-dedupe";
import type { PmRadarBoardContext } from "@/lib/inbox/pm-session-summary";

/** Monday — genuine US equity trading day (not Sunday 2026-03-15). */
const APPLICABLE = "2026-03-16";
const NOW_LATE = Date.parse("2026-03-16T20:30:00.000Z"); // 4:30 PM ET

function board(over: Partial<PmRadarBoardContext> = {}): PmRadarBoardContext {
  return {
    nowMs: NOW_LATE,
    applicableTradingDate: APPLICABLE,
    consumerEtDate: APPLICABLE,
    isTradingDay: true,
    boardState: "ready",
    statusMessage: null,
    sessionKind: "market",
    generationId: "gen-1",
    preservedPriorGeneration: false,
    ...over,
  };
}

function radarRow(over: Record<string, unknown>) {
  return {
    symbol: "AAA",
    rank: 1,
    volume: 2_000_000,
    primary_scanner_event: "RUNNING_UP",
    primary_scanner_event_at: "2026-03-16T20:00:00.000Z",
    radar_trading_date: APPLICABLE,
    sync_run_id: "gen-1",
    rvol_5m: 3.2,
    vol_velocity: 50_000,
    hod_distance_percent: 1.1,
    ...over,
  };
}

function freshObserve() {
  return {
    lastSuccessfulRefreshAt: "2026-03-16T19:00:00.000Z",
    preserved: false,
    preserveReason: null,
    previousGenerationId: null,
    preservedSyncedAt: null,
  };
}

function radarDecision(
  view: {
    status: "available" | "stale" | "empty";
    rows: ReturnType<typeof radarRow>[];
    synced_at?: string | null;
    closedSnapshot?: boolean;
  },
) {
  return {
    source: "radar-v2" as const,
    reason: "radar_v2_available",
    session: "market",
    view: {
      status: view.status,
      rows: view.rows as never[],
      synced_at: view.synced_at ?? "2026-03-16T19:00:00.000Z",
      provider_as_of_max: null,
      closedSnapshot: view.closedSnapshot,
    },
  };
}

describe("Batch 17 — PM session intelligence", () => {
  it("classifies valid late-session observation after 3 PM ET", () => {
    expect(
      classifyPmPrimaryEventFreshness({
        eventType: "RUNNING_UP",
        eventAtUtc: "2026-03-16T20:00:00.000Z",
        radarTradingDate: APPLICABLE,
        applicableTradingDate: APPLICABLE,
        nowMs: NOW_LATE,
      }),
    ).toBe("late_confirmed");
  });

  it("marks earlier morning HOD as historical on the same session", () => {
    expect(
      classifyPmPrimaryEventFreshness({
        eventType: "HOD_BREAK",
        eventAtUtc: "2026-03-16T14:30:00.000Z",
        radarTradingDate: APPLICABLE,
        applicableTradingDate: APPLICABLE,
        nowMs: NOW_LATE,
      }),
    ).toBe("historical_same_session");
  });

  it("does not treat morning LATE_DAY_ACCELERATION as late confirmed", () => {
    expect(
      classifyPmPrimaryEventFreshness({
        eventType: "LATE_DAY_ACCELERATION",
        eventAtUtc: "2026-03-16T14:00:00.000Z",
        radarTradingDate: APPLICABLE,
        applicableTradingDate: APPLICABLE,
        nowMs: NOW_LATE,
      }),
    ).toBe("historical_same_session");
  });

  it("rejects future and cross-session timestamps", () => {
    expect(
      classifyPmPrimaryEventFreshness({
        eventType: "HOD_BREAK",
        eventAtUtc: "2026-03-17T14:30:00.000Z",
        radarTradingDate: APPLICABLE,
        applicableTradingDate: APPLICABLE,
        nowMs: NOW_LATE,
      }),
    ).toBeNull();
    expect(
      classifyPmPrimaryEventFreshness({
        eventType: "HOD_BREAK",
        eventAtUtc: "2026-03-16T23:00:00.000Z",
        radarTradingDate: APPLICABLE,
        applicableTradingDate: APPLICABLE,
        nowMs: NOW_LATE,
      }),
    ).toBeNull();
  });

  it("keeps missing timestamp as unverified, not late confirmed", () => {
    expect(
      classifyPmPrimaryEventFreshness({
        eventType: "VWAP_RECLAIM",
        eventAtUtc: null,
        radarTradingDate: APPLICABLE,
        applicableTradingDate: APPLICABLE,
        nowMs: NOW_LATE,
      }),
    ).toBe("unverified");
  });

  it("dedupes repeated symbols and preserves volume-first rank order", () => {
    const rows = buildPmSessionSummaryRows(
      [
        radarRow({ symbol: "AAA", rank: 1, volume: 5_000_000 }),
        radarRow({
          symbol: "AAA",
          rank: 2,
          volume: 4_000_000,
          primary_scanner_event: "HOD_BREAK",
        }),
        radarRow({ symbol: "BBB", rank: 3, volume: 3_000_000 }),
      ],
      board(),
      8,
    );
    expect(rows.map((r) => r.symbol)).toEqual(["AAA", "BBB"]);
    expect(rows[0]?.rank).toBe(1);
  });

  it("volume-first ordering after dedupe keeps higher-volume symbol ahead", () => {
    const built = buildPmSessionSummaryRows(
      [
        radarRow({ symbol: "LOW", rank: 2, volume: 100_000 }),
        radarRow({ symbol: "HIGH", rank: 1, volume: 8_000_000 }),
      ],
      board(),
      8,
    );
    expect(built.map((r) => r.symbol)).toEqual(["HIGH", "LOW"]);
  });

  it("resolvePmRadarBoardContext flags preserved prior generation", () => {
    const ctx = resolvePmRadarBoardContext({
      loading: false,
      nowMs: NOW_LATE,
      observe: {
        lastSuccessfulRefreshAt: "2026-03-16T19:00:00.000Z",
        preserved: true,
        preserveReason: "radar_v2_fetch_threw",
        previousGenerationId: "old-gen",
        preservedSyncedAt: "2026-03-16T18:00:00.000Z",
      },
      decision: radarDecision({ status: "available", rows: [radarRow({})] }),
    });
    expect(ctx.boardState).toBe("preserved_snapshot");
    expect(ctx.preservedPriorGeneration).toBe(true);
  });

  it("stale Radar view is preserved snapshot, not ready", () => {
    const ctx = resolvePmRadarBoardContext({
      loading: false,
      nowMs: NOW_LATE,
      observe: freshObserve(),
      decision: radarDecision({ status: "stale", rows: [radarRow({})] }),
    });
    expect(ctx.boardState).toBe("preserved_snapshot");
    expect(ctx.preservedPriorGeneration).toBe(true);
  });

  it("closed snapshot is preserved, not ready", () => {
    const ctx = resolvePmRadarBoardContext({
      loading: false,
      nowMs: NOW_LATE,
      observe: freshObserve(),
      decision: radarDecision({
        status: "available",
        rows: [radarRow({})],
        closedSnapshot: true,
      }),
    });
    expect(ctx.boardState).toBe("preserved_snapshot");
  });

  it("verified available board with matching session is ready", () => {
    const ctx = resolvePmRadarBoardContext({
      loading: false,
      nowMs: NOW_LATE,
      observe: freshObserve(),
      decision: radarDecision({ status: "available", rows: [radarRow({})] }),
    });
    expect(ctx.boardState).toBe("ready");
    expect(ctx.preservedPriorGeneration).toBe(false);
  });

  it("Sunday consumer date never yields ready board for current highlights", () => {
    const sundayMs = Date.parse("2026-03-15T20:30:00.000Z");
    const ctx = resolvePmRadarBoardContext({
      loading: false,
      nowMs: sundayMs,
      observe: freshObserve(),
      decision: radarDecision({
        status: "available",
        rows: [radarRow({ radar_trading_date: "2026-03-13" })],
      }),
    });
    expect(ctx.isTradingDay).toBe(false);
    expect(ctx.boardState).toBe("preserved_snapshot");
  });

  it("normalizes applicable trading date on weekend to previous session", () => {
    const sundayMs = Date.parse("2026-03-15T20:30:00.000Z");
    const resolved = resolvePmApplicableTradingDate(sundayMs);
    expect(resolved.applicableTradingDate).toBe("2026-03-13");
    expect(resolved.isTradingDay).toBe(false);
  });

  it("normalizes New Year's Day to previous trading session", () => {
    const holidayMs = Date.parse("2026-01-01T17:00:00.000Z");
    const resolved = resolvePmApplicableTradingDate(holidayMs);
    expect(resolved.isTradingDay).toBe(false);
    expect(resolved.applicableTradingDate).toBe("2025-12-31");
  });

  it("session rollover before 4 AM ET uses exchange calendar, not raw surveillance Sunday", () => {
    const early = Date.parse("2026-03-16T07:00:00.000Z"); // 3 AM ET Tuesday
    const resolved = resolvePmApplicableTradingDate(early);
    expect(resolved.applicableTradingDate).toBe("2026-03-13");
  });

  it("rejects malformed primary event timestamps in summary build", () => {
    const rows = buildPmSessionSummaryRows(
      [
        radarRow({
          primary_scanner_event_at: "not-a-date",
        }),
      ],
      board(),
    );
    expect(rows).toHaveLength(0);
  });

  it("does not build highlights when board is unavailable", () => {
    const rows = buildPmSessionSummaryRows([radarRow({})], board({ boardState: "unavailable" }));
    expect(rows).toHaveLength(0);
  });

  it("uses early-close regular session boundary for late classification", () => {
    const earlyCloseDate = "2026-11-27";
    expect(
      classifyPmPrimaryEventFreshness({
        eventType: "RUNNING_UP",
        eventAtUtc: "2026-11-27T18:30:00.000Z",
        radarTradingDate: earlyCloseDate,
        applicableTradingDate: earlyCloseDate,
        nowMs: Date.parse("2026-11-27T19:00:00.000Z"),
      }),
    ).toBe("late_confirmed");
  });

  it("dedupePmSessionSummaryRows prefers late_confirmed over historical for same symbol", () => {
    const out = dedupePmSessionSummaryRows([
      {
        symbol: "X",
        rank: 2,
        volume: 1,
        primaryEvent: "HOD_BREAK",
        primaryEventLabel: "HOD",
        observationTimeEt: "9:00 AM ET",
        sourceTradingSession: APPLICABLE,
        freshness: "historical_same_session",
        freshnessLabel: "Earlier today · historical",
        rvol5m: null,
        volumeVelocity: null,
        distanceFromHodPct: null,
        participationNote: null,
      },
      {
        symbol: "X",
        rank: 5,
        volume: 1,
        primaryEvent: "LATE_DAY_ACCELERATION",
        primaryEventLabel: "Late Day",
        observationTimeEt: "3:45 PM ET",
        sourceTradingSession: APPLICABLE,
        freshness: "late_confirmed",
        freshnessLabel: "Late-session recorded",
        rvol5m: null,
        volumeVelocity: null,
        distanceFromHodPct: null,
        participationNote: null,
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.freshness).toBe("late_confirmed");
  });
});
