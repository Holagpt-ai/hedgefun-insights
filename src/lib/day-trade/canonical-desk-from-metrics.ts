/**
 * Canonical authoritative Day Trade Top-10 — same path as DayTradeRadarV2 desk.
 */

import { buildDayTradeRadarOpportunityBoard } from "@/features/day-trade-radar-v2/day-trade-radar-opportunity";
import { qualifiesDayTradeFreshness } from "@/features/day-trade-radar-v2/day-trade-freshness";
import { qualifiesDayTradeMomentum } from "@/features/day-trade-radar-v2/day-trade-strategy";
import { metricsToRankedRow, type DayTradeMetricsLike } from "@/lib/day-trade/metrics-to-ranked-row";

export type CanonicalDeskFacts = {
  onAuthoritativeDesk: boolean;
  fivePillarsPass: boolean;
  freshnessPass: boolean;
  opportunityEligible: boolean;
};

function rankedUniverse(rows: readonly DayTradeMetricsLike[]) {
  const ranked = rows.map((row, index) => metricsToRankedRow(row, index));
  ranked.sort((a, b) => (a.volume_rank ?? a.rank) - (b.volume_rank ?? b.rank));
  return ranked;
}

export function authoritativeDeskSymbolsFromMetrics(
  rows: readonly DayTradeMetricsLike[],
  marketDataMs: number,
): Set<string> {
  const board = buildDayTradeRadarOpportunityBoard(rankedUniverse(rows), marketDataMs);
  return new Set(board.topOpportunities.map((row) => row.symbol.trim().toUpperCase()));
}

export function deskFactsFromMetrics(
  rows: readonly DayTradeMetricsLike[],
  marketDataMs: number,
): Map<string, CanonicalDeskFacts> {
  const ranked = rankedUniverse(rows);
  const board = buildDayTradeRadarOpportunityBoard(ranked, marketDataMs);
  const onDesk = new Set(board.topOpportunities.map((r) => r.symbol.trim().toUpperCase()));
  const prioritySymbols = new Set(board.topOpportunities.map((r) => r.symbol));
  const out = new Map<string, CanonicalDeskFacts>();
  for (const row of ranked) {
    const sym = row.symbol.trim().toUpperCase();
    const momentum = qualifiesDayTradeMomentum(row);
    const fresh = qualifiesDayTradeFreshness(row, marketDataMs);
    out.set(sym, {
      onAuthoritativeDesk: onDesk.has(sym),
      fivePillarsPass: momentum,
      freshnessPass: fresh,
      opportunityEligible: prioritySymbols.has(sym) || onDesk.has(sym),
    });
  }
  return out;
}
