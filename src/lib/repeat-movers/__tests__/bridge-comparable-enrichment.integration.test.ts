import { describe, expect, it } from "vitest";
import { buildHistoricalMemoryFromRepeatMoverContext } from "@/lib/ai-analyst/historical-memory";
import { attachHistoricalEventsFromStore } from "@/lib/episode-event-linkage/attach-events-to-comparables";
import { attachForwardOutcomesFromStore } from "@/lib/forward-outcomes/attach-forward-outcomes-to-comparables";
import { attachIntradayReconstructionToComparables } from "@/lib/intraday-reconstruction/attach-intraday-to-comparables";
import { coerceRepeatMoverContextForDisplay } from "@/lib/radar/coerce-repeat-mover-context-for-display";
import { unavailableRepeatMoverProfileSnapshot } from "@/lib/repeat-movers/get-repeat-mover-context";
import type { RepeatMoverComparableEpisode } from "@/types/repeat-mover";

const SECURITY_ID = "11111111-1111-4111-8111-111111111111";
const EPISODE_ID = "22222222-2222-4222-8222-222222222222";

function baseComparable(): RepeatMoverComparableEpisode {
  return {
    episodeId: EPISODE_ID,
    sessionDate: "2025-08-14",
    tier: "NOTABLE",
    direction: "POSITIVE",
    movePct: 10,
    volume: 1_000_000,
    rvol: 2,
    dollarVolume: null,
    closePosition: 0.8,
    nextSessionMovePct: null,
    nextSessionContinuation: null,
    similarity: { sameDirection: true, sameTier: true, movePctDelta: 1 },
  };
}

/** Mirrors production bridge enrichment order on comparable episodes. */
function enrichBridgeComparables(episodes: RepeatMoverComparableEpisode[]) {
  let enriched = attachForwardOutcomesFromStore(episodes, [{
    episodeId: EPISODE_ID,
    securityId: SECURITY_ID,
    horizonKey: "D1",
    horizon: "D1",
    availabilityState: "AVAILABLE",
    dataAvailable: true,
    episodeSessionDate: "2025-08-14",
    horizonSessionDate: "2025-08-15",
    referencePrice: 10,
    referenceTimestamp: null,
    outcomePrice: 10.3,
    returnPct: 3,
    openToCloseReturnPct: null,
    gapPct: null,
    maxGainPct: 4,
    maxDrawdownPct: -1,
    highPrice: null,
    lowPrice: null,
    sessionVolume: 100,
    rvol: 2,
    horizonSessionMovePct: 3,
    closePosition: 0.7,
    closedAboveEpisodeClose: true,
    closedBelowEpisodeClose: false,
    exceededEpisodeHigh: false,
    brokeEpisodeLow: false,
  }]);
  enriched = attachIntradayReconstructionToComparables(enriched, [{
    episode_id: EPISODE_ID,
    completeness_state: "COMPLETE",
    close_vs_hod_pct: -6,
    hod_at: "2025-08-14T15:30:00.000Z",
  }]);
  enriched = attachHistoricalEventsFromStore(
    enriched,
    [{
      linkId: "33333333-3333-4333-8333-333333333333",
      eventId: "44444444-4444-4444-8444-444444444444",
      episodeId: EPISODE_ID,
      securityId: SECURITY_ID,
      relationType: "PRECEDES_EPISODE",
      timeDeltaSeconds: 3600,
      timeDeltaMinutes: 60,
      confidence: null,
      evidence: null,
      provenance: "DERIVED",
      source: "polygon",
      sourceAsOf: null,
      createdAt: "2025-08-14T00:00:00.000Z",
    }],
    [{
      eventId: "44444444-4444-4444-8444-444444444444",
      securityId: SECURITY_ID,
      observedSymbol: "XYZ",
      eventType: "EARNINGS",
      title: "Q2 results",
      summary: null,
      publishedAt: "2025-08-13T20:00:00.000Z",
      eventAt: "2025-08-13T20:00:00.000Z",
      source: "polygon",
      sourceUrl: null,
      providerEventId: null,
      accessionId: null,
      metadata: null,
      quality: "DERIVED",
      freshness: "UNKNOWN",
      provenance: "PROVIDER",
      sourceAsOf: null,
      fetchedAt: null,
      computedAt: null,
      createdAt: "2025-08-14T00:00:00.000Z",
    }],
  );
  return enriched;
}

describe("bridge comparable enrichment integration", () => {
  it("coercion preserves enriched bridge payload and AI memory receives rich history", () => {
    const enriched = enrichBridgeComparables([baseComparable()]);
    const coerced = coerceRepeatMoverContextForDisplay({
      securityId: SECURITY_ID,
      currentSymbol: "XYZ",
      profile: { ...unavailableRepeatMoverProfileSnapshot(), profileAvailable: true, episodeCount: 5 },
      comparableHistory: {
        comparableEpisodeCount: 1,
        closestComparableEpisodes: enriched,
        mostRecentComparableEpisode: enriched[0],
      },
      evidenceLabels: ["SIMILAR_PRIOR_EPISODES_FOUND"],
      assembledAt: "2026-09-26T00:00:00.000Z",
    });
    const memory = buildHistoricalMemoryFromRepeatMoverContext(coerced, "XYZ");
    expect(memory.closestComparableEpisodes[0]?.observedForwardOutcomes?.closeToCloseReturnPct?.D1).toBe(3);
    expect(memory.closestComparableEpisodes[0]?.observedIntradayReconstruction?.closeVsHodPct).toBe(-6);
    expect(memory.closestComparableEpisodes[0]?.historicalEvents).toHaveLength(1);
  });

  it("missing optional enrichment remains absent after coercion", () => {
    const coerced = coerceRepeatMoverContextForDisplay({
      securityId: SECURITY_ID,
      profile: { profileAvailable: true, episodeCount: 1 },
      comparableHistory: {
        comparableEpisodeCount: 1,
        closestComparableEpisodes: [baseComparable()],
      },
    });
    const episode = coerced?.comparableHistory.closestComparableEpisodes[0];
    expect(episode?.observedIntradayReconstruction).toBeUndefined();
    expect(episode?.historicalEvents).toBeUndefined();
    expect(episode?.observedForwardOutcomes).toBeUndefined();
  });
});
