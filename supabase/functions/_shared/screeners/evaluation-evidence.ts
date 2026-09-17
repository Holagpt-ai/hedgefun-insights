/**
 * Compact per-tab evaluation evidence persisted on screener_feed_state.
 * Proves whether a tab was evaluated vs blocked by missing prerequisites.
 *
 * Gappers fail-closed coverage contract:
 * - upstream universe must be non-empty;
 * - at least one volume-active symbol must exist;
 * - every volume-active symbol must be either gap-calculable or
 *   structurally no-prior-session (when baseline coverage evidence is complete);
 * - unresolved gap inputs fail closed.
 * Partial calculability across the active snapshot does not establish coverage.
 *
 * NHL fail-closed coverage contract:
 * - eligible symbols classify as evaluated, policy_excluded, or unresolved;
 * - any unresolved symbol fails closed;
 * - policy-excluded symbols are not evaluated and not qualified.
 */

import type { PolicyExclusionEvidence } from "./baseline-coverage.ts";
import { POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE } from "./baseline-coverage.ts";
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
  hasValidSessionOpen,
  isExplicitZeroPriorDayAggregate,
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
  no_prior_session_count: number;
  unresolved_gap_input_count: number;
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
  policy_excluded_count?: number;
  unresolved_count?: number;
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

export type HistoricalCoverageEvidence = {
  baselineSymbols: ReadonlySet<string>;
  policyExclusions: PolicyExclusionEvidence;
};

function countVolumeActive(universe: readonly PolygonTicker[]): number {
  let count = 0;
  for (const t of universe) {
    const vol = dayVolume(t);
    if (vol !== null && vol > 0) count += 1;
  }
  return count;
}

function hasHistoricalSessionCoverage(
  symbol: string,
  coverage: HistoricalCoverageEvidence | undefined,
): boolean {
  if (!coverage) return false;
  if (coverage.baselineSymbols.has(symbol)) return true;
  return coverage.policyExclusions.available &&
    coverage.policyExclusions.symbols.has(symbol);
}

/**
 * Strict structural no-prior-session: normalized symbol, positive volume,
 * current open finite and > 0, explicit all-zero prior-day OHLCV, and absent
 * from both the current valid baseline set and current-generation
 * policy-exclusion set. If exclusion evidence is unavailable, never classify
 * as no-prior-session.
 */
export function isStructurallyNoPriorSession(
  t: PolygonTicker,
  coverage: HistoricalCoverageEvidence | undefined,
  extendedSession = false,
): boolean {
  if (!coverage?.policyExclusions.available) return false;
  const sym = normalizeSymbol(t?.ticker);
  if (!sym) return false;
  const vol = dayVolume(t);
  if (vol === null || !(vol > 0)) return false;
  if (!hasValidSessionOpen(t, extendedSession)) return false;
  if (!isExplicitZeroPriorDayAggregate(t)) return false;
  if (hasHistoricalSessionCoverage(sym, coverage)) return false;
  return true;
}

export function evaluateGappersEvidence(
  universe: readonly PolygonTicker[],
  selected: readonly PolygonTicker[],
  coverage?: HistoricalCoverageEvidence,
  extendedSession = false,
): GappersTabEvidence {
  const universe_count = universe.length;
  const volume_positive_count = countVolumeActive(universe);
  let gap_calculable_count = 0;
  let no_prior_session_count = 0;
  let unresolved_gap_input_count = 0;
  let qualified_count = 0;

  for (const t of universe) {
    const vol = dayVolume(t);
    const volumeActive = vol !== null && vol > 0;
    if (!volumeActive) continue;
    if (gapPercent(t, extendedSession) !== null) {
      gap_calculable_count += 1;
    } else if (isStructurallyNoPriorSession(t, coverage, extendedSession)) {
      no_prior_session_count += 1;
    } else {
      unresolved_gap_input_count += 1;
    }
    if (qualifiesGappers(t, extendedSession)) qualified_count += 1;
  }

  const selected_count = selected.length;
  const base = {
    universe_count,
    volume_positive_count,
    gap_calculable_count,
    no_prior_session_count,
    unresolved_gap_input_count,
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

  const accountingComplete = unresolved_gap_input_count === 0 &&
    gap_calculable_count + no_prior_session_count === volume_positive_count;

  if (gap_calculable_count === 0) {
    return {
      status: "prerequisite_unavailable",
      ...base,
      reason: accountingComplete
        ? "gap_inputs_not_applicable"
        : "prior_close_gap_inputs_unavailable",
    };
  }

  if (!accountingComplete) {
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
  policyExclusions: PolicyExclusionEvidence = POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE,
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
  let policy_excluded_count = 0;
  let unresolved_count = 0;
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
    if (isValidBaselineQuote(baseline)) {
      evaluated_count += 1;
      if (classifyNewHighLow(t, baseline) !== null) qualified_count += 1;
      continue;
    }
    if (policyExclusions.available && policyExclusions.symbols.has(sym)) {
      policy_excluded_count += 1;
      continue;
    }
    unresolved_count += 1;
  }

  if (eligible_count === 0) {
    return {
      status: "not_evaluated",
      baseline_status: "available",
      eligible_count: 0,
      evaluated_count: 0,
      policy_excluded_count: 0,
      unresolved_count: 0,
      qualified_count: 0,
      ...base,
      reason: "baseline_coverage_empty",
    };
  }

  const accountingComplete = unresolved_count === 0 &&
    evaluated_count + policy_excluded_count === eligible_count;

  if (!accountingComplete) {
    return {
      status: "not_evaluated",
      baseline_status: "available",
      eligible_count,
      evaluated_count,
      policy_excluded_count,
      unresolved_count,
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
    policy_excluded_count,
    unresolved_count,
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
  gainersLosersUniverse: readonly PolygonTicker[];
  gainersLosersSelected: readonly PolygonTicker[];
  unusualSelected: readonly PolygonTicker[];
  nhlBaselineStatus: NhlBaselineStatus;
  nhlBaselines: ReadonlyMap<string, NhlBaselineQuote>;
  nhlSelected: readonly NhlClassification[];
  nhlPolicyExclusions?: PolicyExclusionEvidence;
  extendedSession?: boolean;
}): TabEvaluationEvidenceMap {
  const extendedSession = input.extendedSession ?? false;
  const policyExclusions = input.nhlPolicyExclusions ??
    POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE;
  const coverage: HistoricalCoverageEvidence = {
    baselineSymbols: new Set(input.nhlBaselines.keys()),
    policyExclusions,
  };
  return {
    day_trade_radar: evaluateGenericTabEvidence(
      "day_trade_radar",
      input.universe,
      input.dayTradeSelected,
    ),
    gappers: evaluateGappersEvidence(
      input.universe,
      input.gapperSelected,
      coverage,
      extendedSession,
    ),
    volume_spikes: evaluateGenericTabEvidence(
      "volume_spikes",
      input.universe,
      input.volumeSpikeSelected,
    ),
    gainers_losers: evaluateGenericTabEvidence(
      "gainers_losers",
      input.gainersLosersUniverse,
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
      policyExclusions,
    ),
  };
}
