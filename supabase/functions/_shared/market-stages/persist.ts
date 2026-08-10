// Stocksist Market Stages — Phase P2D
// Forward persistence adapter. Calls locked reducer once, then one RPC.
// No Edge entrypoint, replay, correction rebuild, cron, or alert delivery.

import {
  ALGORITHM_ID,
  type CandidateStage,
  type ClassifyMetrics,
  type ClassifyResult,
  type ReasonCode,
} from "./classify.ts";
import {
  reduceMarketStageTransition,
  type EvaluationStatus,
  type ReduceResult,
  type ReduceResultCode,
  type TransitionEvaluation,
  type TransitionEventDraft,
  type TransitionState,
} from "./transitions.ts";

export { ALGORITHM_ID };

export const PERSIST_RPC_NAME = "persist_market_stage_forward_v1" as const;

export type DbError = { message: string };

export type DbResult<T> = {
  data: T | null;
  error: DbError | null;
};

type EqChain = {
  eq(column: string, value: unknown): EqChain;
  maybeSingle(): Promise<DbResult<Record<string, unknown>>>;
};

export type MarketStagePersistDb = {
  from(table: string): {
    select(columns: string): EqChain;
  };
  rpc(
    fn: typeof PERSIST_RPC_NAME,
    args: PersistRpcArgs,
  ): Promise<DbResult<PersistRpcPayload>>;
};

export type PersistRpcArgs = {
  p_symbol: string;
  p_algorithm_id: string;
  p_expected_generation_id: string | null;
  p_expected_revision: number;
  p_effective_week_end: string;
  p_evaluation_status: EvaluationStatus;
  p_candidate_stage: CandidateStage | null;
  p_input_fingerprint: string | null;
  p_p1_status: ClassifyResult["status"] | null;
  p_reason_codes: ReasonCode[] | [];
  p_metrics: ClassifyMetrics | Record<string, never>;
  p_calculated_at: string;
  p_confirmed_stage: CandidateStage | null;
  p_confirmed_effective_week_end: string | null;
  p_confirmed_at_week_end: string | null;
  p_pending_stage: CandidateStage | null;
  p_pending_count: 0 | 1;
  p_pending_start_week_end: string | null;
  p_latest_processed_week_end: string;
  p_latest_input_fingerprint: string | null;
  p_latest_evaluation_status: EvaluationStatus;
  p_latest_valid_candidate: CandidateStage | null;
  p_latest_valid_candidate_week_end: string | null;
  p_latest_data_effective_week_end: string | null;
  p_next_revision: number;
  p_transition: PersistTransitionPayload | null;
};

export type PersistTransitionPayload = {
  from_stage: CandidateStage;
  to_stage: CandidateStage;
  pending_start_week_end: string;
  effective_week_end: string;
  confirmed_week_end: string;
  calculated_at: string;
  confirmation_input_fingerprint: string;
  reason_codes: ReasonCode[];
  metrics_snapshot: ClassifyMetrics;
  event_identity: string;
};

export type PersistRpcPayload = {
  ok: boolean;
  outcome: string;
  generation_id?: string;
  revision?: number;
  current_revision?: number;
};

export type PersistStatus =
  | "applied"
  | "no_op"
  | "replay_required"
  | "rejected"
  | "stale_revision"
  | "inactive_generation"
  | "database_failure"
  | "transition_conflict";

export type PersistResultCode =
  | ReduceResultCode
  | "applied"
  | "duplicate_transition"
  | "stale_revision"
  | "inactive_generation"
  | "database_failure"
  | "transition_conflict";

export type PersistResult = {
  status: PersistStatus;
  resultCode: PersistResultCode;
  reduce: ReduceResult | null;
  generationId: string | null;
  revision: number | null;
  wrote: boolean;
};

type EvaluationWrite = {
  evaluationStatus: EvaluationStatus;
  candidateStage: CandidateStage | null;
  inputFingerprint: string | null;
  p1Status: ClassifyResult["status"] | null;
  reasonCodes: ReasonCode[] | [];
  metrics: ClassifyMetrics | Record<string, never>;
};

