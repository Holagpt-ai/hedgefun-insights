import type { MarketCandidate } from "@/lib/ai-trader/market/candidate";
import {
  assertSprint3AEngineState,
  canTransitionWatchlistState,
  type AiTraderWatchlistItem,
  type AiTraderWatchlistSprint3AState,
} from "@/lib/ai-trader/domain/watchlist";
import { isHighPriorityObservation } from "@/lib/ai-trader/runtime/observation-policy";

export interface WatchlistProposal {
  symbol: string;
  priorState: AiTraderWatchlistItem["state"] | null;
  nextState: AiTraderWatchlistSprint3AState;
  sourceRank: number;
  source: string;
  sourceSession: string | null;
  reasonCodes: readonly string[];
  catalystRefs: readonly unknown[];
  marketEvidenceRefs: readonly unknown[];
}

function proposeNextState(
  existing: AiTraderWatchlistItem | undefined,
  onBoard: boolean,
  sourceRank: number,
): AiTraderWatchlistSprint3AState | null {
  if (!existing) return onBoard ? "DISCOVERED" : null;
  if (existing.state === "ENTRY_READY" || existing.state === "POSITION_OPEN" || existing.state === "EXITED") {
    throw new Error("Sprint 3A engine cannot advance a trading-state watchlist item");
  }
  if (!onBoard) {
    if (existing.state === "WATCHING" || existing.state === "HIGH_PRIORITY") return "COOLDOWN";
    if (existing.state === "COOLDOWN" || existing.state === "REMOVED") return existing.state;
    return "REMOVED";
  }
  if (existing.state === "REMOVED") return "DISCOVERED";
  if (existing.state === "COOLDOWN") return "WATCHING";
  if (existing.state === "DISCOVERED") return "RESEARCHING";
  if (existing.state === "RESEARCHING") return "WATCHING";
  if (existing.state === "WATCHING") {
    return isHighPriorityObservation(sourceRank) ? "HIGH_PRIORITY" : "WATCHING";
  }
  if (existing.state === "HIGH_PRIORITY") return "HIGH_PRIORITY";
  return assertSprint3AEngineState(existing.state);
}

export function proposeWatchlistTransitions(
  candidates: readonly MarketCandidate[],
  existingItems: readonly AiTraderWatchlistItem[],
): readonly WatchlistProposal[] {
  const bySymbol = new Map(existingItems.map((item) => [item.symbol, item]));
  const onBoard = new Set(candidates.map((candidate) => candidate.symbol));
  const proposals: WatchlistProposal[] = [];

  for (const candidate of candidates) {
    const existing = bySymbol.get(candidate.symbol);
    const next = proposeNextState(existing, true, candidate.sourceRank);
    if (!next) continue;
    const guarded = assertSprint3AEngineState(next);
    if (existing && !canTransitionWatchlistState(existing.state, guarded) && existing.state !== guarded) {
      continue;
    }
    if (existing?.state === guarded) continue;
    proposals.push({
      symbol: candidate.symbol,
      priorState: existing?.state ?? null,
      nextState: guarded,
      sourceRank: candidate.sourceRank,
      source: candidate.source,
      sourceSession: candidate.sourceSession,
      reasonCodes: existing ? [`PROMOTE_${existing.state}_TO_${guarded}`] : ["DISCOVERED_FROM_RADAR"],
      catalystRefs: candidate.catalystRefs,
      marketEvidenceRefs: [
        {
          table: candidate.provenance.table,
          generationId: candidate.provenance.generationId,
          sourceRank: candidate.sourceRank,
        },
      ],
    });
  }

  for (const item of existingItems) {
    if (onBoard.has(item.symbol)) continue;
    const next = proposeNextState(item, false, item.sourceRank);
    if (!next || next === item.state) continue;
    const guarded = assertSprint3AEngineState(next);
    if (!canTransitionWatchlistState(item.state, guarded)) continue;
    proposals.push({
      symbol: item.symbol,
      priorState: item.state,
      nextState: guarded,
      sourceRank: item.sourceRank,
      source: item.source,
      sourceSession: item.sourceSession,
      reasonCodes: [`ABSENT_FROM_RADAR_${guarded}`],
      catalystRefs: item.catalystRefs,
      marketEvidenceRefs: item.marketEvidenceRefs,
    });
  }

  return proposals;
}
