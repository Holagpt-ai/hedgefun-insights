import type { AiTraderWatchlistItem } from "@/lib/ai-trader/domain/watchlist";
import type { AiTraderObservation } from "@/lib/ai-trader/domain/memory";
import type { WatchlistProposal } from "@/lib/ai-trader/market/watchlist-engine";

export interface ShadowWriteCounts {
  watchlistWrites: number;
  transitionWrites: number;
  contextWrites: number;
  observationWrites: number;
  sessionWrites: number;
  userWatchlistWrites: number;
}

export interface ShadowPersistence {
  listWatchlistItems(): Promise<readonly AiTraderWatchlistItem[]>;
  persistWatchlistChange(proposal: WatchlistProposal, occurredAt: string): Promise<"inserted" | "updated" | "unchanged" | "duplicate">;
  upsertContextSnapshot(input: {
    symbol: string;
    observedAt: string;
    marketSession: string;
    operatingMode: string;
    contextHash: string;
    schemaVersion: string;
    marketState: Record<string, unknown>;
    stocksistSignals: Record<string, unknown>;
    catalystRefs: unknown;
    historicalRefs: unknown;
    sourceProvenance: unknown;
    quoteTimestamp?: string | null;
  }): Promise<"inserted" | "reused">;
  recordObservation(observation: AiTraderObservation, sourceEventKey: string): Promise<"inserted" | "duplicate">;
}

export function emptyShadowWriteCounts(): ShadowWriteCounts {
  return {
    watchlistWrites: 0,
    transitionWrites: 0,
    contextWrites: 0,
    observationWrites: 0,
    sessionWrites: 0,
    userWatchlistWrites: 0,
  };
}
