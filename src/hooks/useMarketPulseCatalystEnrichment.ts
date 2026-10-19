import { useQuery } from "@tanstack/react-query";
import { selectRecentEnrichmentEntries } from "@/lib/catalyst/enrichment";
import {
  fetchCatalystEventsForEnrichment,
  type CatalystEnrichmentEntry,
} from "@/hooks/useCatalystEnrichmentForSymbols";
import { normalizeEnrichmentSymbols } from "@/lib/catalyst/enrichment";

export type { CatalystEnrichmentEntry };

/** Recent-only catalyst lookup for homepage Market Pulse (does not use screener upcoming-first selection). */
export function useMarketPulseCatalystEnrichment(symbols: string[]) {
  const key = normalizeEnrichmentSymbols(symbols);
  return useQuery<Map<string, CatalystEnrichmentEntry>>({
    queryKey: ["market_pulse_catalyst", key],
    enabled: key.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const nowMs = Date.now();
      const rows = await fetchCatalystEventsForEnrichment(key, nowMs);
      return selectRecentEnrichmentEntries(rows, key, nowMs);
    },
  });
}
