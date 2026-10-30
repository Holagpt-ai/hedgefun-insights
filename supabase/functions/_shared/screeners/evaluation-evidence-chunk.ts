/**
 * Chunk-accumulated tab evaluation evidence — counts merge additively across
 * universe slices; finalize applies the same fail-closed rules as full scans.
 */

import type { PolicyExclusionEvidence } from "./baseline-coverage.ts";
import {
  boundedSymbolSample,
  evaluateGenericTabEvidence,
  isSafelyClassifiableNoHistory,
  isStructurallyNoPriorSession,
  type GappersTabEvidence,
  type HistoricalCoverageEvidence,
  type NhlTabEvidence,
  type TabEvaluationEvidenceMap,
} from "./evaluation-evidence.ts";
import {
  classifyNewHighLow,
  isVerifiedNhlBaseline,
  type NhlBaselineQuote,
  type NhlBaselineStatus,
  type NhlClassification,
} from "./new-highs-lows.ts";
import {
  currentSessionReferencePrice,
  dayHighLow,
  gapPercentForTabContext,
  normalizeSymbol,
  qualifiesDayTradeRadar,
  qualifiesGappers,
  qualifiesUnusualVolume,
  qualifiesVolumeSpikes,
  type PolygonTicker,
} from "./selection.ts";
import {
  sessionQualificationVolume,
  type SessionVolumeCache,
  type SessionVolumeContext,
} from "./session-volume.ts";

export type GappersEvidenceAccum = {
  volume_positive_count: number;
  gap_calculable_count: number;
  no_prior_session_count: number;
  unresolved_gap_input_count: number;
  qualified_count: number;
};

export function createEmptyGappersEvidenceAccum(): GappersEvidenceAccum {
  return {
    volume_positive_count: 0,
    gap_calculable_count: 0,
    no_prior_session_count: 0,
    unresolved_gap_input_count: 0,
    qualified_count: 0,
  };
}

export function mergeGappersEvidenceAccums(
  a: GappersEvidenceAccum,
  b: GappersEvidenceAccum,
): GappersEvidenceAccum {
  return {
    volume_positive_count: a.volume_positive_count + b.volume_positive_count,
    gap_calculable_count: a.gap_calculable_count + b.gap_calculable_count,
    no_prior_session_count: a.no_prior_session_count + b.no_prior_session_count,
    unresolved_gap_input_count: a.unresolved_gap_input_count +
      b.unresolved_gap_input_count,
    qualified_count: a.qualified_count + b.qualified_count,
  };
}

export function accumulateGappersEvidenceChunk(
  acc: GappersEvidenceAccum,
  universe: readonly PolygonTicker[],
  coverage: HistoricalCoverageEvidence,
  extendedSession: boolean,
  nowMs?: number,
  observationSessionFields = false,
  cache?: SessionVolumeCache,
): void {
  const volumeCtx: SessionVolumeContext = {
    extendedSession,
    observationSessionVolume: observationSessionFields,
    nowMs,
    cache,
  };
  for (const t of universe) {
    if (sessionQualificationVolume(t, volumeCtx) === null) continue;
    acc.volume_positive_count += 1;
    if (
      gapPercentForTabContext(t, {
        extendedSession,
        observationSessionFields,
        nowMs,
      }) !== null
    ) {
      acc.gap_calculable_count += 1;
    } else if (
      isStructurallyNoPriorSession(t, coverage, extendedSession, nowMs)
    ) {
      acc.no_prior_session_count += 1;
    } else {
      acc.unresolved_gap_input_count += 1;
    }
    if (
      qualifiesGappers(t, {
        extendedSession,
        observationSessionFields,
        nowMs,
      })
    ) {
      acc.qualified_count += 1;
    }
  }
}

