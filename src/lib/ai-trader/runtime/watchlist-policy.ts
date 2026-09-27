import type { MarketCandidate } from "@/lib/ai-trader/market/candidate";
import {
  assertSprint3AEngineState,
  canTransitionWatchlistState,
  type AiTraderWatchlistItem,
} from "@/lib/ai-trader/domain/watchlist";
import { SHADOW_RUNTIME_CONFIG } from "@/lib/ai-trader/runtime/config";
import type { WatchlistProposal } from "@/lib/ai-trader/market/watchlist-engine";

/**
 * Conservative Shadow progression. HIGH_PRIORITY uses Radar sourceRank only.
 * HIGH_PRIORITY means important for observation, not buy/enter/order-ready.
 */
export function proposeShadowWatchlistChanges(
  eligible: readonly MarketCandidate[],
  existingItems: readonly AiTraderWatchlistItem[],
): readonly WatchlistProposal[] {
  const bySymbol = new Map(existingItems.map((item) => [item.symbol, item]));
  const onBoard = new Set(eligible.map((candidate) => candidate.symbol));
  const proposals: WatchlistProposal[] = [];

  for (const candidate of eligible) {
    const existing = bySymbol.get(candidate.symbol);
    const next = nextOnBoardState(existing, candidate.sourceRank);
    if (!next) continue;
    const guarded = assertSprint3AEngineState(next);
    if (existing?.state === guarded) continue;
    if (existing && !canTransitionWatchlistState(existing.state, guarded)) continue;
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
    if (item.state === "ENTRY_READY" || item.state === "POSITION_OPEN" || item.state === "EXITED") {
      continue;
    }
    const next =
      item.state === "WATCHING" || item.state === "HIGH_PRIORITY"
        ? "COOLDOWN"
        : item.state === "COOLDOWN" || item.state === "REMOVED"
          ? item.state
          : "REMOVED";
    if (next === item.state) continue;
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

function nextOnBoardState(
  existing: AiTraderWatchlistItem | undefined,
  sourceRank: number,
): ReturnType<typeof assertSprint3AEngineState> | null {
  if (!existing) return "DISCOVERED";
  if (existing.state === "ENTRY_READY" || existing.state === "POSITION_OPEN" || existing.state === "EXITED") {
    throw new Error("Sprint 3C cannot advance a trading-state watchlist item");
  }
  if (existing.state === "REMOVED") return "DISCOVERED";
  if (existing.state === "COOLDOWN") return "WATCHING";
  if (existing.state === "DISCOVERED") return "RESEARCHING";
  if (existing.state === "RESEARCHING") return "WATCHING";
  if (existing.state === "WATCHING") {
    return sourceRank <= SHADOW_RUNTIME_CONFIG.highPriorityMaxSourceRank ? "HIGH_PRIORITY" : "WATCHING";
  }
  if (existing.state === "HIGH_PRIORITY") return "HIGH_PRIORITY";
  return assertSprint3AEngineState(existing.state);
}
