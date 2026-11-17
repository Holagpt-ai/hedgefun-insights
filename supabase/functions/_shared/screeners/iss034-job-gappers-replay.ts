/**
 * ISS-034 — Full-job Gappers replay from Lovable-exported `screener_sync_generation_jobs` row.
 * Uses frozen job observation clock, universe, merged gappersAccum, and nhl_baseline_snapshot.
 */

import type { GappersEvidenceAccum } from "./evaluation-evidence-chunk.ts";
import { deserializeMergedArtifacts } from "./sync-staging-serialize.ts";
import {
  parseNhlBaselineSnapshotFromStorage,
  quotesFromSnapshot,
  type FrozenNhlBaselineSnapshot,
} from "./nhl-baseline-snapshot.ts";
import {
  compareGappersGapInputAccounting,
  type GappersGapInputAccounting,
} from "./gappers-gap-input-accounting.ts";
import {
  isStructurallyNoPriorSession,
  type HistoricalCoverageEvidence,
} from "./evaluation-evidence.ts";
import { normalizeSymbol, type PolygonTicker } from "./selection.ts";
import { createSessionVolumeCache } from "./session-volume.ts";

export const ISS034_NOV16_TARGET_JOB_ID =
  "4ed4a4c7-d8c4-4582-bd89-cc949d6e291d";

export const ISS034_STORED_COUNTERS = [
  "volume_positive_count",
  "gap_calculable_count",
  "no_prior_session_count",
  "split_scale_suppressed_count",
  "unresolved_gap_input_count",
] as const;

export type Iss034StoredCounter = (typeof ISS034_STORED_COUNTERS)[number];

export class Iss034ReplayInputError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "Iss034ReplayInputError";
  }
}

export type Iss034ParsedJobExport = {
  jobId: string;
  syncRunId: string;
  nowMs: number;
  extendedSession: boolean;
  observationSessionFields: boolean;
  allTickers: PolygonTicker[];
  gappersAccum: GappersEvidenceAccum;
  nhlBaselineSnapshot: FrozenNhlBaselineSnapshot;
};

export type Iss034ReplayInputIntegrity = {
  job_id: string;
  sync_run_id: string;
  now_ms: number;
  extended_session: boolean;
  observation_session_fields: boolean;
  universe_count: number;
  baseline_generation_id: string;
  baseline_status: string;
  frozen_at_ms: number;
  quote_entry_count: number;
  policy_exclusion_available: boolean;
  policy_excluded_count: number | null;
};

export type Iss034CounterReconciliation = {
  stored: Partial<Record<Iss034StoredCounter, number>>;
  replayed: Pick<GappersGapInputAccounting, Iss034StoredCounter>;
  matches: Record<Iss034StoredCounter, boolean>;
  mismatches: Iss034StoredCounter[];
};

export type Iss034JobGappersReplayResult = {
  target_job_id: typeof ISS034_NOV16_TARGET_JOB_ID;
  is_target_job: boolean;
  replay_input_integrity: Iss034ReplayInputIntegrity;
  stored_gappers_accum: GappersEvidenceAccum;
  replay: GappersGapInputAccounting;
  counter_reconciliation: Iss034CounterReconciliation;
  with_helper_unresolved_delta: number;
  historical_coverage: {
    baseline_symbol_count: number;
    policy_exclusion_symbol_count: number;
  };
};

function requireString(
  o: Record<string, unknown>,
  key: string,
  code: string,
): string {
  const v = o[key];
  if (typeof v !== "string" || v.trim() === "") {
    throw new Iss034ReplayInputError(code, `Missing or invalid string field: ${key}`);
  }
  return v;
}

function requireObservation(
  raw: unknown,
): {
  nowMs: number;
  extendedSession: boolean;
  observationSessionFields: boolean;
} {
  if (!raw || typeof raw !== "object") {
    throw new Iss034ReplayInputError(
      "observation_missing",
      "observation is required",
    );
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.nowMs !== "number" || !Number.isFinite(o.nowMs)) {
    throw new Iss034ReplayInputError(
      "observation_now_ms_missing",
      "observation.nowMs is required (job clock; do not substitute Date.now)",
    );
  }
  if (typeof o.extendedSession !== "boolean") {
    throw new Iss034ReplayInputError(
      "observation_extended_session_missing",
      "observation.extendedSession is required (boolean)",
    );
  }
  if (typeof o.observationSessionFields !== "boolean") {
    throw new Iss034ReplayInputError(
      "observation_session_fields_missing",
      "observation.observationSessionFields is required (boolean)",
    );
  }
  return {
    nowMs: o.nowMs,
    extendedSession: o.extendedSession,
    observationSessionFields: o.observationSessionFields,
  };
}

export function historicalCoverageFromFrozenSnapshot(
  snap: FrozenNhlBaselineSnapshot,
): HistoricalCoverageEvidence {
  const baselineSymbols = new Set<string>();
  for (const [sym] of snap.quoteEntries) {
    const normalized = normalizeSymbol(sym);
    if (normalized) baselineSymbols.add(normalized);
  }
  return {
    baselineSymbols,
    policyExclusions: snap.policyExclusions,
  };
}