function persistResult(
  status: PersistStatus,
  resultCode: PersistResultCode,
  opts: {
    reduce?: ReduceResult | null;
    generationId?: string | null;
    revision?: number | null;
    wrote?: boolean;
  } = {},
): PersistResult {
  return {
    status,
    resultCode,
    reduce: opts.reduce ?? null,
    generationId: opts.generationId ?? null,
    revision: opts.revision ?? null,
    wrote: opts.wrote ?? false,
  };
}

function asCandidate(value: unknown): CandidateStage | null {
  if (value === null || value === undefined) return null;
  if (
    value === "stage_1" ||
    value === "stage_2" ||
    value === "stage_3" ||
    value === "stage_4" ||
    value === "unclassified"
  ) {
    return value;
  }
  return null;
}

function asEvaluationStatus(value: unknown): EvaluationStatus | null {
  if (
    value === "ok" ||
    value === "insufficient_data" ||
    value === "invalid_input" ||
    value === "unavailable"
  ) {
    return value;
  }
  return null;
}

function asPendingCount(value: unknown): 0 | 1 | null {
  if (value === 0 || value === 1) return value;
  if (value === "0") return 0;
  if (value === "1") return 1;
  return null;
}

function asIsoDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function mapStateRow(
  row: Record<string, unknown>,
): TransitionState | null {
  const symbol = typeof row.symbol === "string" ? row.symbol : null;
  const algorithmId = row.algorithm_id;
  const pendingCount = asPendingCount(row.pending_count);
  const latestStatus = asEvaluationStatus(row.latest_evaluation_status);
  const latestProcessed = asIsoDate(row.latest_processed_week_end);
  const revisionRaw = row.revision;
  const revision = typeof revisionRaw === "number"
    ? revisionRaw
    : typeof revisionRaw === "string" && /^-?\d+$/.test(revisionRaw)
    ? Number(revisionRaw)
    : NaN;

  if (
    symbol === null ||
    algorithmId !== ALGORITHM_ID ||
    pendingCount === null ||
    latestStatus === null ||
    latestProcessed === null ||
    !Number.isInteger(revision) ||
    revision < 1
  ) {
    return null;
  }

  return {
    symbol,
    algorithmId: ALGORITHM_ID,
    confirmedStage: asCandidate(row.confirmed_stage),
    confirmedEffectiveWeekEnd: asIsoDate(row.confirmed_effective_week_end),
    confirmedAtWeekEnd: asIsoDate(row.confirmed_at_week_end),
    pendingStage: asCandidate(row.pending_stage),
    pendingCount,
    pendingStartWeekEnd: asIsoDate(row.pending_start_week_end),
    latestProcessedWeekEnd: latestProcessed,
    latestInputFingerprint: typeof row.latest_input_fingerprint === "string"
      ? row.latest_input_fingerprint
      : row.latest_input_fingerprint === null
      ? null
      : null,
    latestEvaluationStatus: latestStatus,
    latestValidCandidate: asCandidate(row.latest_valid_candidate),
    latestValidCandidateWeekEnd: asIsoDate(
      row.latest_valid_candidate_week_end,
    ),
    latestDataEffectiveWeekEnd: asIsoDate(row.latest_data_effective_week_end),
    revision,
  };
}

function mapEvaluationWrite(evaluation: TransitionEvaluation): EvaluationWrite {
  const c = evaluation.classification;
  if (c === null) {
    return {
      evaluationStatus: "unavailable",
      candidateStage: null,
      inputFingerprint: null,
      p1Status: null,
      reasonCodes: [],
      metrics: {},
    };
  }
  return {
    evaluationStatus: c.status,
    candidateStage: c.candidateStage,
    inputFingerprint: evaluation.inputFingerprint,
    p1Status: c.status,
    reasonCodes: [...c.reasonCodes],
    metrics: { ...c.metrics },
  };
}

