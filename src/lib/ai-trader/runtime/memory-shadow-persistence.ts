import type { AiTraderObservation } from "@/lib/ai-trader/domain/memory";
import type { AiTraderWatchlistItem } from "@/lib/ai-trader/domain/watchlist";
import { assertSprint3AEngineState } from "@/lib/ai-trader/domain/watchlist";
import type { WatchlistProposal } from "@/lib/ai-trader/market/watchlist-engine";
import type { ShadowPersistence, ShadowWriteCounts } from "@/lib/ai-trader/runtime/shadow-persistence";
import { emptyShadowWriteCounts } from "@/lib/ai-trader/runtime/shadow-persistence";
import { cooldownUntilFrom } from "@/lib/ai-trader/runtime/aging";

export function createMemoryShadowPersistence(
  seed: readonly AiTraderWatchlistItem[] = [],
): ShadowPersistence & { counts: ShadowWriteCounts; items: AiTraderWatchlistItem[] } {
  const items = [...seed];
  const transitionKeys = new Set<string>();
  const contextHashes = new Set<string>();
  const observationKeys = new Set<string>();
  const counts = emptyShadowWriteCounts();

  return {
    counts,
    items,
    async listWatchlistItems() {
      return items;
    },
    async persistWatchlistChange(proposal: WatchlistProposal, occurredAt: string) {
      const nextState = assertSprint3AEngineState(proposal.nextState);
      const existing = items.find((item) => item.symbol === proposal.symbol);
      if (existing?.state === nextState) return "unchanged";
      const key = `${proposal.symbol}:${proposal.priorState}:${nextState}:${occurredAt}`;
      if (transitionKeys.has(key)) return "duplicate";
      transitionKeys.add(key);
      counts.transitionWrites += 1;
      if (!existing) {
        items.push({
          id: `wl-${proposal.symbol}`,
          symbol: proposal.symbol,
          securityId: null,
          assetClass: "US_EQUITY",
          state: nextState,
          discoveredAt: occurredAt,
          lastEvaluatedAt: occurredAt,
          currentPriority: proposal.sourceRank,
          source: proposal.source,
          sourceRank: proposal.sourceRank,
          sourceSession: proposal.sourceSession,
          contextSnapshotId: null,
          catalystRefs: proposal.catalystRefs,
          marketEvidenceRefs: proposal.marketEvidenceRefs,
          reasonCodes: proposal.reasonCodes,
          confidence: null,
          expiresAt: null,
          cooldownUntil: nextState === "COOLDOWN" ? cooldownUntilFrom(Date.parse(occurredAt)) : null,
          createdAt: occurredAt,
          updatedAt: occurredAt,
        });
        counts.watchlistWrites += 1;
        return "inserted";
      }
      existing.state = nextState;
      existing.lastEvaluatedAt = occurredAt;
      existing.sourceRank = proposal.sourceRank;
      existing.currentPriority = proposal.sourceRank;
      existing.reasonCodes = proposal.reasonCodes;
      existing.updatedAt = occurredAt;
      counts.watchlistWrites += 1;
      return "updated";
    },
    async upsertContextSnapshot(input) {
      if (contextHashes.has(`${input.contextHash}:${input.schemaVersion}`)) return "reused";
      contextHashes.add(`${input.contextHash}:${input.schemaVersion}`);
      counts.contextWrites += 1;
      return "inserted";
    },
    async recordObservation(_observation: AiTraderObservation, sourceEventKey: string) {
      if (observationKeys.has(sourceEventKey)) return "duplicate";
      observationKeys.add(sourceEventKey);
      counts.observationWrites += 1;
      return "inserted";
    },
  };
}
