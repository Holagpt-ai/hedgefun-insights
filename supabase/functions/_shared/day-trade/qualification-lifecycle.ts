/**
 * Day Trade Five Pillars qualification lifecycle (Scanner V42).
 * Pure state machine — persistence is applied by callers.
 */

import {
  DAY_TRADE_QUALIFICATION_GRACE_MIN_MS,
  DAY_TRADE_QUALIFICATION_GRACE_REQUIRED_FAILURES,
} from "../../../../src/config/day-trade-qualification-lifecycle.config.ts";

export type DayTradeQualificationPhase = "ACTIVE" | "GRACE" | "EXPIRED";

export type DayTradeQualificationEventType =
  | "QUALIFIED"
  | "GRACE_ENTERED"
  | "RECOVERED"
  | "EXPIRED"
  | "REQUALIFIED";

export type DayTradePillarOutcomes = {
  price: "pass" | "fail" | "unavailable";
  move: "pass" | "fail" | "unavailable";
  float: "pass" | "fail" | "unavailable";
  participation: "pass" | "fail" | "unavailable";
  freshness: "pass" | "fail" | "unavailable";
};

export type DayTradeQualificationEvaluation = {
  symbol: string;
  /** When false, evaluation must not advance grace or expiration. */
  evaluable: boolean;
  unevaluableReason?:
    | "missing_data"
    | "provider_outage"
    | "duplicate_snapshot"
    | "network"
    | "filtered";
  fivePillarsPass: boolean;
  pillarOutcomes: DayTradePillarOutcomes;
  reasonCodes: readonly string[];
  /** Market-data / provider-as-of clock (ms). */
  marketDataMs: number;
  /** Stable fingerprint for the provider snapshot (dedupe). */
  snapshotKey: string;
  monitoredPrice: number | null;
  monitoredVolume: number | null;
  providerAsOfIso: string | null;
};

export type DayTradeQualificationPriorEpisode = {
  first_qualified_at: string;
  expired_at: string;
  expiration_reason: readonly string[];
};

export type DayTradeQualificationEpisodeState = {
  sessionDate: string;
  symbol: string;
  phase: DayTradeQualificationPhase | null;
  firstQualifiedAt: string | null;
  lastQualifiedAt: string | null;
  graceFirstFailureAt: string | null;
  graceFailureCount: number;
  expiredAt: string | null;
  expirationReasonCodes: readonly string[];
  pillarOutcomes: DayTradePillarOutcomes | null;
  monitoredPrice: number | null;
  monitoredVolume: number | null;
  providerAsOfIso: string | null;
  priorEpisodes: readonly DayTradeQualificationPriorEpisode[];
  lastSnapshotKey: string | null;
  lastMarketDataMs: number | null;
};

export type DayTradeQualificationLifecycleEvent = {
  type: DayTradeQualificationEventType;
  atIso: string;
  dedupeKey: string;
  payload?: Record<string, unknown>;
};

export type DayTradeQualificationStepResult = {
  state: DayTradeQualificationEpisodeState;
  events: DayTradeQualificationLifecycleEvent[];
};

function isoFromMs(ms: number): string {
  return new Date(ms).toISOString();
}

export function emptyQualificationEpisodeState(input: {
  sessionDate: string;
  symbol: string;
}): DayTradeQualificationEpisodeState {
  return {
    sessionDate: input.sessionDate,
    symbol: input.symbol,
    phase: null,
    firstQualifiedAt: null,
    lastQualifiedAt: null,
    graceFirstFailureAt: null,
    graceFailureCount: 0,
    expiredAt: null,
    expirationReasonCodes: [],
    pillarOutcomes: null,
    monitoredPrice: null,
    monitoredVolume: null,
    providerAsOfIso: null,
    priorEpisodes: [],
    lastSnapshotKey: null,
    lastMarketDataMs: null,
  };
}

/** Matches frontend `qualifiesDayTradeMomentum` (Five Pillars funnel). Freshness is desk-only. */
function allMandatoryPillarsPass(outcomes: DayTradePillarOutcomes): boolean {
  return (
    outcomes.price === "pass" &&
    outcomes.move === "pass" &&
    outcomes.float !== "fail" &&
    outcomes.participation === "pass"
  );
}

function buildEvent(
  type: DayTradeQualificationEventType,
  atMs: number,
  symbol: string,
  sessionDate: string,
  extra?: Record<string, unknown>,
): DayTradeQualificationLifecycleEvent {
  const atIso = isoFromMs(atMs);
  return {
    type,
    atIso,
    dedupeKey: `${sessionDate}:${symbol}:${type}:${atIso}`,
    payload: extra,
  };
}

/**
 * Advance one symbol's lifecycle from a single evaluation tick.
 */
