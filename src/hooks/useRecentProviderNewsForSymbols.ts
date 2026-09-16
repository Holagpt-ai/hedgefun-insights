import { useQueries } from "@tanstack/react-query";
import { normalizeSymbol } from "@/lib/catalyst/parsers";
import {
  getRecentHeadlineForSymbol,
  type RecentProviderHeadline,
} from "@/lib/market-data/recent-news";

const NEWS_STALE_TIME_MS = 15 * 60 * 1000;

export function useRecentProviderNewsForSymbols(symbols: readonly string[]) {
  const key = [...new Set(symbols.map((s) => normalizeSymbol(s)).filter(Boolean) as string[])].sort();
  const queries = useQueries({
    queries: key.map((symbol) => ({
      queryKey: ["radar-recent-news", symbol],
      queryFn: () => getRecentHeadlineForSymbol(symbol),
      staleTime: NEWS_STALE_TIME_MS,
      gcTime: 60 * 60 * 1000,
      retry: 0,
    })),
  });

  const bySymbol = new Map<string, RecentProviderHeadline>();
  for (const query of queries) {
    if (query.data?.ticker) bySymbol.set(query.data.ticker, query.data);
  }

  return {
    bySymbol,
    isPending: key.length > 0 && queries.some((query) => query.isPending),
    getHeadline: (symbol: string) => {
      const ticker = normalizeSymbol(symbol);
      if (!ticker) return undefined;
      return bySymbol.get(ticker);
    },
  };
}
