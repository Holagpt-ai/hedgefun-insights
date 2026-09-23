import { describe, expect, it } from "vitest";
import {
  applyRadarRepeatMoverFilter,
  buildRadarRepeatMoversView,
  radarRepeatMoversRankFingerprint,
  sortRadarRepeatMoverCandidatesForPresentation,
} from "@/lib/radar/build-radar-repeat-movers-view";
import { buildRepeatMoverWorkflowHandoffs } from "@/lib/radar/radar-repeat-mover-handoffs";
import { assertRepeatMoverContextIsEvidenceOnly } from "@/lib/repeat-movers/get-repeat-mover-context";
import { rankRadarV2Candidates } from "@/lib/screeners/radar-v2-adapter";
import type { RadarV2ScreenerRow } from "@/lib/screeners/radar-v2-adapter";
import type { RepeatMoverContext } from "@/types/repeat-mover";

const SECURITY_ID = "11111111-1111-4111-8111-111111111111";
const NOW = Date.parse("2026-09-22T16:00:00.000Z");

function baseRow(symbol: string, overrides: Partial<RadarV2ScreenerRow> = {}): RadarV2ScreenerRow {
  return {
    tab_id: "day_trade_radar",
    symbol,
    company_name: null,
    price: 10,
    change_percent: null,
    volume: 1_000_000,
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
    avg_volume_20d: null,
    rvol_20d: null,
    day_high: null,
    day_low: null,
    provider_as_of: "2026-09-22T15:59:00.000Z",
    sync_run_id: "gen-1",
    updated_at: "2026-09-22T15:59:30.000Z",
    move_60s_pct: 5,
    signal_tier: "ACTIVE",
    signal_status: "EXPLOSIVE",
    ...overrides,
  };
}

function context(input: {
  profile?: Partial<RepeatMoverContext["profile"]>;
  comparableCount?: number;
  labels?: RepeatMoverContext["evidenceLabels"];
} & Omit<Partial<RepeatMoverContext>, "profile" | "comparableHistory" | "evidenceLabels"> = {}): RepeatMoverContext {
  const comparableCount = input.comparableCount ?? 0;
  const { profile: profileOverrides, comparableCount: _cc, labels, ...rest } = input;
  const ctx: RepeatMoverContext = {
    version: "v1",
    securityId: SECURITY_ID,
    currentSymbol: "ABC",
    currentContext: {
      observedSymbol: "ABC",
      sessionDate: "2026-09-22",
      movePct: 5,
      volume: 1_000_000,
      rvol: null,
      dollarVolume: null,
      direction: "POSITIVE",
      tier: "NOTABLE",
      recordedAt: "2026-09-22T15:59:00.000Z",
    },
    profile: {
      profileAvailable: true,
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
      sampleSizeQuality: "ROBUST",
      sessionsObserved: 1253,
      episodeCount: 8,
      notableCount: 4,
      significantCount: 3,
      extremeCount: 1,
      positiveEpisodeCount: 5,
      negativeEpisodeCount: 3,
      mixedEpisodeCount: 0,
      positiveEpisodePct: 62.5,
      negativeEpisodePct: 37.5,
      episodesPer30Sessions: 1.2,
      episodesPer90Sessions: 3.5,
      medianDaysBetweenEpisodes: 12,
      positiveCloseUpperQuartilePct: null,
      positiveCloseNearHighPct: null,
      negativeCloseNearLowPct: null,
      nextSessionPositiveContinuationRate: null,
      nextSessionNegativeContinuationRate: null,
      historyStartDate: "2024-01-02",
      historyEndDate: "2026-09-20",
      computedAt: "2026-09-21T12:00:00.000Z",
      latestSourceHistoryDate: "2026-09-20",
      latestEpisodeDateUsed: "2026-05-14",
      sourceDailyRowCount: 1253,
      sourceEpisodeCount: 8,
      ...profileOverrides,
    },
    comparableHistory: {
      comparableEpisodeCount: comparableCount,
      closestComparableEpisodes: [],
      mostRecentComparableEpisode: comparableCount > 0
        ? {
            episodeId: "ep-1",
            sessionDate: "2026-05-14",
            tier: "NOTABLE",
            direction: "POSITIVE",
            movePct: 4.8,
            volume: null,
            rvol: null,
            dollarVolume: null,
            closePosition: null,
            nextSessionMovePct: null,
            nextSessionContinuation: null,
            similarity: { sameDirection: true, sameTier: true, movePctDelta: 0.2 },
          }
        : null,
    },
    evidenceLabels: labels ?? (comparableCount > 0 ? ["SIMILAR_PRIOR_EPISODES_FOUND"] : ["RECURRING_MOVER"]),
    assembledAt: "2026-09-22T16:00:00.000Z",
    ...rest,
  };
  assertRepeatMoverContextIsEvidenceOnly(ctx);
  return ctx;
}

