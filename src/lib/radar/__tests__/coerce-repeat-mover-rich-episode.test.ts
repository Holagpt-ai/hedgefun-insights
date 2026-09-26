import { describe, expect, it } from "vitest";
import { mergeHistoricalContextBatchIntoRows } from "@/lib/radar/apply-radar-historical-context";
import { coerceRepeatMoverContextForDisplay } from "@/lib/radar/coerce-repeat-mover-context-for-display";
import {
  boundHistoricalMemoryFactsForProvider,
  buildHistoricalMemoryFromRepeatMoverContext,
} from "@/lib/ai-analyst/historical-memory";
import { unavailableRepeatMoverProfileSnapshot } from "@/lib/repeat-movers/get-repeat-mover-context";

const SECURITY_ID = "11111111-1111-4111-8111-111111111111";

function richBridgeEpisode(overrides: Record<string, unknown> = {}) {
  return {
    episodeId: "ep-rich",
    sessionDate: "2025-08-14",
    tier: "NOTABLE",
    direction: "POSITIVE",
    movePct: 18.4,
    volume: 2_000_000,
    rvol: 4.2,
    dollarVolume: null,
    closePosition: 0.92,
    nextSessionMovePct: 3.1,
    nextSessionContinuation: true,
    similarity: { sameDirection: true, sameTier: true, movePctDelta: 1.4 },
    observedIntradayReconstruction: {
      completenessState: "COMPLETE",
      hodAt: "2025-08-14T15:30:00.000Z",
      closeVsHodPct: -8,
      largestPullbackPct: 12,
      recoveredFromPullback: false,
      haltCount: 0,
      vwapReclaimCount: 2,
      largestVolumeBurstAt: "2025-08-14T10:05:00.000Z",
    },
    historicalEvents: [{
      eventType: "EARNINGS",
      title: "Q2 results",
      publishedAt: "2025-08-13T20:00:00.000Z",
      temporalRelationship: "EVENT_PRECEDES_EPISODE",
      source: "polygon",
    }],
    observedForwardOutcomes: {
      closeToCloseReturnPct: { D1: 3.1, D5: -1.2 },
      nextSession: {
        nextSessionAvailable: true,
        nextSessionReturnPct: 3.1,
        nextSessionHighExcursionPct: 5,
        nextSessionLowExcursionPct: -2,
        nextSessionClosePosition: 0.8,
        nextSessionVolume: 1_500_000,
        nextSessionRvol: 3,
        nextSessionContinuation: true,
        episodeDirection: "POSITIVE",
      },
    },
    ...overrides,
  };
}

function baseBridgePayload(episode: unknown) {
  return {
    securityId: SECURITY_ID,
    currentSymbol: "XYZ",
    profile: { profileAvailable: true, episodeCount: 7 },
    comparableHistory: {
      comparableEpisodeCount: 1,
      closestComparableEpisodes: [episode],
      mostRecentComparableEpisode: episode,
    },
    evidenceLabels: ["SIMILAR_PRIOR_EPISODES_FOUND"],
    assembledAt: "2026-09-22T20:00:00.000Z",
  };
}

