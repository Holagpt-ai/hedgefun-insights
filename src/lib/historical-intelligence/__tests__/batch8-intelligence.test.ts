import { describe, expect, it } from "vitest";
import { computeRvol5mFromBaseline } from "@/lib/scanner-intelligence/rvol-5m-intelligence";
import {
  classifyVolumeAccelerationState,
  volumeVelocityRatio,
} from "@/lib/scanner-intelligence/volume-participation";
import {
  buildCurrentSetupFromRadarRow,
  rankHistoricalMatches,
} from "@/lib/historical-intelligence/historical-match-engine";
import { summarizeHistoricalMatches } from "@/lib/historical-intelligence/historical-match-summary";
import { buildAnalystIntelligencePacket } from "@/lib/ai-analyst/build-intelligence-packet";
import { radarRankedRowToStocksistSignal } from "@/lib/execution/signal/map-radar-row-to-stocksist-signal";
import { computeDayTradeRadarScore } from "@/features/day-trade-radar-v2/day-trade-radar-opportunity";
import { rankRadarRows } from "@/features/day-trade-radar-v2/radar-metrics";
import type { RadarRankedRow } from "@/features/day-trade-radar-v2/types";
import type { ScreenerResultRow } from "@/lib/screeners/contract";
import type { RadarRankingFields } from "@/features/day-trade-radar-v2/types";
import type { RepeatMoverContext } from "@/types/repeat-mover";
import {
  DEFAULT_SCANNER_EVENT_CONFIG,
  qualifyRunningUp,
  qualifyHodMomentum,
  type ScannerEventEvalInput,
} from "../../../../supabase/functions/_shared/radar-v22/scanner-events.ts";

function scannerBase(over: Partial<ScannerEventEvalInput> = {}): ScannerEventEvalInput {
  return {
    eventNowMs: Date.parse("2026-09-26T15:00:00.000Z"),
    lastPrice: 5,
    move15sPct: 0.4,
    move60sPct: 0.6,
    move15Complete: true,
    move60Complete: true,
    volumeVelocity: 50_000,
    rvol5m: 3,
    volumeAccelerationPct: 30,
    distanceFromHodPct: 1,
    sessionVolume: 500_000,
    volumeRatioPrior: 2,
    vol60s: 80_000,
    vwapSide: "above",
    lastHodBreakMs: null,
    lastVwapReclaimMs: null,
    lastVwapLossMs: null,
    previousClose: 4,
    sessionOpen: 4.2,
    gapPercent: 3,
    ...over,
  };
}

function mockContext(episodes: RepeatMoverContext["comparableHistory"]["closestComparableEpisodes"]): RepeatMoverContext {
  return {
    version: "v1",
    securityId: "11111111-1111-1111-1111-111111111111" as RepeatMoverContext["securityId"],
    currentSymbol: "AAA",
    currentContext: {
      observedSymbol: "AAA",
      sessionDate: "2026-09-26",
      movePct: 12,
      volume: 2_000_000,
      rvol: 4,
      dollarVolume: null,
      direction: "POSITIVE",
      tier: "NOTABLE",
      recordedAt: null,
    },
    profile: {
      profileAvailable: true,
      sampleSizeQuality: "ADEQUATE",
      sessionsObserved: 40,
      episodeCount: 5,
      notableCount: 3,
      significantCount: 1,
      extremeCount: 0,
      positiveEpisodeCount: null,
      negativeEpisodeCount: null,
      mixedEpisodeCount: null,
      positiveEpisodePct: null,
      negativeEpisodePct: null,
      episodesPer30Sessions: null,
      episodesPer90Sessions: null,
      medianDaysBetweenEpisodes: null,
      positiveCloseUpperQuartilePct: null,
      positiveCloseNearHighPct: null,
      negativeCloseNearLowPct: null,
      nextSessionPositiveContinuationRate: null,
      nextSessionNegativeContinuationRate: null,
      historyStartDate: null,
      historyEndDate: null,
      computedAt: null,
      latestSourceHistoryDate: null,
      latestEpisodeDateUsed: null,
      sourceDailyRowCount: null,
      sourceEpisodeCount: null,
      episodesWithD1Outcome: null,
      episodesWithD5Outcome: null,
      forwardOutcomeCoveragePctD1: null,
      medianD1ReturnPct: null,
      medianD5ReturnPct: null,
      positiveD1Pct: null,
      negativeD1Pct: null,
      observedNextSessionSampleSize: null,
      observedNextSessionPositivePct: null,
      observedNextSessionNegativePct: null,
    },
    comparableHistory: {
      comparableEpisodeCount: episodes.length,
      closestComparableEpisodes: episodes,
      mostRecentComparableEpisode: episodes[0] ?? null,
    },
    evidenceLabels: [],
    assembledAt: new Date().toISOString(),
  };
}

describe("Batch 8 scanner participation", () => {
  it("5m RVOL null without baseline samples", () => {
    expect(computeRvol5mFromBaseline(100_000, { expectedVolume: 50_000, sampleCount: 3 })).toBeNull();
    expect(computeRvol5mFromBaseline(100_000, { expectedVolume: 50_000, sampleCount: 10 })).toBe(2);
  });

  it("volume acceleration states", () => {
    expect(classifyVolumeAccelerationState(null)).toBeNull();
    expect(classifyVolumeAccelerationState(5)).toBe("NORMAL");
    expect(classifyVolumeAccelerationState(20)).toBe("ACCELERATING");
    expect(classifyVolumeAccelerationState(40)).toBe("EXPLOSIVE");
  });

  it("volume velocity ratio", () => {
    expect(volumeVelocityRatio({ currentVelocity: 10_000, priorVelocity: 5_000 })).toBe(2);
    expect(volumeVelocityRatio({ currentVelocity: null, priorVelocity: null, volumeAccelerationPct: 25 })).toBe(1.25);
  });
});

