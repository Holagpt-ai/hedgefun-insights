import type { CatalystEnrichmentEntry } from "@/lib/catalyst/enrichment";
import { normalizeEnrichmentSymbols } from "@/lib/catalyst/enrichment";
import {
  buildSymbolCatalystPlatformContext,
  resolveSymbolCatalystAvailability,
  type SymbolCatalystPlatformContext,
} from "@/lib/catalyst/catalyst-platform-context";

export function buildSymbolCatalystPlatformMap(input: {
  symbols: readonly string[];
  enrichment?: Map<string, CatalystEnrichmentEntry> | undefined;
  queryError?: boolean;
  /** When true and enrichment is still undefined, do not synthesize per-symbol `none`. */
  queryPending?: boolean;
  nowMs?: number;
}): Map<string, SymbolCatalystPlatformContext> {
  const nowMs = input.nowMs ?? Date.now();
  const queryError = input.queryError === true;
  const queryPending = input.queryPending === true;
  const keys = normalizeEnrichmentSymbols(input.symbols);
  const out = new Map<string, SymbolCatalystPlatformContext>();
  if (queryPending && input.enrichment === undefined) {
    return out;
  }
  for (const symbol of keys) {
    const entry = input.enrichment?.get(symbol);
    const availability = resolveSymbolCatalystAvailability({ queryError, entry, nowMs });
    out.set(
      symbol,
      buildSymbolCatalystPlatformContext({ symbol, entry, availability, nowMs }),
    );
  }
  return out;
}
