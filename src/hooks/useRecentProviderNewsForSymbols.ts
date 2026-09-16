import { useQuery } from "@tanstack/react-query";
import { normalizeSymbol } from "@/lib/catalyst/parsers";
import {
  getRecentHeadlinesForSymbols,
  RECENT_NEWS_STALE_TIME_MS,
  type RecentProviderHeadline,
} from "@/lib/market-data/recent-news";
import { uniqueNormalizedSymbols } from "@/lib/market-data/symbols";

export function useRecentProviderNewsForSymbols(symbols: readonly string[]) {
  const key = uniqueNormalizedSymbols(symbols);
  const query = useQuery({
    queryKey: ["radar-recent-news", key],
    queryFn: () => getRecentHeadlinesForSymbols(key),
    staleTime: RECENT_NEWS_STALE_TIME_MS,
    gcTime: 60 * 60 * 1000,
    retry: 0,
    enabled: key.length > 0,
  });

  const bySymbol = query.data ?? new Map<string, RecentProviderHeadline>();

  return {
    bySymbol,
    isPending: key.length > 0 && query.isPending,
    getHeadline: (symbol: string) => {
      const ticker = normalizeSymbol(symbol);
      if (!ticker) return undefined;
      return bySymbol.get(ticker);
    },
  };
}
