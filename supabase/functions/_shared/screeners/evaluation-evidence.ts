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
 * - eligible symbols classify as evaluated, policy_excluded, no_history, or unresolved;
 * - any unresolved symbol fails closed;
 * - policy-excluded symbols are not evaluated and not qualified;
 * - no_history applies only when validated exclusion evidence proves the current
 *   baseline generation fully accounted for grouped-daily observations and the
 *   eligible snapshot symbol is absent from both baseline quotes and exclusions.
 */

import type { PolicyExclusionEvidence } from "./baseline-coverage.ts";
import { POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE } from "./baseline-coverage.ts";
import {
  classifyNewHighLow,
  isValidBaselineQuote,
  isVerifiedNhlBaseline,
  type NhlBaselineQuote,
  type NhlBaselineStatus,
  type NhlClassification,
} from "./new-highs-lows.ts";
import {
  currentSessionReferencePrice,
  dayHighLow,
  gapPercent,
  hasValidSessionOpen,
  isExplicitZeroPriorDayAggregate,
  normalizeSymbol,
  gapPercentForTabContext,
  qualifiesDayTradeRadar,
  qualifiesGappers,
  qualifiesUnusualVolume,
  qualifiesVolumeSpikes,
  TAB_QUALIFIERS,
  type PolygonTicker,
  type ScreenerTabId,
} from "./selection.ts";
import {
  sessionQualificationVolume,
  type SessionVolumeCache,
  type SessionVolumeContext,
} from "./session-volume.ts";

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

/** Bounded diagnostic sample persisted on screener_feed_state. Counts remain authoritative. */
export const NHL_DIAGNOSTIC_SYMBOL_CAP = 20;

