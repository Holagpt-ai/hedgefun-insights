import { describe, expect, it } from "vitest";
import { boundRetrievedBundle } from "@/lib/ai-trader/memory/retrieval-engine";
import { MEMORY_RETRIEVAL_LIMITS } from "@/lib/ai-trader/memory/retrieval-limits";
import {
  combineRetrievalScore,
  isEligibleAt,
  rankMemories,
  recencyWeight,
  type RankedMemory,
} from "@/lib/ai-trader/memory/retrieval-ranking";

function memory(partial: Partial<RankedMemory> & Pick<RankedMemory, "memoryId" | "observedAt">): RankedMemory {
  return {
    kind: "OBSERVATION",
    sourceTable: "ai_trader_episodes",
    sourceId: partial.memoryId,
    relevanceInputs: {
      similarity: 0.8,
      recencyWeight: 0.5,
      evidenceQuality: 0.9,
      regimeSimilarity: 0.7,
      sampleReliability: 0.6,
    },
    combinedScore: 0.2,
    supersededBy: null,
    stale: false,
    payload: {},
    ...partial,
  };
}

describe("AI Trader retrieval ranking", () => {
  it("decays recency and refuses to score without similarity", () => {
    expect(recencyWeight(0, 10, 10)).toBeGreaterThan(recencyWeight(0, 30, 10));
    expect(
      combineRetrievalScore({
        similarity: null,
        recencyWeight: 1,
        evidenceQuality: 1,
        regimeSimilarity: 1,
        sampleReliability: 1,
      }),
    ).toBeNull();
    expect(
      combineRetrievalScore({
        similarity: 1,
        recencyWeight: 0.5,
        evidenceQuality: 1,
        regimeSimilarity: 1,
        sampleReliability: 1,
      }),
    ).toBe(0.5);
  });

  it("keeps superseded memories out of current retrieval and marks stale items", () => {
    expect(isEligibleAt("2026-09-10", "2026-08-01", "prof_2", "2026-09-01")).toBe(false);
    expect(isEligibleAt("2026-08-15", "2026-08-01", "prof_2", "2026-09-01")).toBe(true);
    const ranked = rankMemories([
      memory({ memoryId: "old", observedAt: "2026-08-01", combinedScore: 0.2 }),
      memory({ memoryId: "new", observedAt: "2026-09-01", combinedScore: 0.4, stale: true }),
    ]);
    expect(ranked[0]?.memoryId).toBe("new");
    expect(ranked[0]?.stale).toBe(true);
  });

  it("bounds retrieval context", () => {
    const episodes = Array.from({ length: 12 }, (_, i) =>
      memory({ memoryId: `ep_${i}`, observedAt: `2026-09-${String(i + 1).padStart(2, "0")}`, combinedScore: i }),
    );
    const bounded = boundRetrievedBundle({
      episodes,
      failureExamples: episodes,
      symbolProfiles: episodes,
      setupProfiles: episodes,
      regimeProfiles: episodes,
    });
    expect(bounded.episodes).toHaveLength(MEMORY_RETRIEVAL_LIMITS.maxEpisodes);
    expect(bounded.failureExamples).toHaveLength(MEMORY_RETRIEVAL_LIMITS.maxFailureExamples);
    expect(bounded.symbolProfiles).toHaveLength(MEMORY_RETRIEVAL_LIMITS.maxSymbolProfiles);
    expect(bounded.setupProfiles).toHaveLength(MEMORY_RETRIEVAL_LIMITS.maxSetupProfiles);
    expect(bounded.regimeProfiles).toHaveLength(MEMORY_RETRIEVAL_LIMITS.maxRegimeProfiles);
    expect(bounded.episodes[0]?.memoryId).toBe("ep_11");
  });
});
