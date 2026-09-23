import { describe, expect, it, beforeEach, vi } from "vitest";
import { buildAmInboxLateSessionView } from "@/lib/am-inbox/am-inbox-late-session-view";
import { amInboxNavigatePath, amInboxWorkflowRoutes } from "@/lib/am-inbox/am-inbox-workflow-handoff";
import { buildLateSessionContinuationContext } from "@/lib/am-inbox/build-late-session-continuation-context";
import {
  captureLateSessionHandoffsFromScreenerRows,
  persistLateSessionHandoff,
  resetLateSessionHandoffStoreForTests,
} from "@/lib/am-inbox/late-session-handoff-storage";
import {
  computeValidThroughSessionDate,
  firstAmSessionDateAfterSource,
  resolveLateSessionExpiryState,
} from "@/lib/am-inbox/late-session-expiry";
import type { LateSessionContinuationContext } from "@/lib/am-inbox/late-session-continuation-types";
import { LATE_SESSION_SOURCE_CATEGORIES } from "@/config/late-session-handoff.config";
import { compareCandidatesVolumeFirst, type RadarV2CandidateRow } from "@/lib/screeners/radar-v2-adapter";
import {
  evaluateScreenerContinuation,
  type ScreenerContinuationSource,
} from "@/lib/screeners/screener-continuation";
import { nextTradingDay } from "@/lib/market-calendar";
import {
  persistHistoricalWorkflowHandoff,
  readHistoricalWorkflowContext,
} from "@/lib/historical-workflow/workflow-handoff-storage";
import { buildInboxWorkflowNavigatePath, workflowSymbolRoutes } from "@/lib/historical-workflow/workflow-symbol-routes";
import type { RepeatMoverContext } from "@/types/repeat-mover";

const SECURITY_ID = "22222222-2222-4222-8222-222222222222";
const FRESH = { freshnessState: "FRESH" as const };

function continuationRow(overrides: Partial<ScreenerContinuationSource> = {}): ScreenerContinuationSource {
  return {
    symbol: "AAA",
    price: 10,
    volume: 6_000_000,
    rvol_20d: 12,
    provider_as_of: "2026-09-21T19:30:00.000Z",
    updated_at: "2026-09-21T19:30:00.000Z",
    radar_trading_date: "2026-09-21",
    late_session_volume_velocity: "STRONG",
    close_distance_from_hod_pct: 0.4,
    ...overrides,
  };
}

function radarCandidate(symbol: string, sessionVolume: number): RadarV2CandidateRow {
  return {
    symbol,
    generation_id: "11111111-1111-4111-8111-111111111111",
    trading_date: "2026-09-21",
    session_kind: "regular",
    lifecycle: "active",
    signal_status: "active",
    last_price: 10,
    move_15s_pct: null,
    move_60s_pct: null,
    volume_5s: null,
    volume_15s: null,
    volume_60s: null,
    session_volume: sessionVolume,
    dollar_volume_60s: null,
    acceleration_5m: null,
    rvol_5m: null,
    volume_velocity: null,
    volume_acceleration_pct: null,
    primary_scanner_event: null,
    primary_scanner_event_at: null,
    scanner_events: null,
    session_high: null,
    session_low: null,
    distance_from_hod_pct: null,
    session_vwap: null,
    vwap_side: null,
    freshness_class: null,
    provider_as_of: "2026-09-21T19:30:00.000Z",
    updated_at: "2026-09-21T19:30:00.000Z",
  };
}

function minimalRepeatContext(overrides: Partial<RepeatMoverContext> = {}): RepeatMoverContext {
  return {
    version: "v1",
    securityId: SECURITY_ID,
    currentSymbol: "AAA",
    currentContext: {
      observedSymbol: "AAA",
      sessionDate: "2026-09-21",
      movePct: 5,
      volume: 1_000_000,
      rvol: null,
      dollarVolume: null,
      direction: "POSITIVE",
      tier: "NOTABLE",
      recordedAt: "2026-09-21T19:30:00.000Z",
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
      sessionsObserved: 50,
      episodeCount: 2,
      notableCount: 1,
      significantCount: 1,
      extremeCount: 0,
      positiveEpisodeCount: 1,
      negativeEpisodeCount: 1,
      mixedEpisodeCount: 0,
      positiveEpisodePct: 50,
      negativeEpisodePct: 50,
      episodesPer30Sessions: 1,
      episodesPer90Sessions: 2,
      medianDaysBetweenEpisodes: 10,
      positiveCloseUpperQuartilePct: null,
      positiveCloseNearHighPct: null,
      negativeCloseNearLowPct: null,
      nextSessionPositiveContinuationRate: null,
      nextSessionNegativeContinuationRate: null,
      historyStartDate: "2024-01-02",
      historyEndDate: "2026-09-20",
      computedAt: new Date().toISOString(),
      latestSourceHistoryDate: "2026-09-20",
      latestEpisodeDateUsed: "2026-05-14",
      sourceDailyRowCount: 50,
      sourceEpisodeCount: 2,
    },
    comparableHistory: {
      comparableEpisodeCount: 2,
      closestComparableEpisodes: [],
      mostRecentComparableEpisode: null,
    },
    evidenceLabels: ["SIMILAR_PRIOR_EPISODES_FOUND"],
    assembledAt: new Date().toISOString(),
    ...overrides,
  };
}