export interface NhlTabEvidence {
  status: "evaluated" | "not_evaluated";
  baseline_status: NhlBaselineStatus;
  baseline_quote_count: number;
  universe_count: number;
  eligible_count?: number;
  evaluated_count?: number;
  policy_excluded_count?: number;
  no_history_count?: number;
  unresolved_count?: number;
  /** Sample of unresolved symbols (sorted, capped). */
  unresolved_symbols?: string[];
  /** Sample of no-history symbols (sorted, capped). */
  no_history_symbols?: string[];
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

function volumeCtxFromEvidence(
  extendedSession: boolean,
  nowMs?: number,
  observationSessionFields?: boolean,
  cache?: SessionVolumeCache,
): SessionVolumeContext {
  return {
    extendedSession,
    observationSessionVolume: observationSessionFields ?? false,
    nowMs,
    cache,
  };
}

type PrimaryUniverseQualifiedCounts = {
  dayTrade: number;
  volumeSpikes: number;
  unusual: number;
  volumeActive: number;
};

function scanPrimaryUniverseQualifiedCounts(
  universe: readonly PolygonTicker[],
  volumeCtx: SessionVolumeContext,
): PrimaryUniverseQualifiedCounts {
  let dayTrade = 0;
  let volumeSpikes = 0;
  let unusual = 0;
  let volumeActive = 0;
  for (const t of universe) {
    if (sessionQualificationVolume(t, volumeCtx) !== null) volumeActive += 1;
    if (qualifiesDayTradeRadar(t)) dayTrade += 1;
    if (qualifiesVolumeSpikes(t, volumeCtx)) volumeSpikes += 1;
    if (qualifiesUnusualVolume(t, volumeCtx)) unusual += 1;
  }
  return { dayTrade, volumeSpikes, unusual, volumeActive };
}

function countVolumeActive(
  universe: readonly PolygonTicker[],
  volumeCtx: SessionVolumeContext,
): number {
  let count = 0;
  for (const t of universe) {
    if (sessionQualificationVolume(t, volumeCtx) !== null) count += 1;
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
 * True when validated current-generation exclusion evidence proves grouped-daily
 * accounting is complete and the eligible snapshot symbol was never observed in
 * that window (absent from both baseline quotes and policy exclusions).
 * Does not apply when exclusion evidence is unavailable or a baseline row exists
 * but fails quote validation (integrity defect → unresolved).
 */
export function isSafelyClassifiableNoHistory(
  symbol: string,
  baselines: ReadonlyMap<string, NhlBaselineQuote>,
  policyExclusions: PolicyExclusionEvidence,
): boolean {
  if (!policyExclusions.available) return false;
  if (baselines.has(symbol)) return false;
  if (policyExclusions.symbols.has(symbol)) return false;
  return true;
}

function boundedSymbolSample(symbols: string[]): string[] | undefined {
  if (symbols.length === 0) return undefined;
  const sorted = [...symbols].sort((a, b) => a.localeCompare(b));
  if (sorted.length <= NHL_DIAGNOSTIC_SYMBOL_CAP) return sorted;
  return sorted.slice(0, NHL_DIAGNOSTIC_SYMBOL_CAP);
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
  nowMs?: number,
): boolean {
  if (!coverage?.policyExclusions.available) return false;
  const sym = normalizeSymbol(t?.ticker);
  if (!sym) return false;
  const vol = sessionQualificationVolume(t, { extendedSession, nowMs });
  if (vol === null) return false;
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
  nowMs?: number,
  observationSessionFields = false,
  cache?: SessionVolumeCache,
): GappersTabEvidence {
  const volumeCtx = volumeCtxFromEvidence(
    extendedSession,
    nowMs,
    observationSessionFields,
    cache,
  );
  const universe_count = universe.length;
  let volume_positive_count = 0;
  let gap_calculable_count = 0;
  let no_prior_session_count = 0;
  let unresolved_gap_input_count = 0;
  let qualified_count = 0;

  for (const t of universe) {
    const volumeActive = sessionQualificationVolume(t, volumeCtx) !== null;
    if (!volumeActive) continue;
    volume_positive_count += 1;
    if (gapPercentForTabContext(t, {
      extendedSession,
      observationSessionFields,
      nowMs,
    }) !== null) {
      gap_calculable_count += 1;
    } else if (isStructurallyNoPriorSession(t, coverage, extendedSession, nowMs)) {
      no_prior_session_count += 1;
    } else {
      unresolved_gap_input_count += 1;
    }
    if (qualifiesGappers(t, { extendedSession, observationSessionFields, nowMs })) {
      qualified_count += 1;
    }
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
  extendedSession = false,
  nowMs?: number,
  observationSessionFields = false,
  cache?: SessionVolumeCache,
): NhlTabEvidence {
  const volumeCtx = volumeCtxFromEvidence(
    extendedSession,
    nowMs,
    observationSessionFields,
    cache,
  );
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
  let no_history_count = 0;
  let unresolved_count = 0;
  let qualified_count = 0;
  const unresolvedSymbols: string[] = [];
  const noHistorySymbols: string[] = [];

  for (const t of universe) {
    const sym = normalizeSymbol(t?.ticker);
    if (!sym) continue;
    if (sessionQualificationVolume(t, volumeCtx) === null) continue;
    const price = currentSessionReferencePrice(t, extendedSession);
    if (price === null || !(price > 0)) continue;

    eligible_count += 1;

    if (policyExclusions.available && policyExclusions.symbols.has(sym)) {
      policy_excluded_count += 1;
      continue;
    }

    const range = dayHighLow(t);
    if (range.high === null || range.low === null) {
      unresolved_count += 1;
      unresolvedSymbols.push(sym);
      continue;
    }

    const baseline = baselines.get(sym);
    if (isVerifiedNhlBaseline(baseline)) {
      evaluated_count += 1;
      if (classifyNewHighLow(t, baseline, extendedSession) !== null) {
        qualified_count += 1;
      }
      continue;
    }
    if (baseline !== undefined) {
      unresolved_count += 1;
      unresolvedSymbols.push(sym);
      continue;
    }
    if (isSafelyClassifiableNoHistory(sym, baselines, policyExclusions)) {
      no_history_count += 1;
      noHistorySymbols.push(sym);
      continue;
    }
    unresolved_count += 1;
    unresolvedSymbols.push(sym);
  }

  const diagnostic = {
    unresolved_symbols: boundedSymbolSample(unresolvedSymbols),
    no_history_symbols: boundedSymbolSample(noHistorySymbols),
  };

  if (eligible_count === 0) {
    return {
      status: "not_evaluated",
      baseline_status: "available",
      eligible_count: 0,
      evaluated_count: 0,
      policy_excluded_count: 0,
      no_history_count: 0,
      unresolved_count: 0,
      qualified_count: 0,
      ...base,
      reason: "baseline_coverage_empty",
    };
  }

  const accountingComplete = unresolved_count === 0 &&
    evaluated_count + policy_excluded_count + no_history_count === eligible_count;

  if (!accountingComplete) {
    return {
      status: "not_evaluated",
      baseline_status: "available",
      eligible_count,
      evaluated_count,
      policy_excluded_count,
      no_history_count,
      unresolved_count,
      ...diagnostic,
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
    no_history_count,
    unresolved_count,
    ...diagnostic,
    qualified_count,
    ...base,
  };
}

export function evaluateGenericTabEvidence(
  tabId: Exclude<ScreenerTabId, "new_highs_lows" | "gappers">,
  universe: readonly PolygonTicker[],
  selected: readonly PolygonTicker[],
  opts?: {
    extendedSession?: boolean;
    nowMs?: number;
    observationSessionFields?: boolean;
    sessionVolumeCache?: SessionVolumeCache;
    precomputedQualifiedCount?: number;
    precomputedVolumeActive?: number;
  },
): GenericTabEvidence {
  const volumeCtx = volumeCtxFromEvidence(
    opts?.extendedSession ?? false,
    opts?.nowMs,
    opts?.observationSessionFields,
    opts?.sessionVolumeCache,
  );
  const extendedSession = volumeCtx.extendedSession === true;
  const observationSessionFields = volumeCtx.observationSessionVolume === true;
  let qualified_count = opts?.precomputedQualifiedCount;
  if (qualified_count === undefined) {
    qualified_count = 0;
    if (tabId === "volume_spikes") {
      for (const t of universe) {
        if (qualifiesVolumeSpikes(t, volumeCtx)) qualified_count += 1;
      }
    } else if (tabId === "unusual_volume") {
      for (const t of universe) {
        if (qualifiesUnusualVolume(t, volumeCtx)) qualified_count += 1;
      }
    } else {
      const qualify = TAB_QUALIFIERS[tabId];
      for (const t of universe) {
        if (qualify(t)) qualified_count += 1;
      }
    }
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

  const volumeSensitiveTab =
    tabId === "volume_spikes" || tabId === "unusual_volume" || tabId === "gainers_losers";
  if ((extendedSession || observationSessionFields) && volumeSensitiveTab) {
    const volumeActive = opts?.precomputedVolumeActive ??
      countVolumeActive(universe, volumeCtx);
    if (volumeActive === 0) {
      return {
        status: "prerequisite_unavailable",
        universe_count: universe.length,
        qualified_count: 0,
        selected_count: selected.length,
        reason: "no_usable_session_volume",
      };
    }
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
  observationSessionFields?: boolean;
  nowMs?: number;
  sessionVolumeCache?: SessionVolumeCache;
}): TabEvaluationEvidenceMap {
  const extendedSession = input.extendedSession ?? false;
  const observationSessionFields = input.observationSessionFields ?? false;
  const nowMs = input.nowMs;
  const sessionVolumeCache = input.sessionVolumeCache;
  const evidenceOpts = {
    extendedSession,
    observationSessionFields,
    nowMs,
    sessionVolumeCache,
  };
  const volumeCtx = volumeCtxFromEvidence(
    extendedSession,
    nowMs,
    observationSessionFields,
    sessionVolumeCache,
  );
  const primaryCounts = scanPrimaryUniverseQualifiedCounts(
    input.universe,
    volumeCtx,
  );
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
      { precomputedQualifiedCount: primaryCounts.dayTrade },
    ),
    gappers: evaluateGappersEvidence(
      input.universe,
      input.gapperSelected,
      coverage,
      extendedSession,
      nowMs,
      observationSessionFields,
      sessionVolumeCache,
    ),
    volume_spikes: evaluateGenericTabEvidence(
      "volume_spikes",
      input.universe,
      input.volumeSpikeSelected,
      {
        ...evidenceOpts,
        precomputedQualifiedCount: primaryCounts.volumeSpikes,
        precomputedVolumeActive: primaryCounts.volumeActive,
      },
    ),
    gainers_losers: evaluateGenericTabEvidence(
      "gainers_losers",
      input.gainersLosersUniverse,
      input.gainersLosersSelected,
      evidenceOpts,
    ),
    unusual_volume: evaluateGenericTabEvidence(
      "unusual_volume",
      input.universe,
      input.unusualSelected,
      {
        ...evidenceOpts,
        precomputedQualifiedCount: primaryCounts.unusual,
        precomputedVolumeActive: primaryCounts.volumeActive,
      },
    ),
    new_highs_lows: evaluateNhlEvidence(
      input.universe,
      input.nhlBaselines,
      input.nhlBaselineStatus,
      input.nhlSelected,
      policyExclusions,
      extendedSession,
      nowMs,
      observationSessionFields,
      sessionVolumeCache,
    ),
  };
}
