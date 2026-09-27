import type { ExperienceEngine } from "@/lib/ai-trader/memory/experience-engine";
import type { MemoryProvider } from "@/lib/ai-trader/providers/memory-provider";

export function createPostgresExperienceEngine(provider: MemoryProvider): ExperienceEngine {
  return {
    recordObservation: (input) => provider.recordObservation(input),
    recordEpisode: (input) => provider.recordEpisode(input),
    async recordDecisionOutcome(input) {
      const result = await provider.recordEpisode(input.episode);
      return { id: result.id };
    },
    async recordTradeOutcome(input) {
      const result = await provider.recordEpisode(input.episode);
      return { id: result.id };
    },
    async recordPassedOpportunity(input) {
      const result = await provider.recordEpisode(input.episode);
      return { id: result.id };
    },
    async recordRiskRejection(input) {
      const result = await provider.recordEpisode(input.episode);
      return { id: result.id };
    },
    async recordWatchlistOutcome(input) {
      const result = await provider.recordEpisode(input.episode);
      return { id: result.id };
    },
  };
}
