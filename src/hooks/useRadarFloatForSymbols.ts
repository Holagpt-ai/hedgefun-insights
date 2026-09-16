import { useQueries } from "@tanstack/react-query";
import { normalizeSymbol } from "@/lib/catalyst/parsers";
import {
  FLOAT_STALE_TIME_MS,
  getFloatForSymbol,
  type RadarFloatRecord,
} from "@/lib/market-data/float";

export function useRadarFloatForSymbols(symbols: readonly string[]) {
  const key = [...new Set(symbols.map((s) => normalizeSymbol(s)).filter(Boolean) as string[])].sort();
  const queries = useQueries({
    queries: key.map((symbol) => ({
      queryKey: ["radar-float", symbol],
      queryFn: () => getFloatForSymbol(symbol),
      staleTime: FLOAT_STALE_TIME_MS,
      gcTime: 24 * 60 * 60 * 1000,
      retry: 0,
    })),
  });

  const bySymbol = new Map<string, RadarFloatRecord>();
  for (const query of queries) {
    if (query.data?.ticker) bySymbol.set(query.data.ticker, query.data);
  }

  return {
    bySymbol,
    isPending: key.length > 0 && queries.some((query) => query.isPending),
    getFloat: (symbol: string) => {
      const ticker = normalizeSymbol(symbol);
      if (!ticker) return null;
      return bySymbol.get(ticker)?.float ?? null;
    },
  };
}
