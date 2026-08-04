// Stocksist Market Stages — Phase P2B
// Deterministic Weinstein-style weekly transition reducer.
// Consumes P1 ClassifyResult. No persistence, providers, alerts, or UI.

import {
  ALGORITHM_ID,
  type CandidateStage,
  type ClassifyMetrics,
  type ClassifyResult,
  type ReasonCode,
} from "./classify.ts";

export { ALGORITHM_ID };

const SYMBOL_RE = /^[A-Z][A-Z0-9.-]{0,14}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_DAYS = 7;

export type EvaluationStatus =
  | "ok"
  | "insufficient_data"
  | "invalid_input"
  | "unavailable";

export type TransitionEvaluation = {
  symbol: string;
  algorithmId: typeof ALGORITHM_ID;
  /** Canonical Friday market-week identifier (YYYY-MM-DD). */
  effectiveWeekEnd: string;
  /** Audit metadata only; does not determine stage. */
  calculatedAt: string;
  /** Nonempty when classification is present; null only when unavailable. */
  inputFingerprint: string | null;
  /** Complete P1 result, or null for provider/orchestration unavailability. */
  classification: ClassifyResult | null;
};

export type TransitionState = {
  symbol: string;
  algorithmId: typeof ALGORITHM_ID;
  confirmedStage: CandidateStage | null;
  /** First week of the two-week confirmed streak. */
  confirmedEffectiveWeekEnd: string | null;
  /** Second week, when confirmation became known. */
  confirmedAtWeekEnd: string | null;
  pendingStage: CandidateStage | null;
  /** Locked two-week model: 0 or 1. */
  pendingCount: 0 | 1;
  pendingStartWeekEnd: string | null;
  latestProcessedWeekEnd: string;
  latestInputFingerprint: string | null;
  latestEvaluationStatus: EvaluationStatus;
  latestValidCandidate: CandidateStage | null;
  latestValidCandidateWeekEnd: string | null;
  latestDataEffectiveWeekEnd: string | null;
  revision: number;
};

export type TransitionEventDraft = {
  symbol: string;
  algorithmId: typeof ALGORITHM_ID;
  fromStage: CandidateStage;
  toStage: CandidateStage;
  pendingStartWeekEnd: string;
  /** Equals pendingStartWeekEnd (first week of the confirming streak). */
  effectiveWeekEnd: string;
  /** Second confirming week. */
  confirmedWeekEnd: string;
  calculatedAt: string;
  confirmationInputFingerprint: string;
  reasonCodes: ReasonCode[];
  metricsSnapshot: ClassifyMetrics;
  /**
   * Canonical identity material (not hashed):
   * algorithmId|symbol|fromStage|toStage|effectiveWeekEnd|confirmedWeekEnd
   */
  eventIdentity: string;
};

export type ReduceStatus =
  | "applied"
  | "no_op"
  | "replay_required"
  | "rejected";

export type ReduceResultCode =
  | "availability_recorded"
  | "pending_opened"
  | "pending_replaced"
  | "pending_cleared"
  | "confirmed_initial"
  | "confirmed_transition"
  | "confirmed_unchanged"
  | "duplicate_evaluation"
  | "replay_required_same_week"
  | "replay_required_historical_week"
  | "rejected_identity_mismatch"
  | "rejected_invalid_evaluation";

export type ReducerReasonCode =
  | "week_gap_detected"
  | "pending_reset_for_gap"
  | "pending_reset_for_unavailable"
  | "pending_reset_for_insufficient_data"
  | "pending_reset_for_invalid_input";

export type ReduceResult = {
  status: ReduceStatus;
  resultCode: ReduceResultCode;
  reasonCodes: ReducerReasonCode[];
  nextState: TransitionState | null;
  event: TransitionEventDraft | null;
};

function deepCloneState(state: TransitionState): TransitionState {
  return {
    symbol: state.symbol,
    algorithmId: state.algorithmId,
    confirmedStage: state.confirmedStage,
    confirmedEffectiveWeekEnd: state.confirmedEffectiveWeekEnd,
    confirmedAtWeekEnd: state.confirmedAtWeekEnd,
    pendingStage: state.pendingStage,
    pendingCount: state.pendingCount,
    pendingStartWeekEnd: state.pendingStartWeekEnd,
    latestProcessedWeekEnd: state.latestProcessedWeekEnd,
    latestInputFingerprint: state.latestInputFingerprint,
    latestEvaluationStatus: state.latestEvaluationStatus,
    latestValidCandidate: state.latestValidCandidate,
    latestValidCandidateWeekEnd: state.latestValidCandidateWeekEnd,
    latestDataEffectiveWeekEnd: state.latestDataEffectiveWeekEnd,
    revision: state.revision,
  };
}

