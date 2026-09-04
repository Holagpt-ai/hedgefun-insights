import { describe, expect, it } from "vitest";
import type { RadarV2Decision } from "@/lib/screeners/radar-v2-adapter";
import type { ScreenerResultRow, ScreenerTabView } from "@/lib/screeners/contract";
import { resolveRadarBackedScreenerLoad } from "@/lib/screeners/radar-v2-screener-load";

const GEN_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const GEN_B = "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const SYNCED_A = "2026-09-04T17:12:30.000Z";
const SYNCED_B = "2026-09-04T17:13:30.000Z";

function row(symbol: string, volume: number, generationId = GEN_A): ScreenerResultRow {
  return {
    tab_id: "day_trade_radar",
    symbol,
    company_name: null,
    price: 8,
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
    day_high: 9,
    day_low: 7,
    provider_as_of: SYNCED_A,
    sync_run_id: generationId,
    updated_at: SYNCED_A,
  };
}

function legacyRow(symbol: string): ScreenerResultRow {
  return {
    ...row(symbol, 50_000),
    price: 10,
    change_percent: 12,
    volume_ratio_prior_session: 8,
    prior_session_volume: 6_000,
  };
}

function available(
  symbols: string[],
  session: string,
  generationId = GEN_A,
  syncedAt = SYNCED_A,
): RadarV2Decision {
  return {
    source: "radar-v2",
    reason: "radar_v2_available",
    session,
    view: {
      status: "available",
      rows: symbols.map((s, i) => row(s, 9_000_000 - i * 100_000, generationId)),
      synced_at: syncedAt,
      provider_as_of_max: syncedAt,
    },
  };
}

function empty(session: string, syncedAt = SYNCED_A): RadarV2Decision {
  return {
    source: "radar-v2",
    reason: "radar_v2_empty",
    session,
    view: {
      status: "empty",
      rows: [],
      synced_at: syncedAt,
      provider_as_of_max: syncedAt,
    },
  };
}

function fallback(reason: string, session: string | null = "market"): RadarV2Decision {
  return { source: "fallback", reason, session, view: null };
}

function legacyView(symbols: string[]): ScreenerTabView {
  return {
    status: "available",
    rows: symbols.map(legacyRow),
    synced_at: SYNCED_A,
    provider_as_of_max: SYNCED_A,
    attempts: 1,
  };
}

