import type { AiTraderEpisode, EpisodeType } from "@/lib/ai-trader/domain/memory";
import type { WatchlistProposal } from "@/lib/ai-trader/market/watchlist-engine";

const ALLOWED_SHADOW_EPISODES: readonly EpisodeType[] = [
  "WATCHLIST_PROMOTION",
  "WATCHLIST_REMOVAL",
  "MARKET_REFERENCE",
];

export function episodeTypeForProposal(proposal: WatchlistProposal): EpisodeType | null {
  if (proposal.nextState === "REMOVED") return "WATCHLIST_REMOVAL";
  if (proposal.priorState && proposal.nextState !== proposal.priorState) {
    if (proposal.nextState === "RESEARCHING" || proposal.nextState === "WATCHING" || proposal.nextState === "HIGH_PRIORITY") {
      return "WATCHLIST_PROMOTION";
    }
  }
  return null;
}

export function buildWatchlistEpisodeDraft(
  proposal: WatchlistProposal,
  sessionDate: string,
  startedAt: string,
): Pick<AiTraderEpisode, "episodeType" | "instrument" | "sessionDate" | "startedAt" | "featureSnapshot"> | null {
  const episodeType = episodeTypeForProposal(proposal);
  if (!episodeType || !ALLOWED_SHADOW_EPISODES.includes(episodeType)) return null;
  if (episodeType === "TRADE" || episodeType === "EXECUTION_EVENT") return null;
  return {
    episodeType,
    instrument: { symbol: proposal.symbol, assetClass: "US_EQUITY", venue: null },
    sessionDate,
    startedAt,
    featureSnapshot: {
      priorState: proposal.priorState,
      nextState: proposal.nextState,
      sourceRank: proposal.sourceRank,
    },
  };
}

export function shadowEpisodeTypesAllowed(): readonly EpisodeType[] {
  return ALLOWED_SHADOW_EPISODES;
}
