/**
 * Compact per-tab evaluation evidence persisted on screener_feed_state.
 * Proves whether a tab was evaluated vs blocked by missing prerequisites.
 *
 * Gappers fail-closed coverage contract:
 * - upstream universe must be non-empty;
 * - at least one volume-active symbol must exist;
 * - every volume-active symbol must have calculable prior-close/open gap inputs.
 * Partial calculability across the active snapshot does not establish coverage.
 */

import {
  classifyNewHighLow,
  isValidBaselineQuote,
  type NhlBaselineQuote,
  type NhlBaselineStatus,
  type NhlClassification,
} from "./new-highs-lows.ts";
import {
  dayHighLow,
  dayVolume,
  gapPercent,
  normalizeSymbol,
  qualifiesGappers,
  regularClose,
  TAB_QUALIFIERS,
  type PolygonTicker,
  type ScreenerTabId,
} from "./selection.ts";

export type TabEvidenceEvaluationStatus = "evaluated" | "prerequisite_unavailable";

export interface GappersTabEvidence {
  status: TabEvidenceEvaluationStatus;
  universe_count: number;
  volume_positive_count: number;
  gap_calculable_count: number;
  qualified_count: number;
  selected_count: number;
  reason?: string;
}

export interface NhlTabEvidence {
  status: "evaluated" | "not_evaluated";
  baseline_status: NhlBaselineStatus;
  baseline_quote_count: number;
  universe_count: number;
  eligible_count?: number;
  evaluated_count?: number;
  qualified_count?: number;
  selected_count: number;
  reason?: string;
}

export interface GenericTabEvidence {
  status: TabEvidenceEvaluationStatus;
  universe_count: number;
  qualified_count: number;
  selected_count: number;
  reason?: string;
}

export type TabEvaluationEvidence =
  | GappersTabEvidence
  | NhlTabEvidence
  | GenericTabEvidence;

export type TabEvaluationEvidenceMap = Partial<
  Record<ScreenerTabId, TabEvaluationEvidence>
>;

function countVolumeActive(universe: readonly PolygonTicker[]): number {
  let count = 0;
  for (const t of universe) {
    const vol = dayVolume(t);
    if (vol !== null && vol > 0) count += 1;
  }
  return count;
}

export function evaluateGappersEvidence(
  universe: readonly PolygonTicker[],
  selected: readonly PolygonTicker[],
): GappersTabEvidence {
  const universe_count = universe.length;
  const volume_positive_count = countVolumeActive(universe);
  let gap_calculable_count = 0;
  let qualified_count = 0;

  for (const t of universe) {
    const vol = dayVolume(t);
    const volumeActive = vol !== null && vol > 0;
    if (volumeActive && gapPercent(t) !== null) gap_calculable_count += 1;
    if (qualifiesGappers(t)) qualified_count += 1;
  }

  const selected_count = selected.length;
  const base = {
    universe_count,
    volume_positive_count,
    gap_calculable_count,
    qualified_count,
    selected_count,
  };

  if (universe_count === 0) {
    return {
      status: "prerequisite_unavailable",
      ...base,
      reason: "upstream_universe_empty",
    };
  }

  if (volume_positive_count === 0) {
    return {
      status: "prerequisite_unavailable",
      ...base,
      reason: "no_volume_active_universe",
    };
  }

  if (gap_calculable_count === 0) {
    return {
      status: "prerequisite_unavailable",
      ...base,
      reason: "prior_close_gap_inputs_unavailable",
    };
  }

  if (gap_calculable_count < volume_positive_count) {
    return {
      status: "prerequisite_unavailable",
      ...base,
      reason: "gap_input_coverage_incomplete",
    };
  }

  return {
    status: "evaluated",
    ...base,
  };
}

