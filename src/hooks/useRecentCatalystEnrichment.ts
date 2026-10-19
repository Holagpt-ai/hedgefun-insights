import { useQuery } from "@tanstack/react-query";
import { normalizeEnrichmentSymbols, selectRecentEnrichmentEntries } from "@/lib/catalyst/enrichment";
import {
  fetchCatalystEventsForEnrichment,
  type CatalystEnrichmentEntry,
} from "@/hooks/useCatalystEnrichmentForSymbols";

export type RecentCatalystScope = "market_pulse" | "watchlist";

export function recentCatalystQueryKey(scope: RecentCatalystScope, symbols: readonly string[]) {
  return ["catalyst_recent", scope, normalizeEnrichmentSymbols(symbols)] as const;
}

/** Batch 23 recent-only catalyst lookup (shared by Market Pulse and Watchlist). */
export function useRecentCatalystEnrichment(symbols: string[], scope: RecentCatalystScope) {
  const key = normalizeEnrichmentSymbols(symbols);
  return useQuery<Map<string, CatalystEnrichmentEntry>>({
    queryKey: recentCatalystQueryKey(scope, key),
    enabled: key.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const nowMs = Date.now();
      const rows = await fetchCatalystEventsForEnrichment(key, nowMs);
      return selectRecentEnrichmentEntries(rows, key, nowMs);
    },
  });
}
