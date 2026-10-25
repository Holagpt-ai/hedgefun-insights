/** Client mirror of supabase/functions/_shared/catalyst-intelligence/distribution-ticker.ts */

import type { TickerLinkLike } from "@/lib/catalyst/intel-distribution-types";

const TICKER_REGEX = /^[A-Z][A-Z0-9.-]{0,14}$/;

function isValidTicker(x: string): boolean {
  return TICKER_REGEX.test(x);
}

const DIRECT_ATTRIBUTION_RELATIONS = new Set(["PRIMARY", "DIRECT"]);

export interface PrimaryDistributionTicker {
  symbol: string;
  relatedSymbols: string[];
}

export function resolvePrimaryDistributionTicker(
  tickers: readonly TickerLinkLike[],
): PrimaryDistributionTicker | null {
  const primaries = tickers.filter((row) => row.isPrimary);
  if (primaries.length !== 1) return null;
  const primary = primaries[0]!;
  const relation = primary.relation ?? "PRIMARY";
  if (!DIRECT_ATTRIBUTION_RELATIONS.has(relation)) return null;
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
