import { describe, expect, it, beforeEach } from "vitest";
import { AI_ANALYST_INTELLIGENCE_BOUNDS } from "@/config/ai-analyst-intelligence.config";
import {
  assertNoFabricatedPredictionFields,
  buildAnalystIntelligencePacket,
  buildRadarSnapshot,
  buildWatchlistSnapshot,
  lateSessionHandoffsForSymbol,
  serializeAnalystIntelligencePacket,
} from "@/lib/ai-analyst/build-intelligence-packet";
import {
  LATE_SESSION_HANDOFF_STORAGE_KEY,
} from "@/config/late-session-handoff.config";
import type { LateSessionContinuationContext } from "@/lib/am-inbox/late-session-continuation-types";
import { writeLateSessionHandoffStore } from "@/lib/am-inbox/late-session-handoff-storage";
import { buildHistoricalMemoryFromRepeatMoverContext } from "@/lib/ai-analyst/historical-memory";

const radarCandidate = {
  symbol: "AAA",
  trading_date: "2026-09-26",
  session_kind: "market",
  lifecycle: "ACTIVE",
  radar_event_lifecycle: "PROMOTED",
  promotion_reason: { code: "VOLUME_SURGE" },
  primary_scanner_event: "HOD_BREAK",
  primary_scanner_event_at: "2026-09-26T15:00:00Z",
  participation_state: "ELEVATED",
  time_adjusted_rvol: 3.2,
  rvol_5m: 2.1,
  volume_velocity: 1.5,
  volume_acceleration_pct: 12,
  acceleration_5m: 0.8,
  distance_from_hod_pct: 0.5,
  session_vwap: 10.5,
  session_high: 11,
  session_low: 9.5,
  previous_close: 9,
  last_price: 10.8,
};

function continuationFixture(symbol: string): LateSessionContinuationContext {
  return {
    securityId: null,
    symbol,
    sourceSessionDate: "2026-09-25",
    sourceTimestamp: "2026-09-25T20:00:00Z",
    sourceCategory: "STRONG_CLOSE_NEAR_HOD",
    lastPrice: 10,
    sessionMovePct: 5,
    volume: 1_000_000,
    rvol: 2,
    dollarVolume: 10_000_000,
    closeDistanceFromHodPct: 0.2,
    afterHoursExtends: true,
    catalystPresent: false,
    floatTurnover: null,
    historicalContextAvailable: false,
    evidenceLabels: [],
    sampleSizeQuality: null,
    comparableEpisodeCount: 0,
    mostRecentComparableDate: null,
    profileFreshness: "UNKNOWN",
    validFromSessionDate: "2026-09-26",
    validThroughSessionDate: "2026-09-26",
    expiryState: "active",
  };
}