describe("Radar-backed Screeners load resolver (D13)", () => {
  it("1. healthy Radar V2 available → Sentinel source authoritative", () => {
    const result = resolveRadarBackedScreenerLoad({
      tabId: "day_trade_radar",
      soft: false,
      priorRadar: null,
      radarDecision: available(["AAA", "BBB"], "market"),
      legacyView: legacyView(["LEGACY"]),
    });
    expect(result.preserve).toBe(false);
    expect(result.source).toBe("radar-v2");
    expect(result.session).toBe("market");
    expect(result.view?.rows.map((r) => r.symbol)).toEqual(["AAA", "BBB"]);
    expect(result.view?.rows.map((r) => r.symbol)).not.toContain("LEGACY");
  });

  it("2. legacy rows also available → do not replace Sentinel board", () => {
    const result = resolveRadarBackedScreenerLoad({
      tabId: "day_trade_radar",
      soft: false,
      priorRadar: null,
      radarDecision: available(["SNXX"], "after-hours"),
      legacyView: legacyView(["SNXX", "IMRN"]),
    });
    expect(result.source).toBe("radar-v2");
    expect(result.view?.rows).toHaveLength(1);
    expect(result.view?.rows[0].symbol).toBe("SNXX");
    expect((result.view?.rows[0] as { legacy_confirmed?: boolean }).legacy_confirmed).toBe(true);
  });

  it("6. transient soft refresh failure → prior Radar board preserved", () => {
    const prior = available(["IMRN"], "pre-market");
    const result = resolveRadarBackedScreenerLoad({
      tabId: "day_trade_radar",
      soft: true,
      priorRadar: prior,
      radarDecision: fallback("radar_v2_fetch_error"),
      legacyView: legacyView(["LEGACY"]),
    });
    expect(result.preserve).toBe(true);
    expect(result.source).toBe("radar-v2");
    expect(result.session).toBe("pre-market");
    expect(result.nextPriorRadar).toBe(prior);
  });

  it("7. retry exhausted → prior Radar board preserved", () => {
    const prior = available(["BAOS"], "market");
    const result = resolveRadarBackedScreenerLoad({
      tabId: "volume_spikes",
      soft: true,
      priorRadar: prior,
      radarDecision: fallback("radar_v2_retry_exhausted"),
      legacyView: legacyView(["LEGACY"]),
    });
    expect(result.preserve).toBe(true);
    expect(result.source).toBe("radar-v2");
  });

  it("generation_race and fetch_threw also preserve on soft refresh", () => {
    const prior = available(["SOXL"], "after-hours");
    for (const reason of ["generation_race", "radar_v2_fetch_threw"] as const) {
      const result = resolveRadarBackedScreenerLoad({
        tabId: "day_trade_radar",
        soft: true,
        priorRadar: prior,
        radarDecision: fallback(reason),
        legacyView: legacyView(["LEGACY"]),
      });
      expect(result.preserve).toBe(true);
      expect(result.source).toBe("radar-v2");
    }
  });

  it("8. valid newer Radar generation → replaces prior board", () => {
    const prior = available(["OLD"], "market", GEN_A, SYNCED_A);
    const next = available(["NEW"], "market", GEN_B, SYNCED_B);
    const result = resolveRadarBackedScreenerLoad({
      tabId: "day_trade_radar",
      soft: true,
      priorRadar: prior,
      radarDecision: next,
      legacyView: null,
    });
    expect(result.preserve).toBe(false);
    expect(result.source).toBe("radar-v2");
    expect(result.view?.rows[0].symbol).toBe("NEW");
    expect(result.view?.synced_at).toBe(SYNCED_B);
  });

  it("9. healthy Radar empty → authoritative empty", () => {
    const result = resolveRadarBackedScreenerLoad({
      tabId: "day_trade_radar",
      soft: true,
      priorRadar: available(["AAA"], "market"),
      radarDecision: empty("market", SYNCED_B),
      legacyView: legacyView(["LEGACY"]),
    });
    expect(result.preserve).toBe(false);
    expect(result.source).toBe("radar-v2");
    expect(result.view?.status).toBe("empty");
    expect(result.view?.rows).toEqual([]);
  });

  it("10. initial Radar unavailable → legacy fallback allowed", () => {
    const result = resolveRadarBackedScreenerLoad({
      tabId: "day_trade_radar",
      soft: false,
      priorRadar: null,
      radarDecision: fallback("radar_v2_stale"),
      legacyView: legacyView(["LEGACY"]),
    });
    expect(result.preserve).toBe(false);
    expect(result.source).toBe("screener-results");
    expect(result.session).toBeNull();
    expect(result.view?.rows[0].symbol).toBe("LEGACY");
    expect(result.nextPriorRadar).toBeNull();
  });

  it("16. closed session is not a transient preserve reason", () => {
    const result = resolveRadarBackedScreenerLoad({
      tabId: "day_trade_radar",
      soft: true,
      priorRadar: available(["AH1"], "after-hours"),
      radarDecision: fallback("session_not_active:closed", "closed"),
      legacyView: legacyView(["CLOSED1"]),
    });
    expect(result.preserve).toBe(false);
    expect(result.source).toBe("screener-results");
  });

  it("13–15. overlay applies in pre-market, market, and after-hours without changing order", () => {
    for (const session of ["pre-market", "market", "after-hours"] as const) {
      const result = resolveRadarBackedScreenerLoad({
        tabId: "day_trade_radar",
        soft: false,
        priorRadar: null,
        radarDecision: available(["A", "B"], session),
        legacyView: legacyView(["B"]),
      });
      expect(result.source).toBe("radar-v2");
      expect(result.session).toBe(session);
      expect(result.view?.rows.map((r) => r.symbol)).toEqual(["A", "B"]);
      expect((result.view?.rows[0] as { legacy_confirmed?: boolean }).legacy_confirmed).toBe(false);
      expect((result.view?.rows[1] as { legacy_confirmed?: boolean }).legacy_confirmed).toBe(true);
    }
  });

  it("17–18. Gappers / New Highs-Lows are not overlayed as Day Trade Radar confirmation", () => {
    for (const tabId of ["gappers", "new_highs_lows"]) {
      const result = resolveRadarBackedScreenerLoad({
        tabId,
        soft: false,
        priorRadar: null,
        radarDecision: available(["AAA"], "market"),
        legacyView: legacyView(["AAA"]),
      });
      expect((result.view?.rows[0] as { legacy_confirmed?: boolean }).legacy_confirmed).toBeUndefined();
    }
  });
});