describe("Radar Repeat Movers V2 view", () => {
  it("qualifies robust history with similar prior episodes", () => {
    const view = buildRadarRepeatMoversView([
      baseRow("ABC", {
        radar_rank: 1,
        securityId: SECURITY_ID,
        historicalContext: context({ comparableCount: 4, labels: ["SIMILAR_PRIOR_EPISODES_FOUND", "RECURRING_MOVER"] }),
      }),
    ], { nowMs: NOW });

    expect(view.summary.repeatMoverCount).toBe(1);
    const candidate = view.repeatMovers[0]!;
    expect(candidate.qualification.qualifies).toBe(true);
    expect(candidate.qualification.evidenceStrength).toBe("STRONG");
    expect(candidate.displayFacts.similarPriorMovesLabel).toBe("4 Similar Prior Moves");
    expect(candidate.displayFacts.sampleQualityLabel).toBe("Robust History");
    expect(candidate.displayFacts.mostRecentComparableLabel).toBe("Most Recent: 2026-05-14");
    expect(candidate.displayFacts.sessionsObservedLabel).toBe("1,253 Sessions Observed");
    expect(candidate.rvol).toBeNull();
  });

  it("qualifies limited history but marks evidence strength limited", () => {
    const view = buildRadarRepeatMoversView([
      baseRow("LMIT", {
        historicalContext: context({
          comparableCount: 1,
          labels: ["SIMILAR_PRIOR_EPISODES_FOUND", "LIMITED_HISTORY"],
          profile: { sampleSizeQuality: "LIMITED", episodeCount: 2 },
        }),
      }),
    ], { nowMs: NOW });

    const candidate = view.candidates[0]!;
    expect(candidate.qualification.qualifies).toBe(true);
    expect(candidate.qualification.evidenceStrength).toBe("LIMITED");
    expect(candidate.historicalAvailability).toBe("LIMITED");
    expect(view.summary.limitedHistoryCount).toBe(1);
  });

  it("does not qualify without profile and keeps row in candidates", () => {
    const rows = [
      baseRow("NOPRO", { radar_rank: 1, historicalContext: null }),
      baseRow("WITH", {
        radar_rank: 2,
        historicalContext: context({ comparableCount: 2 }),
      }),
    ];
    const view = buildRadarRepeatMoversView(rows, { nowMs: NOW });

    expect(view.candidates).toHaveLength(2);
    expect(view.summary.unavailableHistoryCount).toBe(1);
    expect(view.summary.repeatMoverCount).toBe(1);
    expect(view.candidates[0]?.qualification.qualifies).toBe(false);
    expect(view.candidates[0]?.historicalAvailability).toBe("UNAVAILABLE");
  });

  it("marks stale profile without blocking Radar rows", () => {
    const view = buildRadarRepeatMoversView([
      baseRow("OLD", {
        historicalContext: context({
          comparableCount: 2,
          profile: {
            computedAt: "2026-08-01T12:00:00.000Z",
            latestSourceHistoryDate: "2026-07-01",
            historyEndDate: "2026-09-01",
          },
        }),
      }),
    ], { nowMs: NOW });

    expect(view.candidates[0]?.profileFreshness).toBe("STALE");
    expect(view.candidates[0]?.qualification.qualifies).toBe(true);
  });

  it("preserves discovery rank fingerprint and ranking module independence", () => {
    const rows = [
      baseRow("AAA", { radar_rank: 1, volume: 2_000_000, historicalContext: context({ comparableCount: 1 }) }),
      baseRow("BBB", { radar_rank: 2, volume: 1_000_000, historicalContext: null }),
    ];
    const before = radarRepeatMoversRankFingerprint(rows);
    buildRadarRepeatMoversView(rows, { nowMs: NOW });
    expect(radarRepeatMoversRankFingerprint(rows)).toBe(before);

    const ranked = rankRadarV2Candidates([
      {
        symbol: "LOW",
        generation_id: "g",
        trading_date: "2026-09-22",
        session_kind: "market",
        lifecycle: "ACTIVE",
        signal_status: "EXPLOSIVE",
        last_price: 10,
        move_15s_pct: null,
        move_60s_pct: 5,
        volume_5s: 1,
        volume_15s: 1,
        volume_60s: 1,
        session_volume: 100,
        dollar_volume_60s: 1,
        acceleration_5m: 1,
        rvol_5m: null,
        volume_velocity: null,
        volume_acceleration_pct: null,
        session_high: 11,
        session_low: 9,
        distance_from_hod_pct: 1,
        session_vwap: 10,
        vwap_side: "above",
        freshness_class: "fresh",
        provider_as_of: "2026-09-22T15:59:00.000Z",
        updated_at: "2026-09-22T15:59:30.000Z",
      },
      {
        symbol: "HIGH",
        generation_id: "g",
        trading_date: "2026-09-22",
        session_kind: "market",
        lifecycle: "ACTIVE",
        signal_status: "EXPLOSIVE",
        last_price: 10,
        move_15s_pct: null,
        move_60s_pct: 5,
        volume_5s: 1,
        volume_15s: 1,
        volume_60s: 1,
        session_volume: 500,
        dollar_volume_60s: 1,
        acceleration_5m: 1,
        rvol_5m: null,
        volume_velocity: null,
        volume_acceleration_pct: null,
        session_high: 11,
        session_low: 9,
        distance_from_hod_pct: 1,
        session_vwap: 10,
        vwap_side: "above",
        freshness_class: "fresh",
        provider_as_of: "2026-09-22T15:59:00.000Z",
        updated_at: "2026-09-22T15:59:30.000Z",
      },
    ]);
    expect(ranked[0]?.symbol).toBe("HIGH");
  });

  it("applies view filters and recurring mover evidence", () => {
    const rows = [
      baseRow("REC", {
        historicalContext: context({ comparableCount: 0, labels: ["RECURRING_MOVER"], profile: { episodeCount: 8 } }),
      }),
      baseRow("SIM", {
        historicalContext: context({ comparableCount: 3, labels: ["SIMILAR_PRIOR_EPISODES_FOUND"] }),
      }),
    ];
    const view = buildRadarRepeatMoversView(rows, { nowMs: NOW });
    const recurring = applyRadarRepeatMoverFilter(view.candidates, "recurring_movers");
    const similar = applyRadarRepeatMoverFilter(view.candidates, "similar_prior_episodes");
    expect(recurring.map((c) => c.symbol)).toEqual(["REC"]);
    expect(similar.map((c) => c.symbol)).toEqual(["SIM"]);
  });

  it("uses presentation sort without replacing discovery order on canonical repeatMovers list", () => {
    const view = buildRadarRepeatMoversView([
      baseRow("LOW", { radar_rank: 1, historicalContext: context({ comparableCount: 1 }) }),
      baseRow("HIGH", { radar_rank: 2, historicalContext: context({ comparableCount: 5 }) }),
    ], { nowMs: NOW });
    expect(view.repeatMovers.map((c) => c.symbol)).toEqual(["LOW", "HIGH"]);

    const sorted = sortRadarRepeatMoverCandidatesForPresentation(view.repeatMovers, "comparable_episode_count");
    expect(sorted[0]?.symbol).toBe("HIGH");
  });

  it("exposes workflow handoffs with symbol query params", () => {
    const handoffs = buildRepeatMoverWorkflowHandoffs("abc");
    expect(handoffs.aiAnalyst).toBe("/dashboard/ai?symbol=ABC");
    expect(handoffs.catalyst).toBe("/dashboard/catalyst?symbol=ABC");
    expect(handoffs.watchlist).toBe("/dashboard/watchlist?symbol=ABC");
    expect(handoffs.journal).toBe("/dashboard/journal?symbol=ABC");
    expect(handoffs.actionCenter).toBe("/dashboard/action-center");
  });

  it("does not expose predictive fields on qualified candidates", () => {
    const view = buildRadarRepeatMoversView([
      baseRow("ABC", { historicalContext: context({ comparableCount: 2 }) }),
    ], { nowMs: NOW });
    const json = JSON.stringify(view.repeatMovers[0]).toLowerCase();
    expect(json).not.toContain("probability");
    expect(json).not.toContain("prediction");
    expect(view.candidates[0]?.sampleSizeQuality).not.toBe(0 as unknown as string);
  });
});
