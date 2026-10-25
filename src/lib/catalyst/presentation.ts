import type { CatalystEvent } from "@/types/catalyst";

export function catalystSourceBadge(
  provider: string,
): "EARNINGS DATA" | "NEWS" | "SEC FILING" | "COMPANY IR" | "PRESS RELEASE" | null {
  if (provider === "earnings_calendar") return "EARNINGS DATA";
  if (provider === "polygon") return "NEWS";
  if (provider === "sec_edgar") return "SEC FILING";
  if (provider === "company_ir" || provider === "COMPANY_IR") return "COMPANY IR";
  if (provider === "news" || provider === "news_pr" || provider === "NEWS_PR") return "PRESS RELEASE";
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
