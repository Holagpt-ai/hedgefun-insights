import type { CatalystEvent } from "@/types/catalyst";

export function catalystSourceBadge(provider: string): "EARNINGS DATA" | "NEWS" | null {
  if (provider === "earnings_calendar") return "EARNINGS DATA";
  if (provider === "polygon") return "NEWS";
  return null;
}

export function watchlistCatalystCounts(
  events: readonly CatalystEvent[],
  watchlistSymbols: ReadonlySet<string>,
): { events: number; stocks: number } {
  let eventCount = 0;
  const distinctStocks = new Set<string>();
  for (const event of events) {
    if (!watchlistSymbols.has(event.symbol)) continue;
    eventCount += 1;
    distinctStocks.add(event.symbol);
  }
  return { events: eventCount, stocks: distinctStocks.size };
}

export function watchlistCatalystEmptyMessage(watchlistSize: number): string {
  if (watchlistSize === 0) {
    return "Your watchlist is empty. Add stocks to surface their catalysts here.";
  }
  return "No recent catalysts match stocks in your watchlist.";
}
