import { describe, expect, it, vi } from "vitest";
import { AI_ANALYST_HISTORICAL_MEMORY_BOUNDS } from "@/config/ai-analyst-historical.config";
import {
  assertHistoricalMemoryIsEvidenceOnly,
  boundHistoricalMemoryFactsForProvider,
  buildHistoricalMemoryFromRepeatMoverContext,
  serializeHistoricalMemoryForPrompt,
  unavailableHistoricalMemory,
} from "@/lib/ai-analyst/historical-memory";
import { fetchAnalystHistoricalMemory } from "@/lib/ai-analyst/fetch-analyst-historical-memory";
import { repeatMoverContextToAnalystFacts } from "@/lib/ai-analyst/repeat-mover-evidence-facts";
import { unavailableRepeatMoverProfileSnapshot } from "@/lib/repeat-movers/get-repeat-mover-context";
import type { RepeatMoverContext } from "@/types/repeat-mover";

const SECURITY_ID = "11111111-1111-4111-8111-111111111111";

function baseContext(overrides: Partial<RepeatMoverContext> = {}): RepeatMoverContext {
  return {
    version: "v1",
    securityId: SECURITY_ID,
    currentSymbol: "XYZ",
    currentContext: {
      observedSymbol: "XYZ",
      sessionDate: "2026-09-22",
      movePct: 10,
      volume: 1_000_000,
      rvol: 2,
      dollarVolume: null,
      direction: "POSITIVE",
      tier: "NOTABLE",
      recordedAt: null,
    },
    profile: {
      ...unavailableRepeatMoverProfileSnapshot(),
      profileAvailable: true,
      sampleSizeQuality: "ADEQUATE",
      sessionsObserved: 842,
      episodeCount: 12,
      notableCount: 8,
      significantCount: 3,
      extremeCount: 1,
      historyStartDate: "2022-01-01",
      historyEndDate: "2026-09-20",
      computedAt: "2026-09-21T12:00:00.000Z",
      latestSourceHistoryDate: "2026-09-20",
    },
    comparableHistory: {
      comparableEpisodeCount: 1,
      closestComparableEpisodes: [{
        episodeId: "ep-1",
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
      }],
      mostRecentComparableEpisode: null,
    },
    evidenceLabels: ["SIMILAR_PRIOR_EPISODES_FOUND"],
    assembledAt: "2026-09-22T20:00:00.000Z",
    ...overrides,
  };
}

describe("AI Analyst historical memory", () => {
  it("builds profile-available facts without zero-filling missing RVOL on profile", () => {
    const memory = buildHistoricalMemoryFromRepeatMoverContext(baseContext());
    expect(memory.profileAvailable).toBe(true);
    expect(memory.sessionsObserved).toBe(842);
    expect(memory.medianHistoricalRvol).toBeNull();
    expect(memory.closestComparableEpisodes[0]?.rvol).toBe(4.2);
    assertHistoricalMemoryIsEvidenceOnly(memory);
  });

  it("marks unavailable when profile missing", () => {
    const memory = buildHistoricalMemoryFromRepeatMoverContext(
      baseContext({
        profile: unavailableRepeatMoverProfileSnapshot(),
        evidenceLabels: ["NO_HISTORY"],
      }),
    );
    expect(memory.profileAvailable).toBe(false);
    expect(memory.episodeCount).toBeNull();
  });

  it("returns unavailable shell when context is null", () => {
    const memory = unavailableHistoricalMemory("ABC");
    expect(memory.contextLoaded).toBe(false);
    expect(memory.episodeCount).toBeNull();
  });

  it("serializes historicalMemory wrapper for chat prompt injection", () => {
    const json = serializeHistoricalMemoryForPrompt(
      buildHistoricalMemoryFromRepeatMoverContext(baseContext()),
    );
    expect(json).toContain('"historicalMemory"');
    expect(json).toContain('"historicalProfile"');
    expect(json.length).toBeLessThanOrEqual(AI_ANALYST_HISTORICAL_MEMORY_BOUNDS.maxSerializedChars);
    expect(json).not.toMatch(/probability|confidence|winRate/i);
  });

  it("maps observedForwardOutcomes on comparables when present", () => {
    const memory = buildHistoricalMemoryFromRepeatMoverContext(baseContext({
      comparableHistory: {
        comparableEpisodeCount: 1,
        closestComparableEpisodes: [{
          ...baseContext().comparableHistory.closestComparableEpisodes[0]!,
          observedForwardOutcomes: {
            closeToCloseReturnPct: { D1: 2.5 },
            highExcursionPct: {},
            lowExcursionPct: {},
            closePosition: {},
            nextSession: null,
          },
        }],
        mostRecentComparableEpisode: null,
      },
    }));
    expect(memory.closestComparableEpisodes[0]?.observedForwardOutcomes?.closeToCloseReturnPct?.D1).toBe(2.5);
  });

  it("missing optional metrics stay null in memory, not zero-filled", () => {
    const memory = unavailableHistoricalMemory("ZZZ");
    expect(memory.episodeCount).toBeNull();
    expect(memory.medianD1ReturnPct).toBeNull();
    expect(boundHistoricalMemoryFactsForProvider(memory).additionalVerifiedEpisodesWithoutDetail).toBeNull();
  });

  it("repeatMoverContextToAnalystFacts delegates to full historical memory", () => {
    const facts = repeatMoverContextToAnalystFacts(baseContext());
    expect(facts?.comparableEpisodeCount).toBe(1);
    expect(facts?.closestComparableEpisodes[0]?.sessionDate).toBe("2025-08-14");
  });

  it("fetch fails soft on bridge error", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    const memory = await fetchAnalystHistoricalMemory({
      symbol: "XYZ",
      accessToken: "token",
      fetchImpl: async () => ({ ok: false, status: 502 } as Response),
    });
    expect(memory.contextLoaded).toBe(false);
    expect(memory.symbol).toBe("XYZ");
  });

  it("reuses preloaded radar context without fetch", async () => {
    const memory = await fetchAnalystHistoricalMemory({
      symbol: "XYZ",
      preloadedContext: baseContext(),
    });
    expect(memory.contextLoaded).toBe(true);
    expect(memory.profileAvailable).toBe(true);
  });

  it("handles partial history and null continuation on comparables", () => {
    const memory = buildHistoricalMemoryFromRepeatMoverContext(baseContext({
      profile: {
        ...unavailableRepeatMoverProfileSnapshot(),
        profileAvailable: true,
        sampleSizeQuality: "LIMITED",
        sessionsObserved: 3,
        episodeCount: 1,
      },
      comparableHistory: {
        comparableEpisodeCount: 1,
        closestComparableEpisodes: [{
          episodeId: "ep-2",
          sessionDate: "2024-01-02",
          tier: "NOTABLE",
          direction: "POSITIVE",
          movePct: 5,
          volume: null,
          rvol: null,
          dollarVolume: null,
          closePosition: null,
          nextSessionMovePct: null,
          nextSessionContinuation: null,
          similarity: { sameDirection: true, sameTier: true, movePctDelta: 1 },
        }],
        mostRecentComparableEpisode: null,
      },
    }));
    expect(memory.sampleSizeQuality).toBe("LIMITED");
    expect(memory.closestComparableEpisodes[0]?.rvol).toBeNull();
    expect(memory.closestComparableEpisodes[0]?.nextSessionContinuation).toBeNull();
  });
});
