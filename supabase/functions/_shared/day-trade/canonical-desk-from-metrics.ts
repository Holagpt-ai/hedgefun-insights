/**
 * Authoritative Day Trade desk facts for edge persistence.
 * Uses the same opportunity thresholds as DayTradeRadarV2 (Top-N + min score).
 */

import {
  DAY_TRADE_RADAR_MIN_OPPORTUNITY_SCORE,
  DAY_TRADE_RADAR_TOP_N,
} from "./radar-opportunity.config.ts";
import type { DayTradeMetricsRow } from "./evaluate-five-pillars.ts";
import {
  assessMetricsEvaluability,
  buildDayTradeQualificationEvaluation,
} from "./evaluate-five-pillars.ts";
import { qualifiesFreshnessFromMetrics } from "./freshness-from-metrics.ts";
import { scoreOpportunityFromMetrics } from "./opportunity-score-metrics.ts";
import {
  metricsToRankedRow,
  type DayTradeMetricsLike,
} from "./metrics-to-ranked-row.ts";

export type CanonicalDeskFacts = {
  onAuthoritativeDesk: boolean;
  fivePillarsPass: boolean;
  freshnessPass: boolean;
  opportunityEligible: boolean;
};

function rankedUniverse(rows: readonly DayTradeMetricsLike[]) {
  const ranked = rows.map((row, index) => metricsToRankedRow(row, index));
  ranked.sort((a, b) => a.volume_rank - b.volume_rank);
  return ranked;
}

export function authoritativeDeskSymbolsFromMetrics(
  rows: readonly DayTradeMetricsRow[],
  marketDataMs: number,
): Set<string> {
  return new Set(
    [...deskFactsFromMetrics(rows, marketDataMs).entries()]
      .filter(([, fact]) => fact.onAuthoritativeDesk)
      .map(([sym]) => sym),
  );
}

export function deskFactsFromMetrics(
  rows: readonly DayTradeMetricsRow[],
  marketDataMs: number,
): Map<string, CanonicalDeskFacts> {
  const scored: {
    symbol: string;
    score: number;
    fivePillarsPass: boolean;
    freshnessPass: boolean;
    opportunityEligible: boolean;
  }[] = [];

  const bySymbol = new Map<string, CanonicalDeskFacts>();

  for (const row of rows) {
    const symbol = row.symbol.trim().toUpperCase();
    const evaluable = assessMetricsEvaluability(row, marketDataMs);
    if (!evaluable.evaluable) {
      bySymbol.set(symbol, {
        onAuthoritativeDesk: false,
        fivePillarsPass: false,
        freshnessPass: false,
        opportunityEligible: false,
      });
      continue;
    }
    const evaluation = buildDayTradeQualificationEvaluation({
      row,
      marketDataMs,
      snapshotKey: `desk:${symbol}:${row.provider_as_of ?? "none"}`,
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
    });
    if (fivePillarsPass && freshnessPass && opportunityEligible) {
      scored.push({ symbol, score, fivePillarsPass, freshnessPass, opportunityEligible });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  for (const entry of scored.slice(0, DAY_TRADE_RADAR_TOP_N)) {
    const prev = bySymbol.get(entry.symbol);
    if (prev) {
      bySymbol.set(entry.symbol, { ...prev, onAuthoritativeDesk: true });
    }
  }

  for (const row of rankedUniverse(rows)) {
    const sym = row.symbol.trim().toUpperCase();
    if (!bySymbol.has(sym)) {
      bySymbol.set(sym, {
        onAuthoritativeDesk: false,
        fivePillarsPass: false,
        freshnessPass: false,
        opportunityEligible: false,
      });
    }
  }

  return bySymbol;
}
