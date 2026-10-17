import { describe, expect, it } from "vitest";
import {
  classifyPmPrimaryEventFreshness,
  resolvePmApplicableTradingDate,
  resolvePmRadarBoardContext,
} from "@/lib/inbox/pm-session-evidence";
import { buildPmSessionSummaryRows } from "@/lib/inbox/pm-session-summary";
import { dedupePmSessionSummaryRows } from "@/lib/inbox/pm-session-summary-dedupe";
import type { PmRadarBoardContext } from "@/lib/inbox/pm-session-summary";

const APPLICABLE = "2026-03-15";
const NOW_LATE = Date.parse("2026-03-15T20:30:00.000Z"); // 4:30 PM ET

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
    primary_scanner_event_at: "2026-03-15T20:00:00.000Z",
    radar_trading_date: APPLICABLE,
    rvol_5m: 3.2,
    vol_velocity: 50_000,
    hod_distance_percent: 1.1,
    ...over,
  };
}

describe("Batch 17 — PM session intelligence", () => {
  it("classifies valid late-session observation after 3 PM ET", () => {
    expect(
      classifyPmPrimaryEventFreshness({
        eventType: "RUNNING_UP",
        eventAtUtc: "2026-03-15T20:00:00.000Z",
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
        eventAtUtc: "2026-03-15T14:30:00.000Z",
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
        eventAtUtc: "2026-03-16T14:30:00.000Z",
        radarTradingDate: APPLICABLE,
        applicableTradingDate: APPLICABLE,
        nowMs: NOW_LATE,
      }),
    ).toBeNull();
    expect(
      classifyPmPrimaryEventFreshness({
        eventType: "HOD_BREAK",
        eventAtUtc: "2026-03-15T23:00:00.000Z",
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
        lastSuccessfulRefreshAt: "2026-03-15T19:00:00.000Z",
        preserved: true,
        preserveReason: "radar_v2_fetch_threw",
        previousGenerationId: "old-gen",
        preservedSyncedAt: "2026-03-15T18:00:00.000Z",
      },
      decision: {
        source: "radar-v2",
        reason: "ok",
        session: "market",
        view: {
          status: "available",
          rows: [radarRow({}) as never],
          synced_at: "2026-03-15T19:00:00.000Z",
          provider_as_of_max: null,
        },
      },
    });
    expect(ctx.boardState).toBe("preserved_snapshot");
    expect(ctx.preservedPriorGeneration).toBe(true);
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

  it("resolvePmApplicableTradingDate respects surveillance roll before 4 AM ET", () => {
    const early = Date.parse("2026-03-16T07:00:00.000Z"); // 3 AM ET on 3/16
    const resolved = resolvePmApplicableTradingDate(early);
    expect(resolved.applicableTradingDate).toBe("2026-03-15");
  });

  it("dedupePmSessionSummaryRows prefers late_confirmed over historical for same symbol", () => {
    const out = dedupePmSessionSummaryRows([
      {
        symbol: "X",
        rank: 2,
        volume: 1,
        primaryEvent: "HOD_BREAK",
        primaryEventLabel: "HOD",
        observationTimeEt: "9:00 AM",
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
        observationTimeEt: "3:45 PM",
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
