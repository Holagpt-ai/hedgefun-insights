export const CATALYST_ENRICHMENT_SYMBOL_CAP = 24;

/** First-seen symbol order from the visible feed (bounded). */
export function catalystEnrichmentSymbolsFromFeed(
  feedEvents: readonly { symbol: string }[],
  cap = CATALYST_ENRICHMENT_SYMBOL_CAP,
): string[] {
  const seen: string[] = [];
  for (const e of feedEvents) {
    if (!seen.includes(e.symbol)) seen.push(e.symbol);
    if (seen.length >= cap) break;
  }
  return seen;
}

/** Stable cache/effect key so client-side filter reordering does not refetch history. */
export function catalystEnrichmentStableKey(
  symbols: readonly string[],
  cap = CATALYST_ENRICHMENT_SYMBOL_CAP,
): string {
  const unique = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];
  unique.sort();
  return unique.slice(0, cap).join(",");
}