const PREDICTIVE_FIELD_PATTERN =
  /continuationRate|predict|forecast|score|probability|expected/i;

describe("AM Inbox late-session handoff V1", () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetLateSessionHandoffStoreForTests();
  });

  it("uses market calendar for weekend rollover (Fri source → Mon AM)", () => {
    const friday = "2026-09-18";
    expect(firstAmSessionDateAfterSource(friday)).toBe(nextTradingDay(friday).date);
    expect(firstAmSessionDateAfterSource(friday)).toBe("2026-09-21");
    const expiry = resolveLateSessionExpiryState({
      sourceSessionDate: friday,
      sourceCategory: "POWER_HOUR_MOMENTUM",
      amSessionDate: "2026-09-21",
    });
    expect(expiry.expiryState).toBe("active");
    expect(
      resolveLateSessionExpiryState({
        sourceSessionDate: friday,
        sourceCategory: "POWER_HOUR_MOMENTUM",
        amSessionDate: "2026-09-22",
      }).expiryState,
    ).toBe("expired");
  });

  it.each(LATE_SESSION_SOURCE_CATEGORIES.filter((c) => c !== "DAY_TWO_WATCH"))(
    "expires %s after the first next-session AM only",
    (category) => {
      const source = "2026-09-21";
      const firstNext = firstAmSessionDateAfterSource(source);
      expect(
        resolveLateSessionExpiryState({
          sourceSessionDate: source,
          sourceCategory: category,
          amSessionDate: firstNext,
        }).expiryState,
      ).toBe("active");
      const dayAfter = nextTradingDay(firstNext).date;
      expect(
        resolveLateSessionExpiryState({
          sourceSessionDate: source,
          sourceCategory: category,
          amSessionDate: dayAfter,
        }).expiryState,
      ).toBe("expired");
      expect(computeValidThroughSessionDate(source, category)).toBe(firstNext);
    },
  );

  it("extends DAY_TWO_WATCH through one additional trading session", () => {
    const source = "2026-09-21";
    const firstNext = firstAmSessionDateAfterSource(source);
    const secondNext = nextTradingDay(firstNext).date;
    expect(computeValidThroughSessionDate(source, "DAY_TWO_WATCH")).toBe(secondNext);
    expect(
      resolveLateSessionExpiryState({
        sourceSessionDate: source,
        sourceCategory: "DAY_TWO_WATCH",
        amSessionDate: firstNext,
      }).expiryState,
    ).toBe("active");
    expect(
      resolveLateSessionExpiryState({
        sourceSessionDate: source,
        sourceCategory: "DAY_TWO_WATCH",
        amSessionDate: secondNext,
      }).expiryState,
    ).toBe("active");
    expect(
      resolveLateSessionExpiryState({
        sourceSessionDate: source,
        sourceCategory: "DAY_TWO_WATCH",
        amSessionDate: nextTradingDay(secondNext).date,
      }).expiryState,
    ).toBe("expired");
  });

  it("captures each late-session source category from screener continuation", () => {
    const powerHour = evaluateScreenerContinuation(continuationRow(), FRESH);
    expect(powerHour.result.categories).toContain("POWER_HOUR_MOMENTUM");

    const afterHours = evaluateScreenerContinuation(
      continuationRow({
        provider_as_of: "2026-09-21T21:00:00.000Z",
        after_hours_extends: "TRUE",
      }),
      FRESH,
    );
    expect(afterHours.result.categories).toContain("AFTER_HOURS_CONTINUATION");

    captureLateSessionHandoffsFromScreenerRows([continuationRow({ symbol: "PWR" })], {
      sessionDate: "2026-09-21",
    });
    captureLateSessionHandoffsFromScreenerRows(
      [
        continuationRow({
          symbol: "AH",
          provider_as_of: "2026-09-21T21:00:00.000Z",
          after_hours_extends: "TRUE",
        }),
      ],
      { sessionDate: "2026-09-21" },
    );

    const view = buildAmInboxLateSessionView("2026-09-22");
    const symbols = view.candidates.map((c) => c.context.symbol);
    expect(symbols).toContain("PWR");
    expect(symbols).toContain("AH");
  });

  it("preserves null RVOL and unavailable history without inventing defaults", () => {
    const ctx = buildLateSessionContinuationContext({
      symbol: "ZZZ",
      sourceSessionDate: "2026-09-21",
      sourceTimestamp: "2026-09-21T20:00:00.000Z",
      sourceCategory: "STRONG_CLOSE_NEAR_HOD",
      rvol: null,
      workflow: null,
    });
    expect(ctx.rvol).toBeNull();
    expect(ctx.historicalContextAvailable).toBe(false);
    expect(ctx.catalystPresent).toBeNull();
  });

  it("reuses cached historical workflow context in AM view without refetch", () => {
    persistHistoricalWorkflowHandoff(minimalRepeatContext(), {
      symbol: "AAA",
      sourceSurface: "radar",
    });
    persistLateSessionHandoff(
      buildLateSessionContinuationContext({
        symbol: "AAA",
        securityId: SECURITY_ID,
        sourceSessionDate: "2026-09-21",
        sourceTimestamp: "2026-09-21T20:00:00.000Z",
        sourceCategory: "DAY_TWO_WATCH",
      }),
    );

    const fetchSpy = vi.fn();
    const view = buildAmInboxLateSessionView("2026-09-22");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(view.candidates).toHaveLength(1);
    expect(view.candidates[0]?.workflow?.securityId).toBe(SECURITY_ID);
    expect(view.candidates[0]?.context.historicalContextAvailable).toBe(true);
    expect(readHistoricalWorkflowContext("AAA")?.comparableEpisodeCount).toBe(2);
  });

  it("supports symbol-only and symbol+securityId workflow handoffs", () => {
    const symbolOnly = workflowSymbolRoutes("SOLO");
    expect(symbolOnly?.ai).toBe(buildInboxWorkflowNavigatePath("ai", "SOLO"));

    persistHistoricalWorkflowHandoff(minimalRepeatContext({ currentSymbol: "ID" }), {
      symbol: "ID",
      sourceSurface: "radar",
    });
    const withId = amInboxWorkflowRoutes("ID", SECURITY_ID);
    expect(withId?.ai).toContain("securityId=");
    expect(amInboxNavigatePath("journal", "ID", SECURITY_ID)).toContain("symbol=ID");
  });

  it("preserves stored handoff order (no historical re-ranking)", () => {
    for (const symbol of ["CCC", "BBB", "AAA"]) {
      persistLateSessionHandoff(
        buildLateSessionContinuationContext({
          symbol,
          sourceSessionDate: "2026-09-21",
          sourceTimestamp: "2026-09-21T20:00:00.000Z",
          sourceCategory: "POWER_HOUR_MOMENTUM",
        }),
      );
    }
    const view = buildAmInboxLateSessionView("2026-09-22");
    expect(view.candidates.map((c) => c.context.symbol)).toEqual(["CCC", "BBB", "AAA"]);
  });

  it("does not change Discovery volume-first ranking when capturing handoffs", () => {
    const low = radarCandidate("LOW", 1_000_000);
    const high = radarCandidate("HIGH", 9_000_000);
    expect(compareCandidatesVolumeFirst(low, high)).toBeGreaterThan(0);
    captureLateSessionHandoffsFromScreenerRows(
      [continuationRow({ symbol: "HIGH" }), continuationRow({ symbol: "LOW", volume: 1_000_000 })],
      { sessionDate: "2026-09-21" },
    );
    expect(compareCandidatesVolumeFirst(high, low)).toBeLessThan(0);
  });

  it("LateSessionContinuationContext exposes no predictive scoring fields", () => {
    const sample: LateSessionContinuationContext = buildLateSessionContinuationContext({
      symbol: "X",
      sourceSessionDate: "2026-09-21",
      sourceTimestamp: "2026-09-21T20:00:00.000Z",
      sourceCategory: "POWER_HOUR_MOMENTUM",
    });
    for (const key of Object.keys(sample)) {
      expect(key).not.toMatch(PREDICTIVE_FIELD_PATTERN);
    }
  });
});
