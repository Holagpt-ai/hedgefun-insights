import { PUBLIC_MARKET_DATA_DELAY_DISCLOSURE } from "@/lib/price-utils";

/** Matches the public heatmap query cap (market-cap ordered, sector tagged). */
export const HEATMAP_UNIVERSE_STOCK_LIMIT = 1000;

export function heatmapUniverseHeading(stockCount: number, timeframe: string): string {
  const tf = timeframe.trim() || "1D";
  if (stockCount <= 0) {
    return `Market heatmap · ${tf} session change`;
  }
  const n = Math.min(stockCount, HEATMAP_UNIVERSE_STOCK_LIMIT);
  return `Top ${n.toLocaleString()} stocks by market cap · ${tf} session change`;
}

export function heatmapUniverseDetail(stockCount: number): string {
  if (stockCount <= 0) {
    return "Covers listed stocks with sector tags in the Stocksist database (not a verified index constituent list).";
  }
  const n = Math.min(stockCount, HEATMAP_UNIVERSE_STOCK_LIMIT);
  return `Treemap of up to ${HEATMAP_UNIVERSE_STOCK_LIMIT.toLocaleString()} U.S. listed stocks with sector and market-cap data (${n.toLocaleString()} loaded), not an official S&P 500 membership list.`;
}

export function heatmapPageSeoDescription(): string {
  return `Sector treemap of large-cap U.S. listed stocks by market cap (up to ${HEATMAP_UNIVERSE_STOCK_LIMIT.toLocaleString()} names). Session change colors use ${PUBLIC_MARKET_DATA_DELAY_DISCLOSURE.toLowerCase()}.`;
}
