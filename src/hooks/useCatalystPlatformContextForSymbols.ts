import { useMemo } from "react";
import { buildSymbolCatalystPlatformMap } from "@/lib/catalyst/build-symbol-catalyst-platform-map";
import type { SymbolCatalystPlatformContext } from "@/lib/catalyst/catalyst-platform-context";
import { normalizeEnrichmentSymbols } from "@/lib/catalyst/enrichment";
import {
  useCatalystEnrichmentForSymbols,
  type CatalystEnrichmentEntry,
} from "@/hooks/useCatalystEnrichmentForSymbols";

export type { CatalystEnrichmentEntry, SymbolCatalystPlatformContext };

export function useCatalystPlatformContextForSymbols(symbols: string[]) {
  const key = normalizeEnrichmentSymbols(symbols);
  const enrichmentQuery = useCatalystEnrichmentForSymbols(symbols);
  const platformBySymbol = useMemo(
    () => buildSymbolCatalystPlatformMap({
      symbols: key,
      enrichment: enrichmentQuery.data,
      queryError: enrichmentQuery.isError,
    }),
    [key.join("|"), enrichmentQuery.data, enrichmentQuery.isError],
  );
  return {
    ...enrichmentQuery,
    data: enrichmentQuery.data,
    platformBySymbol,
  };
}
