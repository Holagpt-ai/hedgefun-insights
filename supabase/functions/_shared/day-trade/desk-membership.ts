/**
 * Authoritative Day Trade desk membership — delegates to canonical frontend desk path.
 */

import { deskFactsFromMetrics } from "./canonical-desk-from-metrics.ts";
import type { DayTradeMetricsRow } from "./evaluate-five-pillars.ts";

export type DeskMembershipResult = {
  onDeskSymbols: Set<string>;
  bySymbol: Map<
    string,
    {
      onAuthoritativeDesk: boolean;
      fivePillarsPass: boolean;
      freshnessPass: boolean;
      opportunityEligible: boolean;
      opportunityScore: number;
    }
  >;
  /** Symbols present in this desk-source batch (do not infer exit if absent). */
  universeSymbols: Set<string>;
  /** Shared market-data clock for canonical desk (max provider as-of in batch). */
  deskMarketDataMs: number | null;
};

export function computeAuthoritativeDeskMembership(input: {
  rows: readonly DayTradeMetricsRow[];
  marketDataMsBySymbol: ReadonlyMap<string, number>;
}): DeskMembershipResult {
  const universeSymbols = new Set(
    input.rows.map((r) => r.symbol.trim().toUpperCase()),
  );
  let deskMarketDataMs: number | null = null;
  for (const ms of input.marketDataMsBySymbol.values()) {
    if (deskMarketDataMs === null || ms > deskMarketDataMs) deskMarketDataMs = ms;
  }
  if (deskMarketDataMs === null || input.rows.length === 0) {
    return { onDeskSymbols: new Set(), bySymbol: new Map(), universeSymbols, deskMarketDataMs };
  }

  const facts = deskFactsFromMetrics(input.rows, deskMarketDataMs);
  const onDeskSymbols = new Set<string>();
  const bySymbol = new Map<
    string,
    {
      onAuthoritativeDesk: boolean;
      fivePillarsPass: boolean;
      freshnessPass: boolean;
      opportunityEligible: boolean;
      opportunityScore: number;
    }
  >();

  for (const [symbol, fact] of facts) {
    if (fact.onAuthoritativeDesk) onDeskSymbols.add(symbol);
    bySymbol.set(symbol, {
      ...fact,
      opportunityScore: fact.onAuthoritativeDesk ? 1 : 0,
    });
  }

  return { onDeskSymbols, bySymbol, universeSymbols, deskMarketDataMs };
}
