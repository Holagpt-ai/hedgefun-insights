import { describe, expect, it } from "vitest";
import {
  buildCurrentSetupFromRadarRow,
  rankHistoricalMatches,
} from "@/lib/historical-intelligence/historical-match-engine";
import { summarizeHistoricalMatches } from "@/lib/historical-intelligence/historical-match-summary";
import {
  buildHistoricalMarketIntelligence,
  dedupeEpisodesBySessionDate,
} from "@/lib/historical-intelligence/historical-market-intelligence";
import { unavailableRepeatMoverProfileSnapshot } from "@/lib/repeat-movers/get-repeat-mover-context";
import type { RepeatMoverComparableEpisode, RepeatMoverContext } from "@/types/repeat-mover";

function episode(
  partial: Partial<RepeatMoverComparableEpisode> & Pick<RepeatMoverComparableEpisode, "episodeId">,
): RepeatMoverComparableEpisode {
  return {
    sessionDate: "2026-10-14",
    tier: "NOTABLE",
    direction: "POSITIVE",
    movePct: 8,
    volume: 8_200_000,
    rvol: 3.2,
    dollarVolume: null,
    closePosition: null,
    nextSessionMovePct: 2,
    nextSessionContinuation: true,
    similarity: { sameDirection: true, sameTier: true, movePctDelta: 0 },
    ...partial,
  };
}

function context(overrides: Partial<RepeatMoverContext> = {}): RepeatMoverContext {
  const profile = {
    ...unavailableRepeatMoverProfileSnapshot(),
    profileAvailable: true,
    episodeCount: 4,
    sessionsObserved: 90,
    sampleSizeQuality: "ADEQUATE" as const,
    historyStartDate: "2026-01-01",
    historyEndDate: "2026-10-14",
    sourceEpisodeCount: 4,
    latestEpisodeDateUsed: "2026-10-14",
  };
  return {
    version: "v1",
    securityId: "11111111-1111-1111-1111-111111111111" as RepeatMoverContext["securityId"],
    currentSymbol: "XYZ",
    currentContext: {
      observedSymbol: "XYZ",
      sessionDate: "2026-10-19",
      movePct: 10,
      volume: 9_000_000,
      rvol: 4,
      dollarVolume: null,
      direction: "POSITIVE",
      tier: "NOTABLE",
      recordedAt: "2026-10-19T15:00:00.000Z",
    },
    profile,
    comparableHistory: {
      comparableEpisodeCount: 2,
      closestComparableEpisodes: [
        episode({ episodeId: "e1", sessionDate: "2026-10-14" }),
        episode({ episodeId: "e2", sessionDate: "2026-10-01", nextSessionContinuation: false }),
      ],
      mostRecentComparableEpisode: episode({ episodeId: "e1", sessionDate: "2026-10-14" }),
    },
    evidenceLabels: [],
    assembledAt: "2026-10-19T16:00:00.000Z",
    ...overrides,
  };
}

const currentSetup = buildCurrentSetupFromRadarRow({
  symbol: "XYZ",
  change_percent: 10,
  volume: 9_000_000,
  rvol: 4,
  rvol_5m: 3,
  vol_velocity: 40_000,
  primary_scanner_event: "RUNNING_UP",
});

describe("Batch 25 — historical market intelligence", () => {
  it("dedupes repeated scanner polls for the same session date", () => {
    const deduped = dedupeEpisodesBySessionDate([
      episode({ episodeId: "poll-a", sessionDate: "2026-10-14", movePct: 5 }),
      episode({ episodeId: "poll-b", sessionDate: "2026-10-14", movePct: 9 }),
    ]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.episodeId).toBe("poll-b");
  });

  it("counts distinct session appearances from stored profile episodes", () => {
    const model = buildHistoricalMarketIntelligence({ context: context(), symbol: "XYZ" });
    expect(model.distinctSessionAppearances).toBe(4);
    expect(model.lastAppearanceDate).toBe("2026-10-14");
    expect(model.lastRecordedVolume).toBe(8_200_000);
  });

  it("reports continuation with defensible denominators from match summary", () => {
    const ctx = context();
    const summary = summarizeHistoricalMatches(rankHistoricalMatches(currentSetup, ctx), {
      profileEpisodeCount: 4,
    });
    const model = buildHistoricalMarketIntelligence({
      context: ctx,
      matchSummary: summary,
      symbol: "XYZ",
    });
    expect(model.continuation.eligibleFollowUps).toBeGreaterThan(0);
    expect(model.continuation.summaryLine).toMatch(/next-session/i);
  });

  it("distinguishes unavailable history from zero episodes", () => {
    const empty = buildHistoricalMarketIntelligence({ context: null, symbol: "XYZ" });
    expect(empty.status).toBe("unavailable");
    expect(empty.distinctSessionAppearances).toBeNull();
    expect(empty.limitationLine).toMatch(/Missing stored historical records/i);
  });

  it("includes verified catalyst rows linked to episodes without inventing text", () => {
    const ctx = context({
      comparableHistory: {
        comparableEpisodeCount: 1,
        closestComparableEpisodes: [
          episode({
            episodeId: "e-cat",
            historicalEvents: [
              {
                eventType: "PRESS_RELEASE",
                title: "XYZ announces contract",
                publishedAt: "2026-10-13T12:00:00.000Z",
                temporalRelationship: "EVENT_PRECEDES_EPISODE",
                source: "Press release",
              },
            ],
          }),
        ],
        mostRecentComparableEpisode: null,
      },
    });
    const model = buildHistoricalMarketIntelligence({ context: ctx, symbol: "XYZ" });
    expect(model.verifiedCatalystEvents[0]?.title).toBe("XYZ announces contract");
    expect(model.verifiedCatalystEvents[0]?.label).toBe("Verified historical event");
  });

  it("normalizes symbol casing in output model", () => {
    const model = buildHistoricalMarketIntelligence({ context: context(), symbol: "xyz" });
    expect(model.symbol).toBe("XYZ");
  });

  it("preserves delayed-data disclosure on available models", () => {
    const model = buildHistoricalMarketIntelligence({ context: context(), symbol: "XYZ" });
    expect(model.delayDisclosure).toMatch(/15-minute delayed/i);
  });
});
