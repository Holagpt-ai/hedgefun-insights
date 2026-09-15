/**
 * Compact per-tab evaluation evidence persisted on screener_feed_state.
 * Proves whether a tab was evaluated vs blocked by missing prerequisites.
 */

import {
  classifyNewHighLow,
  isValidBaselineQuote,
  type NhlBaselineQuote,
  type NhlBaselineStatus,
  type NhlClassification,
} from "./new-highs-lows.ts";
import {
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
  gap_calculable_count: number;
  qualified_count: number;
  selected_count: number;
  reason?: string;
}

export interface NhlTabEvidence {
  status: "evaluated" | "not_evaluated";
  baseline_status: NhlBaselineStatus;
  universe_count: number;
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

/** Minimum share of the universe that must have calculable gap inputs. */
export const GAPPERS_MIN_USABLE_SHARE = 0.01;

export function evaluateGappersEvidence(
  universe: readonly PolygonTicker[],
  selected: readonly PolygonTicker[],
): GappersTabEvidence {
  const universe_count = universe.length;
  let gap_calculable_count = 0;
  let qualified_count = 0;

  for (const t of universe) {
    if (gapPercent(t) !== null) gap_calculable_count += 1;
    if (qualifiesGappers(t)) qualified_count += 1;
  }

  const selected_count = selected.length;
  const usableShare = universe_count > 0 ? gap_calculable_count / universe_count : 0;

  if (
    universe_count > 0 &&
    (gap_calculable_count === 0 || usableShare < GAPPERS_MIN_USABLE_SHARE)
  ) {
    return {
      status: "prerequisite_unavailable",
      universe_count,
      gap_calculable_count,
      qualified_count,
      selected_count,
      reason: "prior_close_gap_inputs_unavailable",
    };
  }

  return {
    status: "evaluated",
    universe_count,
    gap_calculable_count,
    qualified_count,
    selected_count,
  };
}

export function evaluateNhlEvidence(
  universe: readonly PolygonTicker[],
  baselines: ReadonlyMap<string, NhlBaselineQuote>,
  baselineStatus: NhlBaselineStatus,
  selected: readonly NhlClassification[],
): NhlTabEvidence {
  if (baselineStatus !== "available") {
    return {
      status: "not_evaluated",
      baseline_status: baselineStatus,
      universe_count: universe.length,
      selected_count: selected.length,
      reason: `baseline_${baselineStatus}`,
    };
  }

  let evaluated_count = 0;
  let qualified_count = 0;

  for (const t of universe) {
    const sym = normalizeSymbol(t?.ticker);
    if (!sym) continue;
    const baseline = baselines.get(sym);
    if (!isValidBaselineQuote(baseline)) continue;
    const vol = dayVolume(t);
    const price = regularClose(t);
    if (vol === null || !(vol > 0) || price === null || !(price > 0)) continue;
    evaluated_count += 1;
    if (classifyNewHighLow(t, baseline) !== null) qualified_count += 1;
  }

  return {
    status: "evaluated",
    baseline_status: "available",
    universe_count: universe.length,
    evaluated_count,
    qualified_count,
    selected_count: selected.length,
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