export function stepDayTradeQualificationLifecycle(
  prev: DayTradeQualificationEpisodeState,
  evaluation: DayTradeQualificationEvaluation,
  nowMs: number,
): DayTradeQualificationStepResult {
  const events: DayTradeQualificationLifecycleEvent[] = [];
  const next: DayTradeQualificationEpisodeState = {
    ...prev,
    monitoredPrice: evaluation.monitoredPrice ?? prev.monitoredPrice,
    monitoredVolume: evaluation.monitoredVolume ?? prev.monitoredVolume,
    providerAsOfIso: evaluation.providerAsOfIso ?? prev.providerAsOfIso,
  };

  if (!evaluation.evaluable) {
    return { state: next, events };
  }

  if (
    prev.lastSnapshotKey !== null &&
    prev.lastSnapshotKey === evaluation.snapshotKey
  ) {
    return { state: next, events };
  }

  next.lastSnapshotKey = evaluation.snapshotKey;
  next.lastMarketDataMs = evaluation.marketDataMs;

  const pillarsPass =
    evaluation.fivePillarsPass &&
    allMandatoryPillarsPass(evaluation.pillarOutcomes);

  if (pillarsPass) {
    const atIso = isoFromMs(evaluation.marketDataMs);
    next.pillarOutcomes = evaluation.pillarOutcomes;
    next.lastQualifiedAt = atIso;

    if (prev.phase === null) {
      next.phase = "ACTIVE";
      next.firstQualifiedAt = atIso;
      next.graceFirstFailureAt = null;
      next.graceFailureCount = 0;
      next.expiredAt = null;
      next.expirationReasonCodes = [];
      events.push(
        buildEvent("QUALIFIED", evaluation.marketDataMs, prev.symbol, prev.sessionDate),
      );
      return { state: next, events };
    }

    if (prev.phase === "GRACE") {
      next.phase = "ACTIVE";
      next.graceFirstFailureAt = null;
      next.graceFailureCount = 0;
      events.push(
        buildEvent("RECOVERED", evaluation.marketDataMs, prev.symbol, prev.sessionDate),
      );
      return { state: next, events };
    }

    if (prev.phase === "EXPIRED") {
      const prior: DayTradeQualificationPriorEpisode = {
        first_qualified_at: prev.firstQualifiedAt ?? atIso,
        expired_at: prev.expiredAt ?? isoFromMs(nowMs),
        expiration_reason: prev.expirationReasonCodes,
      };
      next.priorEpisodes = [...prev.priorEpisodes, prior];
      next.phase = "ACTIVE";
      next.firstQualifiedAt = atIso;
      next.graceFirstFailureAt = null;
      next.graceFailureCount = 0;
      next.expiredAt = null;
      next.expirationReasonCodes = [];
      events.push(
        buildEvent("REQUALIFIED", evaluation.marketDataMs, prev.symbol, prev.sessionDate, {
          prior_episode: prior,
        }),
      );
      return { state: next, events };
    }

    next.phase = "ACTIVE";
    return { state: next, events };
  }

  // Pillar failure path — only when we had previously achieved full qualification.
  if (prev.phase === null || prev.firstQualifiedAt === null) {
    return { state: next, events };
  }

  if (prev.phase === "EXPIRED") {
    return { state: next, events };
  }

  const failureAtIso = isoFromMs(evaluation.marketDataMs);

  if (prev.phase === "ACTIVE") {
    next.phase = "GRACE";
    next.graceFirstFailureAt = failureAtIso;
    next.graceFailureCount = 1;
    events.push(
      buildEvent("GRACE_ENTERED", evaluation.marketDataMs, prev.symbol, prev.sessionDate, {
        reason_codes: evaluation.reasonCodes,
      }),
    );
    return { state: next, events };
  }

  if (prev.phase === "GRACE") {
    const firstMs = prev.graceFirstFailureAt
      ? Date.parse(prev.graceFirstFailureAt)
      : null;
    const spaced =
      firstMs !== null &&
      evaluation.marketDataMs - firstMs >= DAY_TRADE_QUALIFICATION_GRACE_MIN_MS;
    const distinct =
      prev.lastMarketDataMs === null ||
      evaluation.marketDataMs > prev.lastMarketDataMs;

    if (spaced && distinct) {
      next.graceFailureCount = Math.min(
        DAY_TRADE_QUALIFICATION_GRACE_REQUIRED_FAILURES,
        prev.graceFailureCount + 1,
      );
      if (next.graceFailureCount >= DAY_TRADE_QUALIFICATION_GRACE_REQUIRED_FAILURES) {
        next.phase = "EXPIRED";
        next.expiredAt = failureAtIso;
        next.expirationReasonCodes = evaluation.reasonCodes;
        next.pillarOutcomes = evaluation.pillarOutcomes;
        events.push(
          buildEvent("EXPIRED", evaluation.marketDataMs, prev.symbol, prev.sessionDate, {
            reason_codes: evaluation.reasonCodes,
          }),
        );
      }
    }
    return { state: next, events };
  }

  return { state: next, events };
}

/** Monitoring tab admits symbols only after verified EXPIRED. */
export function isDayTradeQualificationMonitoringCandidate(
  state: DayTradeQualificationEpisodeState,
): boolean {
  return state.phase === "EXPIRED" && state.expiredAt !== null && state.firstQualifiedAt !== null;
}
