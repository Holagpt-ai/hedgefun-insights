import { describe, expect, it } from "vitest";
import {
  buildCatalystHistoricalSummary,
  catalystFreshness,
  catalystHistoricalBadgeLabel,
} from "@/lib/catalyst/catalyst-historical-facts";
import {
  matchesCatalystCategoryFilter,
  matchesCatalystRecencyFilter,
} from "@/lib/catalyst/catalyst-filters";
import { liveEventCategory } from "@/lib/catalyst/catalyst-event-visuals";
import type { RepeatMoverContext } from "@/types/repeat-mover";

function context(overrides: Partial<RepeatMoverContext["profile"]> = {}): RepeatMoverContext {
  return {
    version: "v1",
    securityId: "11111111-1111-1111-1111-111111111111" as RepeatMoverContext["securityId"],
    currentSymbol: "ABCD",
    currentContext: {
      observedSymbol: "ABCD",
      sessionDate: "2026-09-21",
      movePct: null,
      volume: null,
      rvol: null,
      dollarVolume: null,
      direction: null,
      tier: null,
      recordedAt: null,
    },
    profile: {
      profileAvailable: true,
      sampleSizeQuality: "ADEQUATE",
      sessionsObserved: 300,
      episodeCount: 12,
      notableCount: null,
      significantCount: null,
      extremeCount: null,
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
      medianD1ReturnPct: 1.8,
      medianD5ReturnPct: null,
      positiveD1Pct: null,
      negativeD1Pct: null,
      observedNextSessionSampleSize: 7,
      observedNextSessionPositivePct: null,
      observedNextSessionNegativePct: null,
      ...overrides,
    },
    comparableHistory: {
      comparableEpisodeCount: 3,
      closestComparableEpisodes: [
        {
          episodeId: "ep-1",
          sessionDate: "2026-05-04",
          tier: "NOTABLE",
          direction: "POSITIVE",
          movePct: 12,
          volume: null,
          rvol: null,
          dollarVolume: null,
          closePosition: null,
          nextSessionMovePct: null,
          nextSessionContinuation: null,
          observedForwardOutcomes: {
            closeToCloseReturnPct: { D1: 2.4, D5: -1.1 },
            highExcursionPct: {},
            lowExcursionPct: {},
            closePosition: {},
            nextSession: null,
          },
          historicalEvents: [
            {
              eventType: "EARNINGS",
              title: "Q1 results released",
              publishedAt: "2026-05-04T12:00:00Z",
              temporalRelationship: "EVENT_SAME_SESSION",
              source: "sec_edgar",
            },
          ],
          similarity: { sameDirection: true, sameTier: true, movePctDelta: null },
        },
      ],
      mostRecentComparableEpisode: null,
    },
    evidenceLabels: [],
    assembledAt: "2026-09-22T00:00:00Z",
  };
}

describe("Catalyst Tab V1 historical facts", () => {
  it("builds descriptive, non-predictive fact lines", () => {
    const summary = buildCatalystHistoricalSummary(context());
    expect(summary.available).toBe(true);
    expect(summary.lines).toContain("Median D1 move across observed episodes: +1.8%");
    expect(summary.lines).toContain("Observed next-session sample size: 7");
    expect(summary.lines.join(" ")).not.toMatch(/win rate|probability|expected|likely/i);
  });

  it("returns an unavailable summary when no profile exists", () => {
    const summary = buildCatalystHistoricalSummary(null);
    expect(summary.available).toBe(false);
    expect(summary.lines).toHaveLength(0);
    expect(catalystHistoricalBadgeLabel(summary)).toBeNull();
  });

  it("caps prior event cards at three and keeps observed outcomes", () => {
    const summary = buildCatalystHistoricalSummary(context());
    expect(summary.priorEvents).toHaveLength(1);
    expect(summary.priorEvents[0]).toMatchObject({
      categoryLabel: "Earnings",
      temporalRelationshipLabel: "Event published earlier that session",
      observedD1: "+2.4%",
      observedD5: "-1.1%",
    });
  });

  it("omits unavailable metrics instead of showing zero", () => {
    const summary = buildCatalystHistoricalSummary(
      context({ medianD1ReturnPct: null, observedNextSessionSampleSize: null }),
    );
    expect(summary.lines.some((line) => line.includes("Median D1"))).toBe(false);
    expect(summary.lines.some((line) => line.includes("next-session sample"))).toBe(false);
  });
});

describe("Catalyst Tab V1 filters and freshness", () => {
  it("groups live event types into the filter categories", () => {
    expect(liveEventCategory("earnings")).toBe("EARNINGS");
    expect(matchesCatalystCategoryFilter("earnings", "EARNINGS")).toBe(true);
    expect(matchesCatalystCategoryFilter("sec_filings", "EARNINGS")).toBe(false);
    expect(matchesCatalystCategoryFilter("other", "PRESS_RELEASE")).toBe(true);
    expect(matchesCatalystCategoryFilter("all", "OFFERING")).toBe(true);
  });

  it("filters on historical context availability", () => {
    const base = {
      publishedAtIso: null,
      eventDate: null,
      nowMs: Date.parse("2026-09-22T12:00:00Z"),
    };
    expect(matchesCatalystRecencyFilter({ ...base, filter: "has_history", hasHistoricalContext: true })).toBe(true);
    expect(matchesCatalystRecencyFilter({ ...base, filter: "has_history", hasHistoricalContext: false })).toBe(false);
  });

  it("marks missing publish time honestly", () => {
    expect(catalystFreshness(null, Date.now())).toEqual({
      label: "Publish time unavailable",
      stale: true,
    });
  });
});
