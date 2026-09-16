import { useQuery } from "@tanstack/react-query";
import { normalizeSymbol } from "@/lib/catalyst/parsers";
import {
  getRecentHeadlinesForSymbols,
  peekRecentNewsRecord,
  radarNewsMapHasUnavailable,
  RADAR_NEWS_UNAVAILABLE_MESSAGE,
  RECENT_NEWS_STALE_TIME_MS,
  type RadarNewsSymbolStatus,
  type RecentProviderHeadline,
} from "@/lib/market-data/recent-news";
import { uniqueNormalizedSymbols } from "@/lib/market-data/symbols";

export type { RadarNewsSymbolStatus };

export function useRecentProviderNewsForSymbols(symbols: readonly string[]) {
  const key = uniqueNormalizedSymbols(symbols);
  const query = useQuery({
    queryKey: ["radar-recent-news", key],
    queryFn: async () => {
      const map = await getRecentHeadlinesForSymbols(key);
      if (radarNewsMapHasUnavailable(map, key)) {
        throw new Error(RADAR_NEWS_UNAVAILABLE_MESSAGE);
      }
      return map;
    },
    staleTime: RECENT_NEWS_STALE_TIME_MS,
    gcTime: 60 * 60 * 1000,
    retry: 0,
    enabled: key.length > 0,
  });

  return {
    isPending: key.length > 0 && query.isPending,
    getHeadline: (symbol: string): RecentProviderHeadline | undefined => {
      const cached = peekRecentNewsRecord(symbol);
      if (cached?.article) return cached.article;
      const ticker = normalizeSymbol(symbol);
      if (!ticker) return undefined;
      return query.data?.get(ticker)?.article ?? undefined;
    },
    getStatus: (symbol: string): RadarNewsSymbolStatus => {
      const cached = peekRecentNewsRecord(symbol);
      if (cached?.status === "ok" || cached?.status === "empty") return cached.status;

      const ticker = normalizeSymbol(symbol);
      if (!ticker) return "empty";

      const row = query.data?.get(ticker);
      if (row?.status === "ok" || row?.status === "empty" || row?.status === "unavailable") {
        return row.status;
      }

      if (key.length > 0 && query.isPending) return "pending";
      if (query.isError) return "unavailable";
      if (query.isSuccess) return "empty";
      return key.length > 0 ? "pending" : "empty";
    },
  };
}