export function parseIss034JobExport(raw: unknown): Iss034ParsedJobExport {
  if (!raw || typeof raw !== "object") {
    throw new Iss034ReplayInputError("export_invalid", "Job export must be a JSON object");
  }
  const o = raw as Record<string, unknown>;
  const jobId = requireString(o, "id", "id_missing");
  const syncRunId = requireString(o, "sync_run_id", "sync_run_id_missing");
  const obs = requireObservation(o.observation);

  if (!Array.isArray(o.all_tickers) || o.all_tickers.length === 0) {
    throw new Iss034ReplayInputError(
      "all_tickers_missing",
      "all_tickers must be a non-empty array",
    );
  }

  if (o.merged_artifacts == null || typeof o.merged_artifacts !== "object") {
    throw new Iss034ReplayInputError(
      "merged_artifacts_missing",
      "merged_artifacts is required",
    );
  }
  const merged = deserializeMergedArtifacts(o.merged_artifacts);

  const snap = parseNhlBaselineSnapshotFromStorage(o.nhl_baseline_snapshot);
  if (!snap) {
    throw new Iss034ReplayInputError(
      "nhl_baseline_snapshot_invalid",
      "nhl_baseline_snapshot is required and must parse (frozen quoteEntries + policyExclusions)",
    );
  }
  if (snap.quoteEntries.length === 0 && !snap.policyExclusions.available) {
    throw new Iss034ReplayInputError(
      "nhl_baseline_snapshot_empty",
      "nhl_baseline_snapshot has no quoteEntries and policy exclusion evidence unavailable",
    );
  }

  return {
    jobId,
    syncRunId,
    nowMs: obs.nowMs,
    extendedSession: obs.extendedSession,
    observationSessionFields: obs.observationSessionFields,
    allTickers: o.all_tickers as PolygonTicker[],
    gappersAccum: merged.gappersAccum,
    nhlBaselineSnapshot: snap,
  };
}

function reconcileCounters(
  stored: GappersEvidenceAccum,
  replayed: GappersGapInputAccounting,
): Iss034CounterReconciliation {
  const storedPartial: Partial<Record<Iss034StoredCounter, number>> = {};
  const matches = {} as Record<Iss034StoredCounter, boolean>;
  const mismatches: Iss034StoredCounter[] = [];
  for (const key of ISS034_STORED_COUNTERS) {
    const s = stored[key];
    const r = replayed[key];
    storedPartial[key] = s;
    const ok = typeof s === "number" && Number.isFinite(s) && s === r;
    matches[key] = ok;
    if (!ok) mismatches.push(key);
  }
  return {
    stored: storedPartial,
    replayed: {
      volume_positive_count: replayed.volume_positive_count,
      gap_calculable_count: replayed.gap_calculable_count,
      no_prior_session_count: replayed.no_prior_session_count,
      split_scale_suppressed_count: replayed.split_scale_suppressed_count,
      unresolved_gap_input_count: replayed.unresolved_gap_input_count,
    },
    matches,
    mismatches,
  };
}

export function runIss034JobGappersReplay(
  parsed: Iss034ParsedJobExport,
): Iss034JobGappersReplayResult {
  const coverage = historicalCoverageFromFrozenSnapshot(parsed.nhlBaselineSnapshot);
  const nowMs = parsed.nowMs;
  const extendedSession = parsed.extendedSession;
  const observationSessionFields = parsed.observationSessionFields;

  const replayOpts = {
    extendedSession,
    observationSessionFields,
    nowMs,
    cache: createSessionVolumeCache({
      nowMs,
      observationSessionVolume: observationSessionFields,
      extendedSession,
    }),
    isStructurallyNoPriorSession: (t: PolygonTicker) =>
      isStructurallyNoPriorSession(t, coverage, extendedSession, nowMs),
  };

  const { baseline, withHelper } = compareGappersGapInputAccounting(
    parsed.allTickers,
    replayOpts,
  );

  const snap = parsed.nhlBaselineSnapshot;
  const quoteCount = snap.quoteEntries.length;

  return {
    target_job_id: ISS034_NOV16_TARGET_JOB_ID,
    is_target_job: parsed.jobId === ISS034_NOV16_TARGET_JOB_ID,
    replay_input_integrity: {
      job_id: parsed.jobId,
      sync_run_id: parsed.syncRunId,
      now_ms: nowMs,
      extended_session: extendedSession,
      observation_session_fields: observationSessionFields,
      universe_count: parsed.allTickers.length,
      baseline_generation_id: snap.baselineGenerationId,
      baseline_status: snap.status,
      frozen_at_ms: snap.frozenAtMs,
      quote_entry_count: quoteCount,
      policy_exclusion_available: snap.policyExclusions.available,
      policy_excluded_count: snap.policyExclusions.excluded_count,
    },
    stored_gappers_accum: parsed.gappersAccum,
    replay: baseline,
    counter_reconciliation: reconcileCounters(parsed.gappersAccum, baseline),
    with_helper_unresolved_delta:
      withHelper.unresolved_gap_input_count - baseline.unresolved_gap_input_count,
    historical_coverage: {
      baseline_symbol_count: coverage.baselineSymbols.size,
      policy_exclusion_symbol_count: snap.policyExclusions.symbols.size,
    },
  };
}

export function replayIss034JobExport(raw: unknown): Iss034JobGappersReplayResult {
  return runIss034JobGappersReplay(parseIss034JobExport(raw));
}

/** Sanity check that snapshot quotes map matches parse result (export integrity probe). */
export function snapshotQuoteCount(snap: FrozenNhlBaselineSnapshot): number {
  return quotesFromSnapshot(snap).size;
}