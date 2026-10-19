import type { MarketDataTrustState } from "@/lib/market-data/trust-states";
import { PUBLIC_MARKET_DATA_DELAY_DISCLOSURE } from "@/lib/price-utils";

/** Align Watchlist quote lines with site-wide delayed-data policy when quotes may be live-ish. */
export function watchlistDelayDisclosureSuffix(trust: MarketDataTrustState): string | null {
  if (trust === "FRESH" || trust === "DELAYED") {
    return PUBLIC_MARKET_DATA_DELAY_DISCLOSURE;
  }
  return null;
}

export function appendWatchlistDelayDisclosure(line: string, trust: MarketDataTrustState): string {
  const delay = watchlistDelayDisclosureSuffix(trust);
  if (!delay) return line;
  if (line.toLowerCase().includes("delayed")) return line;
  return `${line} · ${delay}`;
}
