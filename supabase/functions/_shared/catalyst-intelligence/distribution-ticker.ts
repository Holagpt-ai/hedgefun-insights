import { isValidTicker } from "../catalyst/contract.ts";
import type { TickerLink } from "./types.ts";

const DIRECT_ATTRIBUTION_RELATIONS = new Set<TickerLink["relation"]>(["PRIMARY", "DIRECT"]);

export interface PrimaryDistributionTicker {
  symbol: string;
  relatedSymbols: string[];
}

/** Requires an explicit primary link with direct attribution — never falls back to secondary/mention rows. */
export function resolvePrimaryDistributionTicker(
  tickers: readonly TickerLink[],
): PrimaryDistributionTicker | null {
  const primaries = tickers.filter((row) => row.isPrimary);
  if (primaries.length !== 1) return null;
  const primary = primaries[0]!;
  if (!DIRECT_ATTRIBUTION_RELATIONS.has(primary.relation)) return null;
  const symbol = primary.ticker.trim().toUpperCase();
  if (!isValidTicker(symbol)) return null;

  const relatedSymbols = [
    ...new Set(
      tickers
        .filter((row) => row.ticker.trim().toUpperCase() !== symbol)
        .map((row) => row.ticker.trim().toUpperCase())
        .filter((t) => isValidTicker(t)),
    ),
  ];

  return { symbol, relatedSymbols };
}