export function finalizeGappersEvidenceFromAccum(
  acc: GappersEvidenceAccum,
  universe_count: number,
  selected_count: number,
): GappersTabEvidence {
  const base = {
    universe_count,
    volume_positive_count: acc.volume_positive_count,
    gap_calculable_count: acc.gap_calculable_count,
    no_prior_session_count: acc.no_prior_session_count,
    unresolved_gap_input_count: acc.unresolved_gap_input_count,
    qualified_count: acc.qualified_count,
    selected_count,
  };
  if (universe_count === 0) {
    return {
      status: "prerequisite_unavailable",
      ...base,
      reason: "upstream_universe_empty",
    };
  }
  if (acc.volume_positive_count === 0) {
    return {
      status: "prerequisite_unavailable",
      ...base,
      reason: "no_volume_active_universe",
    };
  }
  const accountingComplete = acc.unresolved_gap_input_count === 0 &&
    acc.gap_calculable_count + acc.no_prior_session_count ===
      acc.volume_positive_count;
  if (acc.gap_calculable_count === 0) {
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
  return { status: "evaluated", ...base };
}

export type PrimaryQualifiedAccum = {
  dayTrade: number;
  volumeSpikes: number;
  unusual: number;
  volumeActive: number;
};

export function createEmptyPrimaryQualifiedAccum(): PrimaryQualifiedAccum {
  return { dayTrade: 0, volumeSpikes: 0, unusual: 0, volumeActive: 0 };
}

export function mergePrimaryQualifiedAccums(
  a: PrimaryQualifiedAccum,
  b: PrimaryQualifiedAccum,
): PrimaryQualifiedAccum {
  return {
    dayTrade: a.dayTrade + b.dayTrade,
    volumeSpikes: a.volumeSpikes + b.volumeSpikes,
    unusual: a.unusual + b.unusual,
    volumeActive: a.volumeActive + b.volumeActive,
  };
}

export function accumulatePrimaryQualifiedChunk(
  acc: PrimaryQualifiedAccum,
  universe: readonly PolygonTicker[],
  volumeCtx: SessionVolumeContext,
): void {
  for (const t of universe) {
    if (sessionQualificationVolume(t, volumeCtx) !== null) {
      acc.volumeActive += 1;
    }
    if (qualifiesDayTradeRadar(t)) acc.dayTrade += 1;
    if (qualifiesVolumeSpikes(t, volumeCtx)) acc.volumeSpikes += 1;
    if (qualifiesUnusualVolume(t, volumeCtx)) acc.unusual += 1;
  }
}

export type NhlEvidenceAccum = {
  eligible_count: number;
  evaluated_count: number;
  policy_excluded_count: number;
  no_history_count: number;
  unresolved_count: number;
  qualified_count: number;
  unresolvedSymbols: string[];
  noHistorySymbols: string[];
};

export function createEmptyNhlEvidenceAccum(): NhlEvidenceAccum {
  return {
    eligible_count: 0,
    evaluated_count: 0,
    policy_excluded_count: 0,
    no_history_count: 0,
    unresolved_count: 0,
    qualified_count: 0,
    unresolvedSymbols: [],
    noHistorySymbols: [],
  };
}

export function mergeNhlEvidenceAccums(
  a: NhlEvidenceAccum,
  b: NhlEvidenceAccum,
): NhlEvidenceAccum {
  return {
    eligible_count: a.eligible_count + b.eligible_count,
    evaluated_count: a.evaluated_count + b.evaluated_count,
    policy_excluded_count: a.policy_excluded_count + b.policy_excluded_count,
    no_history_count: a.no_history_count + b.no_history_count,
    unresolved_count: a.unresolved_count + b.unresolved_count,
    qualified_count: a.qualified_count + b.qualified_count,
    unresolvedSymbols: [...a.unresolvedSymbols, ...b.unresolvedSymbols],
    noHistorySymbols: [...a.noHistorySymbols, ...b.noHistorySymbols],
  };
}

export function accumulateNhlEvidenceChunk(
  acc: NhlEvidenceAccum,
  universe: readonly PolygonTicker[],
  baselines: ReadonlyMap<string, NhlBaselineQuote>,
  policyExclusions: PolicyExclusionEvidence,
  extendedSession: boolean,
  nowMs?: number,
  observationSessionFields = false,
  cache?: SessionVolumeCache,
): void {
  const volumeCtx: SessionVolumeContext = {
    extendedSession,
    observationSessionVolume: observationSessionFields,
    nowMs,
    cache,
  };
  for (const t of universe) {
    const sym = normalizeSymbol(t?.ticker);
    if (!sym) continue;
    if (sessionQualificationVolume(t, volumeCtx) === null) continue;
    const price = currentSessionReferencePrice(t, extendedSession);
    if (price === null || !(price > 0)) continue;
    acc.eligible_count += 1;
    if (policyExclusions.available && policyExclusions.symbols.has(sym)) {
      acc.policy_excluded_count += 1;
      continue;
    }
    const range = dayHighLow(t);
    if (range.high === null || range.low === null) {
      acc.unresolved_count += 1;
      acc.unresolvedSymbols.push(sym);
      continue;
    }
    const baseline = baselines.get(sym);
    if (isVerifiedNhlBaseline(baseline)) {
      acc.evaluated_count += 1;
      if (
        classifyNewHighLow(
          t,
          baseline,
          extendedSession,
          volumeCtx,
          observationSessionFields,
          nowMs,
        ) !== null
      ) {
        acc.qualified_count += 1;
      }
      continue;
    }
    if (baseline !== undefined) {
      acc.unresolved_count += 1;
      acc.unresolvedSymbols.push(sym);
      continue;
    }
    if (isSafelyClassifiableNoHistory(sym, baselines, policyExclusions)) {
      acc.no_history_count += 1;
      acc.noHistorySymbols.push(sym);
      continue;
    }
    acc.unresolved_count += 1;
    acc.unresolvedSymbols.push(sym);
  }
}

export function finalizeNhlEvidenceFromAccum(
  acc: NhlEvidenceAccum,
  baselineStatus: NhlBaselineStatus,
  baseline_quote_count: number,
  universe_count: number,
  selected_count: number,
): NhlTabEvidence {
  const base = {
    baseline_quote_count,
    universe_count,
    selected_count,
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
  const diagnostic = {
    unresolved_symbols: boundedSymbolSample(acc.unresolvedSymbols),
    no_history_symbols: boundedSymbolSample(acc.noHistorySymbols),
  };
  if (acc.eligible_count === 0) {
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
  const accountingComplete = acc.unresolved_count === 0 &&
    acc.evaluated_count + acc.policy_excluded_count + acc.no_history_count ===
      acc.eligible_count;
  if (!accountingComplete) {
    return {
      status: "not_evaluated",
      baseline_status: "available",
      eligible_count: acc.eligible_count,
      evaluated_count: acc.evaluated_count,
      policy_excluded_count: acc.policy_excluded_count,
      no_history_count: acc.no_history_count,
      unresolved_count: acc.unresolved_count,
      ...diagnostic,
      qualified_count: acc.qualified_count,
      ...base,
      reason: "baseline_coverage_incomplete",
    };
  }
  return {
    status: "evaluated",
    baseline_status: "available",
    eligible_count: acc.eligible_count,
    evaluated_count: acc.evaluated_count,
    policy_excluded_count: acc.policy_excluded_count,
    no_history_count: acc.no_history_count,
    unresolved_count: acc.unresolved_count,
    ...diagnostic,
    qualified_count: acc.qualified_count,
    ...base,
  };
}

export function buildTabEvaluationEvidenceFromChunkAccums(input: {
  universe: readonly PolygonTicker[];
  gappersAccum: GappersEvidenceAccum;
  primaryAccum: PrimaryQualifiedAccum;
  nhlAccum: NhlEvidenceAccum;
  nhlBaselineStatus: NhlBaselineStatus;
  nhlBaselines: ReadonlyMap<string, NhlBaselineQuote>;
  dayTradeSelected: readonly PolygonTicker[];
  gapperSelected: readonly PolygonTicker[];
  volumeSpikeSelected: readonly PolygonTicker[];
  gainersLosersUniverse: readonly PolygonTicker[];
  gainersLosersSelected: readonly PolygonTicker[];
  unusualSelected: readonly PolygonTicker[];
  nhlSelected: readonly NhlClassification[];
  extendedSession?: boolean;
  observationSessionFields?: boolean;
  nowMs?: number;
  sessionVolumeCache?: SessionVolumeCache;
}): TabEvaluationEvidenceMap {
  const evidenceOpts = {
    extendedSession: input.extendedSession ?? false,
    observationSessionFields: input.observationSessionFields ?? false,
    nowMs: input.nowMs,
    sessionVolumeCache: input.sessionVolumeCache,
  };
  const universe_count = input.universe.length;
  return {
    day_trade_radar: evaluateGenericTabEvidence(
      "day_trade_radar",
      input.universe,
      input.dayTradeSelected,
      { precomputedQualifiedCount: input.primaryAccum.dayTrade },
    ),
    gappers: finalizeGappersEvidenceFromAccum(
      input.gappersAccum,
      universe_count,
      input.gapperSelected.length,
    ),
    volume_spikes: evaluateGenericTabEvidence(
      "volume_spikes",
      input.universe,
      input.volumeSpikeSelected,
      {
        ...evidenceOpts,
        precomputedQualifiedCount: input.primaryAccum.volumeSpikes,
        precomputedVolumeActive: input.primaryAccum.volumeActive,
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
        precomputedQualifiedCount: input.primaryAccum.unusual,
        precomputedVolumeActive: input.primaryAccum.volumeActive,
      },
    ),
    new_highs_lows: finalizeNhlEvidenceFromAccum(
      input.nhlAccum,
      input.nhlBaselineStatus,
      input.nhlBaselines.size,
      universe_count,
      input.nhlSelected.length,
    ),
  };
}