export function evaluateNhlEvidence(
  universe: readonly PolygonTicker[],
  baselines: ReadonlyMap<string, NhlBaselineQuote>,
  baselineStatus: NhlBaselineStatus,
  selected: readonly NhlClassification[],
): NhlTabEvidence {
  const baseline_quote_count = baselines.size;
  const base = {
    baseline_quote_count,
    universe_count: universe.length,
    selected_count: selected.length,
  };

  if (baselineStatus !== "available") {
    return {
      status: "not_evaluated",
      baseline_status: baselineStatus,
      ...base,
      reason: `baseline_${baselineStatus}`,
    };
  }

  if (baseline_quote_count === 0) {
    return {
      status: "not_evaluated",
      baseline_status: "initializing",
      ...base,
      reason: "baseline_quotes_empty",
    };
  }

  let eligible_count = 0;
  let evaluated_count = 0;
  let qualified_count = 0;

  for (const t of universe) {
    const sym = normalizeSymbol(t?.ticker);
    if (!sym) continue;
    const vol = dayVolume(t);
    if (vol === null || !(vol > 0)) continue;
    const price = regularClose(t);
    if (price === null || !(price > 0)) continue;
    const range = dayHighLow(t);
    if (range.high === null || range.low === null) continue;

    eligible_count += 1;
    const baseline = baselines.get(sym);
    if (!isValidBaselineQuote(baseline)) continue;
    evaluated_count += 1;
    if (classifyNewHighLow(t, baseline) !== null) qualified_count += 1;
  }

  if (eligible_count === 0) {
    return {
      status: "not_evaluated",
      baseline_status: "available",
      eligible_count: 0,
      evaluated_count: 0,
      qualified_count: 0,
      ...base,
      reason: "baseline_coverage_empty",
    };
  }

  if (evaluated_count < eligible_count) {
    return {
      status: "not_evaluated",
      baseline_status: "available",
      eligible_count,
      evaluated_count,
      qualified_count,
      ...base,
      reason: "baseline_coverage_incomplete",
    };
  }

  return {
    status: "evaluated",
    baseline_status: "available",
    eligible_count,
    evaluated_count,
    qualified_count,
    ...base,
  };
}

export function evaluateGenericTabEvidence(
  tabId: Exclude<ScreenerTabId, "new_highs_lows" | "gappers">,
  universe: readonly PolygonTicker[],
  selected: readonly PolygonTicker[],
): GenericTabEvidence {
  const qualify = TAB_QUALIFIERS[tabId];
  let qualified_count = 0;
  for (const t of universe) {
    if (qualify(t)) qualified_count += 1;
  }

  if (universe.length === 0) {
    return {
      status: "prerequisite_unavailable",
      universe_count: 0,
      qualified_count: 0,
      selected_count: selected.length,
      reason: "upstream_universe_empty",
    };
  }

  return {
    status: "evaluated",
    universe_count: universe.length,
    qualified_count,
    selected_count: selected.length,
  };
}

export function buildTabEvaluationEvidence(input: {
  universe: readonly PolygonTicker[];
  dayTradeSelected: readonly PolygonTicker[];
  gapperSelected: readonly PolygonTicker[];
  volumeSpikeSelected: readonly PolygonTicker[];
  gainersLosersSelected: readonly PolygonTicker[];
  unusualSelected: readonly PolygonTicker[];
  nhlBaselineStatus: NhlBaselineStatus;
  nhlBaselines: ReadonlyMap<string, NhlBaselineQuote>;
  nhlSelected: readonly NhlClassification[];
}): TabEvaluationEvidenceMap {
  return {
    day_trade_radar: evaluateGenericTabEvidence(
      "day_trade_radar",
      input.universe,
      input.dayTradeSelected,
    ),
    gappers: evaluateGappersEvidence(input.universe, input.gapperSelected),
    volume_spikes: evaluateGenericTabEvidence(
      "volume_spikes",
      input.universe,
      input.volumeSpikeSelected,
    ),
    gainers_losers: evaluateGenericTabEvidence(
      "gainers_losers",
      input.gainersLosersSelected,
      input.gainersLosersSelected,
    ),
    unusual_volume: evaluateGenericTabEvidence(
      "unusual_volume",
      input.universe,
      input.unusualSelected,
    ),
    new_highs_lows: evaluateNhlEvidence(
      input.universe,
      input.nhlBaselines,
      input.nhlBaselineStatus,
      input.nhlSelected,
    ),
  };
}