describe("Batch 8 scanner events", () => {
  it("RUNNING_UP and HOD momentum qualification", () => {
    expect(qualifyRunningUp(scannerBase())).toBe(true);
    expect(qualifyRunningUp(scannerBase({ volumeVelocity: 1_000 }))).toBe(false);
    expect(qualifyHodMomentum(scannerBase({ distanceFromHodPct: 0.5 }))).toBe(true);
  });
});

describe("Batch 8 historical match", () => {
  it("ranks episodes and marks limited sample", () => {
    const ctx = mockContext([
      {
        episodeId: "e1",
        sessionDate: "2026-08-01",
        tier: "NOTABLE",
        direction: "POSITIVE",
        movePct: 11,
        volume: 1_000_000,
        rvol: 3.5,
        dollarVolume: null,
        closePosition: 0.8,
        nextSessionMovePct: 2,
        nextSessionContinuation: true,
        similarity: { sameDirection: true, sameTier: true, movePctDelta: 1 },
      },
    ]);
    const current = buildCurrentSetupFromRadarRow({
      symbol: "AAA",
      price: 10,
      change_percent: 12,
      volume: 2_000_000,
      rvol_5m: 3.2,
      vol_velocity: 40_000,
      primary_scanner_event: "RUNNING_UP",
    } as RadarRankedRow);
    const top = rankHistoricalMatches(current, ctx);
    const summary = summarizeHistoricalMatches(top);
    expect(summary.matchCount).toBeGreaterThan(0);
    expect(summary.sampleQuality).toBe("LIMITED");
  });
});

describe("Batch 8 workflow wiring", () => {
  it("AI Analyst packet includes participation evidence", () => {
    const packet = buildAnalystIntelligencePacket({
      symbol: "AAA",
      radarCandidate: {
        symbol: "AAA",
        trading_date: "2026-09-26",
        session_kind: "market",
        lifecycle: "active",
        radar_event_lifecycle: "MOMENTUM",
        promotion_reason: null,
        primary_scanner_event: "RUNNING_UP",
        primary_scanner_event_at: null,
        participation_state: "active",
        time_adjusted_rvol: 2,
        rvol_5m: 3,
        volume_velocity: 45_000,
        volume_acceleration_pct: 28,
        acceleration_5m: null,
        distance_from_hod_pct: 0.8,
        session_vwap: 9,
        session_high: 10,
        session_low: 8,
        previous_close: 8,
        last_price: 10,
      },
    });
    expect(packet.CURRENT_SESSION_EVIDENCE.radar.volumeAccelerationState).toBe("ACCELERATING");
    expect(packet.HISTORICAL_EVIDENCE.historicalMatchSummary).toBeNull();
  });

  it("StocksistSignal carries scanner intelligence metadata", () => {
    const signal = radarRankedRowToStocksistSignal({
      symbol: "ZZZ",
      price: 5,
      rank: 1,
      primary_scanner_event: "VWAP_RECLAIM",
      rvol_5m: 2.5,
      vol_velocity: 30_000,
      volume_acceleration_pct: 22,
      updated_at: "2026-09-26T15:00:00Z",
    } as RadarRankedRow);
    expect(signal?.metadata.scannerEvent).toBe("VWAP_RECLAIM");
    expect(signal?.metadata.rvol5m).toBe(2.5);
    expect(signal?.metadata.volumeAccelerationState).toBe("ACCELERATING");
  });

  it("high-volume row outranks thin mover on opportunity score", () => {
    type RowInput = Partial<ScreenerResultRow & RadarRankingFields> & Pick<ScreenerResultRow, "symbol" | "volume">;
    const mk = (overrides: RowInput) =>
      ({
        tab_id: "day_trade_radar",
        company_name: overrides.symbol,
        price: overrides.price ?? 10,
        change_percent: overrides.change_percent ?? 12,
        volume: overrides.volume,
        prior_session_volume: 100_000,
        provider_as_of: "2026-09-16T14:55:00.000Z",
        updated_at: "2026-09-16T14:55:00.000Z",
        ...overrides,
      }) as ScreenerResultRow & RadarRankingFields;
    const universe = rankRadarRows(
      [
        mk({
          symbol: "LIQ",
          volume: 5_000_000,
          change_percent: 8,
          rvol_5m: 2,
          vol_velocity: 120_000,
          rolling_volume_60s: 200_000,
          freshness_class: "fresh",
          signal_status: "BUILDING",
        }),
        mk({
          symbol: "THIN",
          volume: 80_000,
          change_percent: 40,
          rvol_5m: 15,
          vol_velocity: 3_000,
          rolling_volume_60s: 4_000,
          freshness_class: "fresh",
          signal_status: "EXPLOSIVE",
        }),
      ],
      "available",
    );
    const peers = {
      sessionVolumes: universe.map((r) => r.volume ?? 0),
      volume60s: universe.map((r) => r.rolling_volume_60s ?? 0).filter((n) => n > 0),
      velocities: universe.map((r) => r.vol_velocity ?? 0).filter((n) => n > 0),
      dollar60s: [],
      rvol5m: universe.map((r) => r.rvol_5m ?? 0).filter((n) => n > 0),
      timeAdjustedRvol: [],
      acceleration5m: [],
    };
    const now = Date.parse("2026-09-16T15:00:00.000Z");
    const liq = computeDayTradeRadarScore(universe.find((r) => r.symbol === "LIQ")!, peers, now);
    const thin = computeDayTradeRadarScore(universe.find((r) => r.symbol === "THIN")!, peers, now);
    expect(liq.total).toBeGreaterThan(thin.total);
  });
});