function mapTransitionPayload(
  event: TransitionEventDraft,
): PersistTransitionPayload {
  return {
    from_stage: event.fromStage,
    to_stage: event.toStage,
    pending_start_week_end: event.pendingStartWeekEnd,
    effective_week_end: event.effectiveWeekEnd,
    confirmed_week_end: event.confirmedWeekEnd,
    calculated_at: event.calculatedAt,
    confirmation_input_fingerprint: event.confirmationInputFingerprint,
    reason_codes: [...event.reasonCodes],
    metrics_snapshot: { ...event.metricsSnapshot },
    event_identity: event.eventIdentity,
  };
}

function buildRpcArgs(
  evaluation: TransitionEvaluation,
  next: TransitionState,
  expectedGenerationId: string | null,
  expectedRevision: number,
  event: TransitionEventDraft | null,
): PersistRpcArgs {
  const write = mapEvaluationWrite(evaluation);
  return {
    p_symbol: evaluation.symbol,
    p_algorithm_id: evaluation.algorithmId,
    p_expected_generation_id: expectedGenerationId,
    p_expected_revision: expectedRevision,
    p_effective_week_end: evaluation.effectiveWeekEnd,
    p_evaluation_status: write.evaluationStatus,
    p_candidate_stage: write.candidateStage,
    p_input_fingerprint: write.inputFingerprint,
    p_p1_status: write.p1Status,
    p_reason_codes: write.reasonCodes,
    p_metrics: write.metrics,
    p_calculated_at: evaluation.calculatedAt,
    p_confirmed_stage: next.confirmedStage,
    p_confirmed_effective_week_end: next.confirmedEffectiveWeekEnd,
    p_confirmed_at_week_end: next.confirmedAtWeekEnd,
    p_pending_stage: next.pendingStage,
    p_pending_count: next.pendingCount,
    p_pending_start_week_end: next.pendingStartWeekEnd,
    p_latest_processed_week_end: next.latestProcessedWeekEnd,
    p_latest_input_fingerprint: next.latestInputFingerprint,
    p_latest_evaluation_status: next.latestEvaluationStatus,
    p_latest_valid_candidate: next.latestValidCandidate,
    p_latest_valid_candidate_week_end: next.latestValidCandidateWeekEnd,
    p_latest_data_effective_week_end: next.latestDataEffectiveWeekEnd,
    p_next_revision: next.revision,
    p_transition: event ? mapTransitionPayload(event) : null,
  };
}

function mapRpcOutcome(
  payload: PersistRpcPayload,
  reduce: ReduceResult,
): PersistResult {
  if (payload.ok === true && payload.outcome === "applied") {
    return persistResult("applied", "applied", {
      reduce,
      generationId: payload.generation_id ?? null,
      revision: typeof payload.revision === "number" ? payload.revision : null,
      wrote: true,
    });
  }
  if (
    payload.ok === true &&
    (payload.outcome === "duplicate_transition" ||
      payload.outcome === "duplicate_evaluation")
  ) {
    return persistResult(
      "no_op",
      payload.outcome === "duplicate_transition"
        ? "duplicate_transition"
        : "duplicate_evaluation",
      {
        reduce,
        generationId: payload.generation_id ?? null,
        revision: typeof payload.revision === "number" ? payload.revision : null,
        wrote: false,
      },
    );
  }
  if (payload.ok === false && payload.outcome === "stale_revision") {
    return persistResult("stale_revision", "stale_revision", {
      reduce,
      revision: typeof payload.current_revision === "number"
        ? payload.current_revision
        : null,
      wrote: false,
    });
  }
  if (payload.ok === false && payload.outcome === "inactive_generation") {
    return persistResult("inactive_generation", "inactive_generation", {
      reduce,
      wrote: false,
    });
  }
  if (payload.outcome === "transition_conflict") {
    return persistResult("transition_conflict", "transition_conflict", {
      reduce,
      wrote: false,
    });
  }
  return persistResult("database_failure", "database_failure", {
    reduce,
    wrote: false,
  });
}

/**
 * Persist one forward weekly evaluation for (symbol, algorithm).
 * Runs the locked reducer exactly once. Mutations go through one RPC only.
 */
