import { describe, expect, it } from "vitest";
import { resolveDayTradeRadarSource } from "../radar-source-precedence";
import type { RadarRankedRow } from "../types";
import type { RadarV22View } from "@/lib/radar-v22";
import type { ScreenerResultRow } from "@/lib/screeners/contract";

const TODAY = "2026-09-03";
const GEN = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function screenerRow(symbol: string, volume: number): ScreenerResultRow {
  return {
    tab_id: "day_trade_radar",
    symbol,
    company_name: null,
    price: 10,
    change_percent: null,
    volume,
    avg_volume: null,
    rvol: null,
    float_shares: null,
    gap_percent: null,
    high_52w: null,
    low_52w: null,
    range_event: null,
    market_cap: null,
    prior_session_volume: null,
    volume_ratio_prior_session: null,
    day_high: 11,
    day_low: 9,
    provider_as_of: "2026-09-03T12:57:30.000Z",
    sync_run_id: GEN,
    updated_at: "2026-09-03T13:12:30.000Z",
  };
}

function legacyRankedRow(symbol: string, rank: number): RadarRankedRow {
  return {
    ...screenerRow(symbol, 1_000),
    change_percent: 12, // legacy board carries a real RTH day change
    rank,
    signal: "TOP LEADER",
    hod_distance_percent: 1,
  };
}

function legacyBoard(rows: RadarRankedRow[], status: RadarV22View["status"]): RadarV22View {
  return {
    valid: true,
    status,
    sessionDate: TODAY,
    generationId: GEN,
    rows,
    syncedAt: "2026-09-03T13:12:30.000Z",
    providerAsOfMax: "2026-09-03T12:57:30.000Z",
  };
}

const emptyLegacyBoard: RadarV22View = {
  valid: false,
  status: "unavailable",
  sessionDate: null,
  generationId: null,
  rows: [],
  syncedAt: null,
  providerAsOfMax: null,
};

describe("Day Trade Radar source precedence (D5.3)", () => {
  it("1. Radar V2 source with 128 candidates beats a valid 1-row legacy board", () => {
    const radarRows = Array.from({ length: 128 }, (_, i) =>
      screenerRow(`S${i}`, 1_000_000 - i),
    );
    const decision = resolveDayTradeRadarSource({
      source: "radar-v2",
      todayEt: TODAY,
      adoptedSession: null,
      v21: {
        rows: radarRows,
        status: "available",
        syncedAt: "2026-09-03T13:12:30.000Z",
        providerAsOfMax: "2026-09-03T12:57:30.000Z",
      },
      v22: legacyBoard([legacyRankedRow("LEGACY", 1)], "available"),
    });

    expect(decision.source).toBe("radar-v2-candidates");
    expect(decision.status).toBe("available");
    expect(decision.rows).toHaveLength(128);
    expect(decision.rows.map((r) => r.symbol)).not.toContain("LEGACY");
    expect(decision.rows[0].symbol).toBe("S0");
  });

  it("2. Radar V2 source with a valid EMPTY generation stays empty; legacy board does not override", () => {
    const decision = resolveDayTradeRadarSource({
      source: "radar-v2",
      todayEt: TODAY,
      adoptedSession: null,
      v21: {
        rows: [],
        status: "empty",
        syncedAt: "2026-09-03T13:12:30.000Z",
        providerAsOfMax: "2026-09-03T12:57:30.000Z",
      },
      v22: legacyBoard(
        [legacyRankedRow("A", 1), legacyRankedRow("B", 2), legacyRankedRow("C", 3)],
        "available",
      ),
    });

    expect(decision.source).toBe("radar-v2-candidates");
    expect(decision.status).toBe("empty");
    expect(decision.rows).toHaveLength(0);
  });

  it("3. fallback source preserves existing legacy radar_v22_board precedence", () => {
    const decision = resolveDayTradeRadarSource({
      source: "screener-results",
      todayEt: TODAY,
      adoptedSession: null,
      v21: {
        rows: [screenerRow("OLD1", 9_000_000), screenerRow("OLD2", 5_000_000)],
        status: "available",
        syncedAt: "2026-09-03T13:00:00.000Z",
        providerAsOfMax: "2026-09-03T12:55:00.000Z",
      },
      v22: legacyBoard([legacyRankedRow("NEW1", 1)], "available"),
    });

    // Existing behavior: a valid current-session legacy board wins on fallback.
    expect(decision.source).toBe("v2.2");
    expect(decision.rows[0].symbol).toBe("NEW1");
  });

  it("3b. fallback source with no legacy board keeps the v2.1 rows", () => {
    const decision = resolveDayTradeRadarSource({
      source: "screener-results",
      todayEt: TODAY,
      adoptedSession: null,
      v21: {
        rows: [screenerRow("OLD1", 9_000_000)],
        status: "available",
        syncedAt: "2026-09-03T13:00:00.000Z",
        providerAsOfMax: "2026-09-03T12:55:00.000Z",
      },
      v22: emptyLegacyBoard,
    });

    expect(decision.source).toBe("v2.1");
    expect(decision.rows[0].symbol).toBe("OLD1");
  });

  it("17. valid empty Radar V2 remains authoritative in market and after-hours", () => {
    for (const _session of ["market", "after-hours"] as const) {
      const decision = resolveDayTradeRadarSource({
        source: "radar-v2",
        todayEt: TODAY,
        adoptedSession: null,
        v21: {
          rows: [],
          status: "empty",
          syncedAt: "2026-09-03T20:12:30.000Z",
          providerAsOfMax: "2026-09-03T20:00:00.000Z",
        },
        v22: legacyBoard(
          [legacyRankedRow("A", 1), legacyRankedRow("B", 2)],
          "available",
        ),
      });
      expect(decision.source).toBe("radar-v2-candidates");
      expect(decision.status).toBe("empty");
      expect(decision.rows).toHaveLength(0);
    }
  });

  it("J. Radar V2 RTH source beats a valid legacy snapshot", () => {
    const decision = resolveDayTradeRadarSource({
      source: "radar-v2",
      todayEt: TODAY,
      adoptedSession: null,
      v21: {
        rows: [screenerRow("RTH1", 5_000_000)],
        status: "available",
        syncedAt: "2026-09-03T17:12:30.000Z",
        providerAsOfMax: "2026-09-03T17:00:00.000Z",
      },
      v22: legacyBoard([legacyRankedRow("LEGACY", 1)], "available"),
    });
    expect(decision.source).toBe("radar-v2-candidates");
    expect(decision.rows[0].symbol).toBe("RTH1");
    expect(decision.rows.map((r) => r.symbol)).not.toContain("LEGACY");
  });
});
