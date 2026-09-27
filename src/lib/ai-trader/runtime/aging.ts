import type { AiTraderWatchlistItem } from "@/lib/ai-trader/domain/watchlist";
import { SHADOW_RUNTIME_CONFIG } from "@/lib/ai-trader/runtime/config";
import type { WatchlistProposal } from "@/lib/ai-trader/market/watchlist-engine";

export function applyCooldownExpiry(
  items: readonly AiTraderWatchlistItem[],
  nowMs: number,
): readonly WatchlistProposal[] {
  const proposals: WatchlistProposal[] = [];
  for (const item of items) {
    if (item.state !== "COOLDOWN") continue;
    const until = item.cooldownUntil ? Date.parse(item.cooldownUntil) : NaN;
    if (Number.isFinite(until) && nowMs >= until) {
      proposals.push({
        symbol: item.symbol,
        priorState: "COOLDOWN",
        nextState: "REMOVED",
        sourceRank: item.sourceRank,
        source: item.source,
        sourceSession: item.sourceSession,
        reasonCodes: ["COOLDOWN_EXPIRED"],
        catalystRefs: item.catalystRefs,
        marketEvidenceRefs: item.marketEvidenceRefs,
      });
    }
  }
  return proposals;
}

export function cooldownUntilFrom(nowMs: number): string {
  return new Date(nowMs + SHADOW_RUNTIME_CONFIG.cooldownDurationMs).toISOString();
}