export async function persistMarketStageForward(
  db: MarketStagePersistDb,
  evaluation: TransitionEvaluation,
): Promise<PersistResult> {
  const generationRes = await db
    .from("market_stage_timeline_generations")
    .select("id,status")
    .eq("symbol", evaluation.symbol)
    .eq("algorithm_id", evaluation.algorithmId)
    .eq("status", "active")
    .maybeSingle();

  if (generationRes.error) {
    return persistResult("database_failure", "database_failure", {
      wrote: false,
    });
  }

  const stateRes = await db
    .from("market_stage_state")
    .select(
      "symbol,algorithm_id,active_generation_id,confirmed_stage,confirmed_effective_week_end,confirmed_at_week_end,pending_stage,pending_count,pending_start_week_end,latest_processed_week_end,latest_input_fingerprint,latest_evaluation_status,latest_valid_candidate,latest_valid_candidate_week_end,latest_data_effective_week_end,revision",
    )
    .eq("symbol", evaluation.symbol)
    .eq("algorithm_id", evaluation.algorithmId)
    .maybeSingle();

  if (stateRes.error) {
    return persistResult("database_failure", "database_failure", {
      wrote: false,
    });
  }

  const activeGeneration = generationRes.data;
  const stateRow = stateRes.data;

  let priorState: TransitionState | null = null;
  let expectedGenerationId: string | null = null;
  let expectedRevision = 0;

  if (activeGeneration === null && stateRow === null) {
    priorState = null;
    expectedGenerationId = null;
    expectedRevision = 0;
  } else if (activeGeneration !== null && stateRow !== null) {
    const genId = typeof activeGeneration.id === "string"
      ? activeGeneration.id
      : null;
    const stateGenId = typeof stateRow.active_generation_id === "string"
      ? stateRow.active_generation_id
      : null;
    if (genId === null || stateGenId === null || genId !== stateGenId) {
      return persistResult("inactive_generation", "inactive_generation", {
        wrote: false,
      });
    }
    const mapped = mapStateRow(stateRow);
    if (mapped === null) {
      return persistResult("database_failure", "database_failure", {
        wrote: false,
      });
    }
    priorState = mapped;
    expectedGenerationId = genId;
    expectedRevision = mapped.revision;
  } else {
    // Generation without state, or state without active generation.
    return persistResult("inactive_generation", "inactive_generation", {
      wrote: false,
    });
  }

  // Locked reducer — exactly once. Never reimplemented here.
  const reduce = reduceMarketStageTransition(priorState, evaluation);

  if (reduce.status === "rejected") {
    return persistResult("rejected", reduce.resultCode, {
      reduce,
      wrote: false,
    });
  }

  if (reduce.status === "replay_required") {
    return persistResult("replay_required", reduce.resultCode, {
      reduce,
      generationId: expectedGenerationId,
      revision: priorState?.revision ?? null,
      wrote: false,
    });
  }

  if (
    reduce.status === "no_op" && reduce.resultCode === "duplicate_evaluation"
  ) {
    return persistResult("no_op", "duplicate_evaluation", {
      reduce,
      generationId: expectedGenerationId,
      revision: priorState?.revision ?? null,
      wrote: false,
    });
  }

  if (reduce.status !== "applied" || reduce.nextState === null) {
    return persistResult("database_failure", "database_failure", {
      reduce,
      wrote: false,
    });
  }

  const args = buildRpcArgs(
    evaluation,
    reduce.nextState,
    expectedGenerationId,
    expectedRevision,
    reduce.event,
  );

  const rpcRes = await db.rpc(PERSIST_RPC_NAME, args);
  if (rpcRes.error) {
    const message = rpcRes.error.message ?? "";
    if (message.includes("market_stages_forward_transition_conflict")) {
      return persistResult("transition_conflict", "transition_conflict", {
        reduce,
        wrote: false,
      });
    }
    return persistResult("database_failure", "database_failure", {
      reduce,
      wrote: false,
    });
  }

  if (rpcRes.data === null || typeof rpcRes.data !== "object") {
    return persistResult("database_failure", "database_failure", {
      reduce,
      wrote: false,
    });
  }

  return mapRpcOutcome(rpcRes.data, reduce);
}
