import { useQuery } from "@tanstack/react-query";
import { normalizeSymbol } from "@/lib/catalyst/parsers";
import {
  FLOAT_STALE_TIME_MS,
  getFloatForSymbols,
  type RadarFloatRecord,
} from "@/lib/market-data/float";
import { uniqueNormalizedSymbols } from "@/lib/market-data/symbols";

export function useRadarFloatForSymbols(symbols: readonly string[]) {
  const key = uniqueNormalizedSymbols(symbols);
  const query = useQuery({
    queryKey: ["radar-float", key],
    queryFn: () => getFloatForSymbols(key),
    staleTime: FLOAT_STALE_TIME_MS,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 0,
    enabled: key.length > 0,
  });

  const bySymbol = query.data ?? new Map<string, RadarFloatRecord>();

  return {
    bySymbol,
    isPending: key.length > 0 && query.isPending,
    getFloat: (symbol: string) => {
      const ticker = normalizeSymbol(symbol);
      if (!ticker) return null;
      return bySymbol.get(ticker)?.float ?? null;
    },
  };
}
