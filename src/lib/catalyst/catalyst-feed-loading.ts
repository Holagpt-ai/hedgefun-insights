/** True only for the initial catalyst_events fetch (not background refetch with cached data). */
export function isCatalystFeedInitialLoading(
  isPending: boolean,
  hasData: boolean,
): boolean {
  return isPending && !hasData;
}

/** Prevent cross-ticker bleed when the react-query key changes (e.g. AAPL → TSLA). */
export function filterCatalystEventsToSymbolContext<T extends { symbol: string }>(
  events: readonly T[],
  activeSymbol: string | null,
): T[] {
  if (!activeSymbol) return [...events];
  const want = activeSymbol.trim().toUpperCase();
  return events.filter((e) => e.symbol.trim().toUpperCase() === want);
}