describe("coerceRepeatMoverContextForDisplay rich episode preservation", () => {
  it("preserves valid observedIntradayReconstruction", () => {
    const coerced = coerceRepeatMoverContextForDisplay(baseBridgePayload(richBridgeEpisode()));
    const episode = coerced?.comparableHistory.closestComparableEpisodes[0];
    expect(episode?.observedIntradayReconstruction?.closeVsHodPct).toBe(-8);
    expect(episode?.observedIntradayReconstruction?.completenessState).toBe("COMPLETE");
  });

  it("preserves valid historicalEvents", () => {
    const coerced = coerceRepeatMoverContextForDisplay(baseBridgePayload(richBridgeEpisode()));
    expect(coerced?.comparableHistory.closestComparableEpisodes[0]?.historicalEvents).toHaveLength(1);
    expect(coerced?.comparableHistory.closestComparableEpisodes[0]?.historicalEvents?.[0]?.title).toBe("Q2 results");
  });

  it("preserves valid observedForwardOutcomes", () => {
    const coerced = coerceRepeatMoverContextForDisplay(baseBridgePayload(richBridgeEpisode()));
    const outcomes = coerced?.comparableHistory.closestComparableEpisodes[0]?.observedForwardOutcomes;
    expect(outcomes?.closeToCloseReturnPct?.D1).toBe(3.1);
    expect(outcomes?.nextSession?.nextSessionContinuation).toBe(true);
  });

  it("drops malformed rich objects without rejecting the episode core", () => {
    const coerced = coerceRepeatMoverContextForDisplay(baseBridgePayload(richBridgeEpisode({
      observedIntradayReconstruction: { completenessState: "NOT_A_STATE" },
      historicalEvents: [{ eventType: "INVALID", title: "", temporalRelationship: "NOPE" }],
      observedForwardOutcomes: { closeToCloseReturnPct: "bad" },
    })));
    const episode = coerced?.comparableHistory.closestComparableEpisodes[0];
    expect(episode?.episodeId).toBe("ep-rich");
    expect(episode?.movePct).toBe(18.4);
    expect(episode?.observedIntradayReconstruction).toBeUndefined();
    expect(episode?.historicalEvents).toBeUndefined();
    expect(episode?.observedForwardOutcomes).toBeUndefined();
  });

  it("keeps episode core fields unchanged", () => {
    const coerced = coerceRepeatMoverContextForDisplay(baseBridgePayload(richBridgeEpisode()));
    const episode = coerced?.comparableHistory.closestComparableEpisodes[0];
    expect(episode).toMatchObject({
      episodeId: "ep-rich",
      sessionDate: "2025-08-14",
      tier: "NOTABLE",
      direction: "POSITIVE",
      movePct: 18.4,
      rvol: 4.2,
      nextSessionContinuation: true,
    });
  });

  it("Radar merge → AI memory includes rich history for a historical ticker", () => {
    const merged = mergeHistoricalContextBatchIntoRows(
      [{ symbol: "XYZ" } as never],
      {
        results: [{
          symbol: "XYZ",
          securityId: SECURITY_ID,
          historicalContext: baseBridgePayload(richBridgeEpisode()) as never,
        }],
      },
    );
    const memory = buildHistoricalMemoryFromRepeatMoverContext(merged[0]?.historicalContext ?? null, "XYZ");
    expect(memory.profileAvailable).toBe(true);
    expect(memory.episodeCount).toBe(7);
    expect(memory.closestComparableEpisodes[0]?.observedForwardOutcomes?.closeToCloseReturnPct?.D1).toBe(3.1);
    expect(memory.closestComparableEpisodes[0]?.historicalEvents).toHaveLength(1);
    expect(memory.closestComparableEpisodes[0]?.observedIntradayReconstruction?.closeVsHodPct).toBe(-8);
  });

  it("zero-history ticker remains honest", () => {
    const coerced = coerceRepeatMoverContextForDisplay({
      securityId: SECURITY_ID,
      profile: { ...unavailableRepeatMoverProfileSnapshot(), profileAvailable: false },
      comparableHistory: { comparableEpisodeCount: 0, closestComparableEpisodes: [] },
    });
    const memory = buildHistoricalMemoryFromRepeatMoverContext(coerced, "NEW");
    expect(memory.profileAvailable).toBe(false);
    expect(memory.episodeCount).toBeNull();
    expect(memory.closestComparableEpisodes).toHaveLength(0);
  });

  it("episodeCount greater than loaded comparables is represented correctly", () => {
    const coerced = coerceRepeatMoverContextForDisplay({
      securityId: SECURITY_ID,
      profile: { profileAvailable: true, episodeCount: 12 },
      comparableHistory: {
        comparableEpisodeCount: 1,
        closestComparableEpisodes: [richBridgeEpisode()],
      },
    });
    const memory = buildHistoricalMemoryFromRepeatMoverContext(coerced, "XYZ");
    expect(memory.episodeCount).toBe(12);
    expect(memory.loadedComparableEpisodeDetailCount).toBe(1);
    expect(memory.additionalVerifiedEpisodesWithoutDetail).toBe(11);
  });

  it("bounded formatter does not exceed deterministic episode/event limits", () => {
    const episodes = Array.from({ length: 12 }, (_, index) => richBridgeEpisode({
      episodeId: `ep-${index}`,
      historicalEvents: Array.from({ length: 5 }, (_, eventIndex) => ({
        eventType: "EARNINGS",
        title: `Event ${eventIndex}`,
        publishedAt: null,
        temporalRelationship: "EVENT_PRECEDES_EPISODE",
        source: null,
      })),
    }));
    const coerced = coerceRepeatMoverContextForDisplay({
      securityId: SECURITY_ID,
      profile: { profileAvailable: true, episodeCount: 50 },
      comparableHistory: { comparableEpisodeCount: 12, closestComparableEpisodes: episodes },
    });
    const memory = buildHistoricalMemoryFromRepeatMoverContext(coerced, "XYZ");
    const bounded = boundHistoricalMemoryFactsForProvider(memory);
    expect(bounded.closestComparableEpisodes.length).toBeLessThanOrEqual(10);
    for (const episode of bounded.closestComparableEpisodes) {
      expect(episode.historicalEvents.length).toBeLessThanOrEqual(3);
    }
  });

  it("malformed bridge payload for one ticker coerces to null without breaking merge", () => {
    const merged = mergeHistoricalContextBatchIntoRows(
      [{ symbol: "BAD" } as never, { symbol: "GOOD" } as never],
      {
        results: [
          { symbol: "BAD", securityId: SECURITY_ID, historicalContext: { profile: { profileAvailable: true } } as never },
          {
            symbol: "GOOD",
            securityId: SECURITY_ID,
            historicalContext: baseBridgePayload(richBridgeEpisode()) as never,
          },
        ],
      },
    );
    expect(merged[0]?.historicalContext).toBeNull();
    expect(merged[1]?.historicalContext?.comparableHistory.closestComparableEpisodes[0]?.observedForwardOutcomes).toBeDefined();
  });
});
