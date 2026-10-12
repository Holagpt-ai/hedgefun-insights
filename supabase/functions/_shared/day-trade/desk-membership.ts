/**
 * Authoritative Day Trade desk membership (Top-10 opportunity desk).
 * Volume-first discovery ordering preserved via rank inputs.
 */

import { DAY_TRADE_RADAR_MIN_OPPORTUNITY_SCORE, DAY_TRADE_RADAR_TOP_N } from "../../../../src/config/day-trade-radar-opportunity.config.ts";
import type { DayTradeMetricsRow } from "./evaluate-five-pillars.ts";
import { buildDayTradeQualificationEvaluation } from "./evaluate-five-pillars.ts";
import { assessMetricsEvaluability } from "./evaluate-five-pillars.ts";
import { qualifiesFreshnessFromMetrics } from "./freshness-from-metrics.ts";
import { scoreOpportunityFromMetrics } from "./opportunity-score-metrics.ts";

export type DeskMembershipResult = {
  onDeskSymbols: Set<string>;
  /** Per-symbol desk facts for lifecycle stepping. */
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
};

export function computeAuthoritativeDeskMembership(input: {
  rows: readonly DayTradeMetricsRow[];
  syncRunId: string;
  marketDataMsBySymbol: ReadonlyMap<string, number>;
}): DeskMembershipResult {
  const scored: {
    symbol: string;
    score: number;
    fivePillarsPass: boolean;
    freshnessPass: boolean;
    opportunityEligible: boolean;
  }[] = [];

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

  for (const row of input.rows) {
    const symbol = row.symbol.trim().toUpperCase();
    const marketDataMs = input.marketDataMsBySymbol.get(symbol);
    if (marketDataMs === undefined) continue;
    const evaluable = assessMetricsEvaluability(row, marketDataMs);
    if (!evaluable.evaluable) {
      bySymbol.set(symbol, {
        onAuthoritativeDesk: false,
        fivePillarsPass: false,
        freshnessPass: false,
        opportunityEligible: false,
        opportunityScore: 0,
      });
      continue;
    }
    const evaluation = buildDayTradeQualificationEvaluation({
      row,
      marketDataMs,
      snapshotKey: `${input.syncRunId}:${symbol}:${row.provider_as_of ?? "none"}`,
      evaluable: true,
    });
    const freshnessPass = qualifiesFreshnessFromMetrics(row, marketDataMs);
    const { score, eligible } = scoreOpportunityFromMetrics(row, marketDataMs, freshnessPass);
    const fivePillarsPass = evaluation.fivePillarsPass;
    const opportunityEligible = eligible && score >= DAY_TRADE_RADAR_MIN_OPPORTUNITY_SCORE;
    bySymbol.set(symbol, {
      onAuthoritativeDesk: false,
      fivePillarsPass,
      freshnessPass,
      opportunityEligible,
      opportunityScore: score,
    });
    if (fivePillarsPass && freshnessPass && opportunityEligible) {
      scored.push({ symbol, score, fivePillarsPass, freshnessPass, opportunityEligible });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, DAY_TRADE_RADAR_TOP_N);
  const onDeskSymbols = new Set(top.map((t) => t.symbol));
  for (const sym of onDeskSymbols) {
    const prev = bySymbol.get(sym);
    if (prev) bySymbol.set(sym, { ...prev, onAuthoritativeDesk: true });
  }

  return { onDeskSymbols, bySymbol };
}
