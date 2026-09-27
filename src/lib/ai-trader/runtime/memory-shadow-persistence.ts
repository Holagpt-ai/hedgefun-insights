import type { AiTraderObservation } from "@/lib/ai-trader/domain/memory";
import type { AiTraderWatchlistItem } from "@/lib/ai-trader/domain/watchlist";
import { assertSprint3AEngineState } from "@/lib/ai-trader/domain/watchlist";
import {
  buildWatchlistTransitionIdempotencyKey,
  simulateWatchlistTransitionRpc,
  type InMemoryWatchlistTransitionStore,
} from "@/lib/ai-trader/domain/watchlist-transition-rpc";
import { cooldownUntilFrom } from "@/lib/ai-trader/runtime/aging";
import type {
  ShadowPersistence,
  ShadowWatchlistChangeRequest,
  ShadowWriteCounts,
} from "@/lib/ai-trader/runtime/shadow-persistence";
import { emptyShadowWriteCounts } from "@/lib/ai-trader/runtime/shadow-persistence";

export function createMemoryShadowPersistence(
  seed: readonly AiTraderWatchlistItem[] = [],
): ShadowPersistence & {
  counts: ShadowWriteCounts;
  items: AiTraderWatchlistItem[];
  store: InMemoryWatchlistTransitionStore;
} {
  const store: InMemoryWatchlistTransitionStore = {
    items: [...seed],
    transitions: [],
  };
  const contextHashes = new Set<string>();
  const observationKeys = new Set<string>();
  const counts = emptyShadowWriteCounts();

  return {
    counts,
    items: store.items,
    store,
    async listWatchlistItems() {
      return store.items;
    },
    async persistWatchlistChange(proposal: ShadowWatchlistChangeRequest, occurredAt: string) {
      const nextState = assertSprint3AEngineState(proposal.nextState);
      const idempotencyKey = buildWatchlistTransitionIdempotencyKey({
        symbol: proposal.symbol,
        priorState: proposal.priorState,
        newState: nextState,
        cycleId: proposal.cycleId,
        policyVersion: proposal.policyVersion,
        contextSnapshotId: proposal.contextSnapshotId,
        sourceObservationIdentity: proposal.sourceObservationIdentity,
      });
      const result = simulateWatchlistTransitionRpc(store, {
        symbol: proposal.symbol,
        newState: nextState,
        expectedPriorState: proposal.priorState,
        idempotencyKey,
        occurredAt,
        sourceRank: proposal.sourceRank,
        source: proposal.source,
        sourceSession: proposal.sourceSession,
        reasonCodes: proposal.reasonCodes,
        evidenceIds: [],
        contextSnapshotId: proposal.contextSnapshotId ?? null,
        actorType: "SYSTEM",
        catalystRefs: proposal.catalystRefs,
        marketEvidenceRefs: proposal.marketEvidenceRefs,
        cooldownUntil: nextState === "COOLDOWN" ? cooldownUntilFrom(Date.parse(occurredAt)) : null,
      });
      if (result.status === "NO_CHANGE") return result.transitionId ? "duplicate" : "unchanged";
      if (result.status === "CONFLICT") return "conflict";
      if (result.status !== "APPLIED") {
        throw new Error(result.message ?? result.status);
      }
      counts.transitionWrites += 1;
      counts.watchlistWrites += 1;
      return proposal.priorState == null ? "inserted" : "updated";
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
