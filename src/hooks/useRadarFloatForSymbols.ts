import { useQuery } from "@tanstack/react-query";
import { normalizeSymbol } from "@/lib/catalyst/parsers";
import {
  FLOAT_STALE_TIME_MS,
  FLOAT_UNAVAILABLE_MESSAGE,
  floatMapHasTransient,
  getFloatForSymbols,
  peekFloatRecord,
  verifiedFloatRecordForDisplay,
  verifiedFreeFloatFromRecord,
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

  const getFloatRecord = (symbol: string): RadarFloatRecord | null => {
    const cached = peekFloatRecord(symbol);
    if (cached) return verifiedFloatRecordForDisplay(cached);
    const ticker = normalizeSymbol(symbol);
    if (!ticker) return null;
    const row = bySymbol.get(ticker);
    return row ? verifiedFloatRecordForDisplay(row) : null;
  };

  return {
    bySymbol,
    isPending: key.length > 0 && query.isPending,
    getFloatRecord,
    getFloat: (symbol: string) => verifiedFreeFloatFromRecord(getFloatRecord(symbol)),
    getMeasurementAsOf: (symbol: string) => {
      const record = getFloatRecord(symbol);
      if (!record || record.status === "unavailable" || record.float === null) return null;
      return record.asOf;
    },
  };
}
