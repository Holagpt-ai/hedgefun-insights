import { useQuery } from "@tanstack/react-query";
import { normalizeEnrichmentSymbols, selectRecentEnrichmentEntries } from "@/lib/catalyst/enrichment";
import { fetchCatalystEventsForEnrichment } from "@/hooks/useCatalystEnrichmentForSymbols";
import { selectNearestEarnings, type EarningsBadge } from "@/lib/watchlist-v2/earnings";
import type { CatalystEnrichmentEntry } from "@/lib/catalyst/enrichment";

export interface WatchlistMarketIntelligenceBundle {
  recentCatalyst: Map<string, CatalystEnrichmentEntry>;
  earnings: Map<string, EarningsBadge>;
}

/** Single batched catalyst fetch for Watchlist earnings badges + verified catalyst context. */
export function useWatchlistMarketIntelligence(symbols: string[]) {
  const key = normalizeEnrichmentSymbols(symbols);
  return useQuery<WatchlistMarketIntelligenceBundle>({
    queryKey: ["watchlist_market_intel", key],
    enabled: key.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const nowMs = Date.now();
      const events = await fetchCatalystEventsForEnrichment(key, nowMs);
      return {
        recentCatalyst: selectRecentEnrichmentEntries(events, key, nowMs),
        earnings: selectNearestEarnings(events, key, nowMs),
      };
    },
  });
}