function result(
  status: ReduceStatus,
  resultCode: ReduceResultCode,
  nextState: TransitionState | null,
  event: TransitionEventDraft | null = null,
  reasonCodes: ReducerReasonCode[] = [],
): ReduceResult {
  return { status, resultCode, reasonCodes, nextState, event };
}

function isCanonicalFriday(iso: string): boolean {
  if (!DATE_RE.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return false;
  if (d.toISOString().slice(0, 10) !== iso) return false;
  return d.getUTCDay() === 5;
}

function dayDelta(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00.000Z`);
  const b = Date.parse(`${toIso}T00:00:00.000Z`);
  return (b - a) / DAY_MS;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isNormalizedSymbol(symbol: string): boolean {
  return SYMBOL_RE.test(symbol) && symbol === symbol.toUpperCase();
}

function isValidRevision(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 1;
}

function pendingCleared(
  state: Pick<
    TransitionState,
    "pendingStage" | "pendingCount" | "pendingStartWeekEnd"
  >,
): boolean {
  return (
    state.pendingStage === null &&
    state.pendingCount === 0 &&
    state.pendingStartWeekEnd === null
  );
}

function pendingOpen(
  state: Pick<
    TransitionState,
    "pendingStage" | "pendingCount" | "pendingStartWeekEnd"
  >,
): boolean {
  return (
    state.pendingStage !== null &&
    state.pendingCount === 1 &&
    state.pendingStartWeekEnd !== null
  );
}

function validatePriorState(state: TransitionState): boolean {
  if (!isNormalizedSymbol(state.symbol)) return false;
  if (state.algorithmId !== ALGORITHM_ID) return false;
  if (!isValidRevision(state.revision)) return false;
  if (!isCanonicalFriday(state.latestProcessedWeekEnd)) return false;

  const confirmedNull = state.confirmedStage === null;
  if (confirmedNull) {
    if (
      state.confirmedEffectiveWeekEnd !== null ||
      state.confirmedAtWeekEnd !== null
    ) {
      return false;
    }
  } else {
    if (
      state.confirmedEffectiveWeekEnd === null ||
      state.confirmedAtWeekEnd === null
    ) {
      return false;
    }
    if (
      !isCanonicalFriday(state.confirmedEffectiveWeekEnd) ||
      !isCanonicalFriday(state.confirmedAtWeekEnd)
    ) {
      return false;
    }
    if (
      addDays(state.confirmedEffectiveWeekEnd, WEEK_DAYS) !==
        state.confirmedAtWeekEnd
    ) {
      return false;
    }
  }

  if (state.pendingCount === 0) {
    if (!pendingCleared(state)) return false;
  } else if (state.pendingCount === 1) {
    if (!pendingOpen(state)) return false;
    if (!isCanonicalFriday(state.pendingStartWeekEnd!)) return false;
  } else {
    return false;
  }

  if (state.latestValidCandidate === null) {
    if (state.latestValidCandidateWeekEnd !== null) return false;
  } else if (
    state.latestValidCandidateWeekEnd === null ||
    !isCanonicalFriday(state.latestValidCandidateWeekEnd)
  ) {
    return false;
  }

  if (
    state.latestDataEffectiveWeekEnd !== null &&
    !isCanonicalFriday(state.latestDataEffectiveWeekEnd)
  ) {
    return false;
  }

  const status = state.latestEvaluationStatus;
  if (
    status !== "ok" &&
    status !== "insufficient_data" &&
    status !== "invalid_input" &&
    status !== "unavailable"
  ) {
    return false;
  }

  return true;
}

function validateEvaluation(
  evaluation: TransitionEvaluation,
): ReduceResultCode | null {
  if (!evaluation || typeof evaluation !== "object") {
    return "rejected_invalid_evaluation";
  }
  if (!isNormalizedSymbol(evaluation.symbol)) {
    return "rejected_invalid_evaluation";
  }
  if (evaluation.algorithmId !== ALGORITHM_ID) {
    return "rejected_invalid_evaluation";
  }
  if (!isCanonicalFriday(evaluation.effectiveWeekEnd)) {
    return "rejected_invalid_evaluation";
  }
  if (
    typeof evaluation.calculatedAt !== "string" ||
    evaluation.calculatedAt.length === 0
  ) {
    return "rejected_invalid_evaluation";
  }

  const c = evaluation.classification;
  if (c === null) {
    if (evaluation.inputFingerprint !== null) {
      return "rejected_invalid_evaluation";
    }
    return null;
  }

  if (
    typeof evaluation.inputFingerprint !== "string" ||
    evaluation.inputFingerprint.length === 0
  ) {
    return "rejected_invalid_evaluation";
  }
  if (c.algorithmId !== evaluation.algorithmId) {
    return "rejected_invalid_evaluation";
  }
  if (c.status === "ok") {
    if (c.candidateStage === null) return "rejected_invalid_evaluation";
  } else if (c.status === "insufficient_data" || c.status === "invalid_input") {
    if (c.candidateStage !== null) return "rejected_invalid_evaluation";
  } else {
    return "rejected_invalid_evaluation";
  }
  if (
    !Array.isArray(c.reasonCodes) || typeof c.metrics !== "object" ||
    c.metrics === null
  ) {
    return "rejected_invalid_evaluation";
  }
  return null;
}

function clearPending(state: TransitionState): void {
  state.pendingStage = null;
  state.pendingCount = 0;
  state.pendingStartWeekEnd = null;
}

function openPending(
  state: TransitionState,
  stage: CandidateStage,
  week: string,
): void {
  state.pendingStage = stage;
  state.pendingCount = 1;
  state.pendingStartWeekEnd = week;
}

function touchOkLatest(
  state: TransitionState,
  evaluation: TransitionEvaluation,
  candidate: CandidateStage,
): void {
  state.latestProcessedWeekEnd = evaluation.effectiveWeekEnd;
  state.latestInputFingerprint = evaluation.inputFingerprint;
  state.latestEvaluationStatus = "ok";
  state.latestValidCandidate = candidate;
  state.latestValidCandidateWeekEnd = evaluation.effectiveWeekEnd;
  state.latestDataEffectiveWeekEnd = evaluation.effectiveWeekEnd;
}

function touchNonOkLatest(
  state: TransitionState,
  evaluation: TransitionEvaluation,
  status: Exclude<EvaluationStatus, "ok">,
): void {
  state.latestProcessedWeekEnd = evaluation.effectiveWeekEnd;
  state.latestInputFingerprint = evaluation.inputFingerprint;
  state.latestEvaluationStatus = status;
}

function buildEventIdentity(
  algorithmId: string,
  symbol: string,
  fromStage: CandidateStage,
  toStage: CandidateStage,
  effectiveWeekEnd: string,
  confirmedWeekEnd: string,
): string {
  return [
    algorithmId,
    symbol,
    fromStage,
    toStage,
    effectiveWeekEnd,
    confirmedWeekEnd,
  ].join("|");
}

function applyAvailability(
  prior: TransitionState,
  evaluation: TransitionEvaluation,
  status: Exclude<EvaluationStatus, "ok">,
  resetReason: ReducerReasonCode,
): ReduceResult {
  const next = deepCloneState(prior);
  const reasonCodes: ReducerReasonCode[] = [];
  if (!pendingCleared(next)) {
    clearPending(next);
    reasonCodes.push(resetReason);
  }
  touchNonOkLatest(next, evaluation, status);
  next.revision = prior.revision + 1;
  return result(
    "applied",
    "availability_recorded",
    next,
    null,
    reasonCodes,
  );
}

function applyOkCandidate(
  prior: TransitionState | null,
  evaluation: TransitionEvaluation,
  candidate: CandidateStage,
  gapReasons: ReducerReasonCode[],
): ReduceResult {
  const week = evaluation.effectiveWeekEnd;
  const next: TransitionState = prior ? deepCloneState(prior) : {
    symbol: evaluation.symbol,
    algorithmId: evaluation.algorithmId,
    confirmedStage: null,
    confirmedEffectiveWeekEnd: null,
    confirmedAtWeekEnd: null,
    pendingStage: null,
    pendingCount: 0,
    pendingStartWeekEnd: null,
    latestProcessedWeekEnd: week,
    latestInputFingerprint: evaluation.inputFingerprint,
    latestEvaluationStatus: "ok",
    latestValidCandidate: null,
    latestValidCandidateWeekEnd: null,
    latestDataEffectiveWeekEnd: null,
    revision: 0, // set below after mutation
  };

  // Gap handling already reset pending into gapReasons before call when prior exists.
  for (const r of gapReasons) {
    if (r === "pending_reset_for_gap" && !pendingCleared(next)) {
      clearPending(next);
    }
  }

  // Candidate equals confirmed stage → clear pending, preserve confirmed dates.
  if (next.confirmedStage !== null && candidate === next.confirmedStage) {
    const hadPending = !pendingCleared(next);
    clearPending(next);
    touchOkLatest(next, evaluation, candidate);
    next.revision = (prior?.revision ?? 0) + 1;
    return result(
      "applied",
      hadPending ? "pending_cleared" : "confirmed_unchanged",
      next,
      null,
      gapReasons,
    );
  }

  // Confirm pending streak when same candidate already pending at count 1.
  if (
    pendingOpen(next) &&
    next.pendingStage === candidate &&
    next.pendingCount === 1
  ) {
    const pendingStart = next.pendingStartWeekEnd!;
    // Confirm only when this week is exactly adjacent to the pending start
    // (two-week streak). After a gap reset, pending is cleared so this branch
    // is not taken.
    if (dayDelta(pendingStart, week) === WEEK_DAYS) {
      const fromStage = next.confirmedStage;
      next.confirmedStage = candidate;
      next.confirmedEffectiveWeekEnd = pendingStart;
      next.confirmedAtWeekEnd = week;
      clearPending(next);
      touchOkLatest(next, evaluation, candidate);
      next.revision = (prior?.revision ?? 0) + 1;

      if (fromStage === null) {
        return result(
          "applied",
          "confirmed_initial",
          next,
          null,
          gapReasons,
        );
      }

      const event: TransitionEventDraft = {
        symbol: evaluation.symbol,
        algorithmId: evaluation.algorithmId,
        fromStage,
        toStage: candidate,
        pendingStartWeekEnd: pendingStart,
        effectiveWeekEnd: pendingStart,
        confirmedWeekEnd: week,
        calculatedAt: evaluation.calculatedAt,
        confirmationInputFingerprint: evaluation.inputFingerprint!,
        reasonCodes: [...evaluation.classification!.reasonCodes],
        metricsSnapshot: { ...evaluation.classification!.metrics },
        eventIdentity: buildEventIdentity(
          evaluation.algorithmId,
          evaluation.symbol,
          fromStage,
          candidate,
          pendingStart,
          week,
        ),
      };
      return result(
        "applied",
        "confirmed_transition",
        next,
        event,
        gapReasons,
      );
    }
  }

  // Open or replace pending.
  if (pendingCleared(next)) {
    openPending(next, candidate, week);
    touchOkLatest(next, evaluation, candidate);
    next.revision = (prior?.revision ?? 0) + 1;
    return result("applied", "pending_opened", next, null, gapReasons);
  }

  if (next.pendingStage !== candidate) {
    openPending(next, candidate, week);
    touchOkLatest(next, evaluation, candidate);
    next.revision = (prior?.revision ?? 0) + 1;
    return result("applied", "pending_replaced", next, null, gapReasons);
  }

  // Same pending stage but not yet confirmable (should not happen for
  // adjacent weeks with count 1). Treat as replace/re-open at this week.
  openPending(next, candidate, week);
  touchOkLatest(next, evaluation, candidate);
  next.revision = (prior?.revision ?? 0) + 1;
  return result("applied", "pending_replaced", next, null, gapReasons);
}

/**
 * Pure weekly transition reducer. Does not mutate `priorState` or `evaluation`.
 */
export function reduceMarketStageTransition(
  priorState: TransitionState | null,
  evaluation: TransitionEvaluation,
): ReduceResult {
  const invalid = validateEvaluation(evaluation);
  if (invalid !== null) {
    return result(
      "rejected",
      invalid,
      priorState ? deepCloneState(priorState) : null,
    );
  }

  if (priorState !== null) {
    if (!validatePriorState(priorState)) {
      return result(
        "rejected",
        "rejected_invalid_evaluation",
        deepCloneState(priorState),
      );
    }
    if (
      priorState.symbol !== evaluation.symbol ||
      priorState.algorithmId !== evaluation.algorithmId
    ) {
      return result(
        "rejected",
        "rejected_identity_mismatch",
        deepCloneState(priorState),
      );
    }
  }

  // First evaluation — no prior state.
  if (priorState === null) {
    const c = evaluation.classification;
    if (c === null) {
      const next: TransitionState = {
        symbol: evaluation.symbol,
        algorithmId: evaluation.algorithmId,
        confirmedStage: null,
        confirmedEffectiveWeekEnd: null,
        confirmedAtWeekEnd: null,
        pendingStage: null,
        pendingCount: 0,
        pendingStartWeekEnd: null,
        latestProcessedWeekEnd: evaluation.effectiveWeekEnd,
        latestInputFingerprint: null,
        latestEvaluationStatus: "unavailable",
        latestValidCandidate: null,
        latestValidCandidateWeekEnd: null,
        latestDataEffectiveWeekEnd: null,
        revision: 1,
      };
      return result("applied", "availability_recorded", next);
    }
    if (c.status === "ok") {
      return applyOkCandidate(null, evaluation, c.candidateStage!, []);
    }
    const next: TransitionState = {
      symbol: evaluation.symbol,
      algorithmId: evaluation.algorithmId,
      confirmedStage: null,
      confirmedEffectiveWeekEnd: null,
      confirmedAtWeekEnd: null,
      pendingStage: null,
      pendingCount: 0,
      pendingStartWeekEnd: null,
      latestProcessedWeekEnd: evaluation.effectiveWeekEnd,
      latestInputFingerprint: evaluation.inputFingerprint,
      latestEvaluationStatus: c.status,
      latestValidCandidate: null,
      latestValidCandidateWeekEnd: null,
      latestDataEffectiveWeekEnd: null,
      revision: 1,
    };
    return result("applied", "availability_recorded", next);
  }

  const delta = dayDelta(
    priorState.latestProcessedWeekEnd,
    evaluation.effectiveWeekEnd,
  );

  if (delta === 0) {
    if (evaluation.inputFingerprint === priorState.latestInputFingerprint) {
      return result(
        "no_op",
        "duplicate_evaluation",
        deepCloneState(priorState),
      );
    }
    return result(
      "replay_required",
      "replay_required_same_week",
      deepCloneState(priorState),
    );
  }

  if (delta < 0) {
    return result(
      "replay_required",
      "replay_required_historical_week",
      deepCloneState(priorState),
    );
  }

  // Forward evaluation: adjacent (7) or gap (>7).
  const gapReasons: ReducerReasonCode[] = [];
  let working = deepCloneState(priorState);
  if (delta > WEEK_DAYS) {
    gapReasons.push("week_gap_detected");
    if (!pendingCleared(working)) {
      clearPending(working);
      gapReasons.push("pending_reset_for_gap");
    }
  } else if (delta !== WEEK_DAYS) {
    // Non-integer week spacing between canonical Fridays is invalid.
    return result(
      "rejected",
      "rejected_invalid_evaluation",
      deepCloneState(priorState),
    );
  }

  const mergeReasons = (base: ReduceResult): ReduceResult => {
    if (gapReasons.length === 0) return base;
    const merged = [
      ...gapReasons,
      ...base.reasonCodes.filter((r) => !gapReasons.includes(r)),
    ];
    return { ...base, reasonCodes: merged };
  };

  const c = evaluation.classification;
  if (c === null) {
    return mergeReasons(
      applyAvailability(
        working,
        evaluation,
        "unavailable",
        "pending_reset_for_unavailable",
      ),
    );
  }
  if (c.status === "insufficient_data") {
    return mergeReasons(
      applyAvailability(
        working,
        evaluation,
        "insufficient_data",
        "pending_reset_for_insufficient_data",
      ),
    );
  }
  if (c.status === "invalid_input") {
    return mergeReasons(
      applyAvailability(
        working,
        evaluation,
        "invalid_input",
        "pending_reset_for_invalid_input",
      ),
    );
  }

  // ok candidate — use working as prior so gap reset is preserved.
  return mergeReasons(
    applyOkCandidate(working, evaluation, c.candidateStage!, gapReasons),
  );
}
