import type { CatalystEnrichmentEntry } from "@/lib/catalyst/enrichment";
import { useRecentCatalystEnrichment } from "@/hooks/useRecentCatalystEnrichment";

export type { CatalystEnrichmentEntry };

/** Recent-only catalyst lookup for homepage Market Pulse. */
export function useMarketPulseCatalystEnrichment(symbols: string[]) {
  return useRecentCatalystEnrichment(symbols, "market_pulse");
}