describe("AI Analyst intelligence quality v1", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("1. includes scanner radar snapshot in current session evidence", () => {
    const packet = buildAnalystIntelligencePacket({
      symbol: "AAA",
      handoffSource: "radar",
      radarCandidate,
      radarEvents: [{ eventType: "HOD_BREAK", eventAt: "2026-09-26T15:00:00Z", sessionKind: "market", tradingDate: "2026-09-26" }],
    });
    expect(packet.CURRENT_SESSION_EVIDENCE.radar.available).toBe(true);
    expect(packet.CURRENT_SESSION_EVIDENCE.radar.promotionReason).toContain("VOLUME");
  });

  it("2. includes watchlist context when row provided", () => {
    const packet = buildAnalystIntelligencePacket({
      symbol: "AAA",
      watchlistRow: {
        ticker: "AAA",
        session_date: "2026-09-26",
        session_type: "REGULAR",
        direction: "BULLISH",
        rvol: 2,
        rvol_class: "HIGH",
        change_pct: 4,
        explanation: "Volume expansion with catalyst alignment.",
        key_levels: { vwap: 10.5 },
        market_signals: { momentum: true },
        failure_reason: null,
      },
    });
    expect(packet.CURRENT_SESSION_EVIDENCE.watchlist.available).toBe(true);
    expect(packet.VERIFIED_FACTS.catalystRows).toEqual([]);
  });

  it("3. includes catalyst verified rows", () => {
    const packet = buildAnalystIntelligencePacket({
      symbol: "AAA",
      catalystRows: [{
        eventType: "EARNINGS",
        eventDate: "2026-09-27",
        title: "Q3 report",
        publishedAt: "2026-09-26T12:00:00Z",
        verificationState: "provider_reported",
      }],
    });
    expect(packet.VERIFIED_FACTS.catalystRows).toHaveLength(1);
    expect(packet.unavailable.catalyst).toBe(false);
  });

  it("4-6. historical evidence defers episodes to historicalMemory", () => {
    const packet = buildAnalystIntelligencePacket({
      symbol: "AAA",
      workflow: {
        securityId: null,
        symbol: "AAA",
        historicalContextAvailable: true,
        evidenceLabels: ["RECURRING_MOVER"],
        sampleSizeQuality: "ADEQUATE",
        comparableEpisodeCount: 4,
        mostRecentComparableDate: "2026-08-01",
        profileFreshness: "FRESH",
        sourceSurface: "watchlist",
        handoffAt: "2026-09-26T12:00:00Z",
        contextAssembledAt: "2026-09-26T11:00:00Z",
      },
    });
    expect(packet.HISTORICAL_EVIDENCE.defersDetailedEpisodesToHistoricalMemory).toBe(true);
    expect(packet.HISTORICAL_EVIDENCE.workflowSummary.comparableEpisodeCount).toBe(4);
  });

  it("7. intraday reconstruction remains in historical memory builder", () => {
    const memory = buildHistoricalMemoryFromRepeatMoverContext(null);
    expect(memory.contextLoaded).toBe(false);
  });

  it("8. continuation context from prior session store", () => {
    writeLateSessionHandoffStore({
      "AAA:2026-09-25:STRONG_CLOSE_NEAR_HOD": {
        context: continuationFixture("AAA"),
        storedAt: "2026-09-25T21:00:00Z",
      },
    });
    expect(lateSessionHandoffsForSymbol("AAA")).toHaveLength(1);
    const packet = buildAnalystIntelligencePacket({ symbol: "AAA" });
    expect(packet.CURRENT_SESSION_EVIDENCE.priorSessionContinuation[0]?.sourceCategory).toBe(
      "STRONG_CLOSE_NEAR_HOD",
    );
    expect(packet.CURRENT_SESSION_EVIDENCE.temporalNote).toMatch(/prior-session/i);
  });

  it("9. separates prior-session continuation from current radar block", () => {
    const packet = buildAnalystIntelligencePacket({
      symbol: "AAA",
      radarCandidate,
    });
    writeLateSessionHandoffStore({
      "AAA:2026-09-25:DAY_TWO_WATCH": {
        context: { ...continuationFixture("AAA"), sourceCategory: "DAY_TWO_WATCH" },
        storedAt: "2026-09-25T21:00:00Z",
      },
    });
    const withHandoff = buildAnalystIntelligencePacket({ symbol: "AAA", radarCandidate });
    expect(withHandoff.CURRENT_SESSION_EVIDENCE.radar.lifecycle).toBe("ACTIVE");
    expect(packet.CURRENT_SESSION_EVIDENCE.priorSessionContinuation.length).toBe(0);
  });

  it("10. key levels from radar candidate", () => {
    const radar = buildRadarSnapshot("AAA", radarCandidate, []);
    expect(radar.keyLevels.vwap).toBe(10.5);
    expect(radar.keyLevels.hod).toBe(11);
    expect(radar.keyLevels.lod).toBe(9.5);
    expect(radar.keyLevels.priorClose).toBe(9);
  });

  it("11. missing history flagged unavailable", () => {
    const packet = buildAnalystIntelligencePacket({ symbol: "AAA" });
    expect(packet.unavailable.historicalDetail).toBe(true);
    expect(packet.HISTORICAL_EVIDENCE.workflowSummary.historicalContextAvailable).toBe(false);
  });

  it("12. missing catalyst flagged unavailable", () => {
    const packet = buildAnalystIntelligencePacket({ symbol: "AAA" });
    expect(packet.unavailable.catalyst).toBe(true);
  });

  it("13. missing participation surfaces null not zero", () => {
    const radar = buildRadarSnapshot("AAA", { ...radarCandidate, participation_state: null }, []);
    expect(radar.participationState).toBeNull();
  });

  it("14. bounded payload size", () => {
    const events = Array.from({ length: 20 }, (_, i) => ({
      eventType: "VOL",
      eventAt: `2026-09-26T15:${String(i).padStart(2, "0")}:00Z`,
      sessionKind: "market",
      tradingDate: "2026-09-26",
    }));
    const packet = buildAnalystIntelligencePacket({
      symbol: "AAA",
      radarCandidate,
      radarEvents: events,
      catalystRows: Array.from({ length: 10 }, () => ({
        eventType: "NEWS",
        eventDate: "2026-09-26",
        title: "x".repeat(200),
        publishedAt: "2026-09-26T12:00:00Z",
        verificationState: "provider_reported",
      })),
    });
    expect(packet.CURRENT_SESSION_EVIDENCE.radar.recentEvents.length).toBeLessThanOrEqual(
      AI_ANALYST_INTELLIGENCE_BOUNDS.maxRadarEvents,
    );
    expect(serializeAnalystIntelligencePacket(packet).length).toBeLessThanOrEqual(
      AI_ANALYST_INTELLIGENCE_BOUNDS.maxSerializedChars,
    );
  });

  it("15. no fabricated prediction fields in packet", () => {
    const packet = buildAnalystIntelligencePacket({ symbol: "AAA", radarCandidate });
    expect(() => assertNoFabricatedPredictionFields(packet)).not.toThrow();
    expect(packet.MODEL_INTERPRETATION.responseStructure).toMatch(/strong evidence/i);
  });

  it("watchlist unavailable keeps honest failure", () => {
    const wl = buildWatchlistSnapshot({
      ticker: "AAA",
      session_date: "2026-09-26",
      session_type: "REGULAR",
      direction: "NEUTRAL",
      rvol: null,
      rvol_class: null,
      change_pct: null,
      explanation: "",
      key_levels: null,
      market_signals: null,
      failure_reason: "SNAPSHOT_STALE",
    });
    expect(wl.available).toBe(false);
    expect(wl.failureReason).toBe("SNAPSHOT_STALE");
  });

  it("storage key constant unchanged for continuation handoffs", () => {
    expect(LATE_SESSION_HANDOFF_STORAGE_KEY).toBeTruthy();
  });
});
