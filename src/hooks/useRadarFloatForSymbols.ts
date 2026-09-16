import { useQuery } from "@tanstack/react-query";
import { normalizeSymbol } from "@/lib/catalyst/parsers";
import {
  FLOAT_STALE_TIME_MS,
  FLOAT_UNAVAILABLE_MESSAGE,
  floatMapHasTransient,
  getFloatForSymbols,
  peekFloatRecord,
  type RadarFloatRecord,
} from "@/lib/market-data/float";
import { uniqueNormalizedSymbols } from "@/lib/market-data/symbols";

export function useRadarFloatForSymbols(symbols: readonly string[]) {
  const key = uniqueNormalizedSymbols(symbols);
  const query = useQuery({
    queryKey: ["radar-float", key],
    queryFn: async () => {
      const map = await getFloatForSymbols(key);
      if (floatMapHasTransient(map, key)) {
        throw new Error(FLOAT_UNAVAILABLE_MESSAGE);
      }
      return map;
    },
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
      const cached = peekFloatRecord(symbol);
      if (cached) return cached.float;
      const ticker = normalizeSymbol(symbol);
      if (!ticker) return null;
      const row = bySymbol.get(ticker);
      if (!row || row.status === "unavailable") return null;
      return row.float;
    },
  };
}
