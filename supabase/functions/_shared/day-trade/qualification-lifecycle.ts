/**
 * Day Trade desk + Five Pillars lifecycle (Scanner V42.1).
 */

import {
  DAY_TRADE_QUALIFICATION_GRACE_MIN_MS,
  DAY_TRADE_QUALIFICATION_GRACE_REQUIRED_FAILURES,
} from "../../../../src/config/day-trade-qualification-lifecycle.config.ts";
import type { DeskDepartureReason } from "./desk-departure.ts";
import { classifyDeskDeparture } from "./desk-departure.ts";

export type DayTradePillarPhase = "ACTIVE" | "GRACE" | "EXPIRED";

export type DayTradeQualificationEventType =
  | "QUALIFIED"
  | "GRACE_ENTERED"
  | "RECOVERED"
  | "EXPIRED"
  | "REQUALIFIED"
  | "DESK_ENTERED"
  | "DESK_EXITED"
  | "DESK_REENTERED";

export type DayTradePillarOutcomes = {
  price: "pass" | "fail" | "unavailable";
  move: "pass" | "fail" | "unavailable";
  float: "pass" | "fail" | "unavailable";
  participation: "pass" | "fail" | "unavailable";
  freshness: "pass" | "fail" | "unavailable";
};

export type DayTradeQualificationEvaluation = {
  symbol: string;
  evaluable: boolean;
  unevaluableReason?:
    | "missing_data"
    | "provider_outage"
    | "duplicate_snapshot"
    | "out_of_order"
    | "network"
    | "filtered";
  fivePillarsPass: boolean;
  pillarOutcomes: DayTradePillarOutcomes;
  reasonCodes: readonly string[];
  marketDataMs: number;
  snapshotKey: string;
  monitoredPrice: number | null;
  monitoredVolume: number | null;
  providerAsOfIso: string | null;
  onAuthoritativeDesk: boolean;
  freshnessPass: boolean;
  opportunityEligible: boolean;
};

export type DayTradeMonitoringEpisode = {
  first_desk_at: string;
  last_desk_at: string;
  desk_departure_at: string;
  desk_departure_reason: DeskDepartureReason;
  pillar_expired: boolean;
};

export type DayTradeQualificationEpisodeState = {
  sessionDate: string;
  symbol: string;
  pillarPhase: DayTradePillarPhase | null;
  firstQualifiedAt: string | null;
  lastQualifiedAt: string | null;
  graceFirstFailureAt: string | null;
  graceFailureCount: number;
  pillarExpiredAt: string | null;
  pillarExpirationReasonCodes: readonly string[];
  everOnDesk: boolean;
  currentlyOnDesk: boolean;
  firstDeskAt: string | null;
  lastDeskAt: string | null;
  lastDeskDepartureAt: string | null;
  lastDeskDepartureReason: DeskDepartureReason | null;
  fivePillarsPass: boolean;
  monitoringEligible: boolean;
  monitoringDataStatus: "LIVE" | "STALE" | "UNAVAILABLE";
  pillarOutcomes: DayTradePillarOutcomes | null;
  monitoredPrice: number | null;
  monitoredVolume: number | null;
  providerAsOfIso: string | null;
  priorEpisodes: readonly DayTradeMonitoringEpisode[];
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
    pillarPhase: null,
    firstQualifiedAt: null,
    lastQualifiedAt: null,
    graceFirstFailureAt: null,
    graceFailureCount: 0,
    pillarExpiredAt: null,
    pillarExpirationReasonCodes: [],
    everOnDesk: false,
    currentlyOnDesk: false,
    firstDeskAt: null,
    lastDeskAt: null,
    lastDeskDepartureAt: null,
    lastDeskDepartureReason: null,
    fivePillarsPass: false,
    monitoringEligible: false,
    monitoringDataStatus: "UNAVAILABLE",
    pillarOutcomes: null,
    monitoredPrice: null,
    monitoredVolume: null,
    providerAsOfIso: null,
    priorEpisodes: [],
    lastSnapshotKey: null,
    lastMarketDataMs: null,
  };
}

function pillarsPass(outcomes: DayTradePillarOutcomes, fivePillarsPass: boolean): boolean {
  return (
    fivePillarsPass &&
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
    dedupeKey: `${sessionDate}:${symbol}:${type}:${atIso}:${extra?.reason ?? ""}`,
    payload: extra,
  };
}

function stepPillars(
  prev: DayTradeQualificationEpisodeState,
  evaluation: DayTradeQualificationEvaluation,
  events: DayTradeQualificationLifecycleEvent[],
  priorMarketDataMs: number | null,
): DayTradeQualificationEpisodeState {
  const next = { ...prev };
  const pass = pillarsPass(evaluation.pillarOutcomes, evaluation.fivePillarsPass);
  next.fivePillarsPass = pass;
  next.pillarOutcomes = evaluation.pillarOutcomes;

  if (pass) {
    const atIso = isoFromMs(evaluation.marketDataMs);
    next.lastQualifiedAt = atIso;
    if (next.pillarPhase === null) {
      next.pillarPhase = "ACTIVE";
      next.firstQualifiedAt = atIso;
      next.graceFirstFailureAt = null;
      next.graceFailureCount = 0;
      next.pillarExpiredAt = null;
      next.pillarExpirationReasonCodes = [];
      events.push(
        buildEvent("QUALIFIED", evaluation.marketDataMs, prev.symbol, prev.sessionDate),
      );
    } else if (next.pillarPhase === "GRACE") {
      next.pillarPhase = "ACTIVE";
      next.graceFirstFailureAt = null;
      next.graceFailureCount = 0;
      events.push(
        buildEvent("RECOVERED", evaluation.marketDataMs, prev.symbol, prev.sessionDate),
      );
    } else if (next.pillarPhase === "EXPIRED") {
      next.pillarPhase = "ACTIVE";
      next.firstQualifiedAt = atIso;
      next.graceFirstFailureAt = null;
      next.graceFailureCount = 0;
      next.pillarExpiredAt = null;
      next.pillarExpirationReasonCodes = [];
      events.push(
        buildEvent("REQUALIFIED", evaluation.marketDataMs, prev.symbol, prev.sessionDate),
      );
    }
    return next;
  }

  if (next.pillarPhase === null || next.firstQualifiedAt === null) return next;
  if (next.pillarPhase === "EXPIRED") return next;

  const failureAtIso = isoFromMs(evaluation.marketDataMs);
  if (next.pillarPhase === "ACTIVE") {
    next.pillarPhase = "GRACE";
    next.graceFirstFailureAt = failureAtIso;
    next.graceFailureCount = 1;
    events.push(
      buildEvent("GRACE_ENTERED", evaluation.marketDataMs, prev.symbol, prev.sessionDate, {
        reason_codes: evaluation.reasonCodes,
      }),
    );
    return next;
  }

  if (next.pillarPhase === "GRACE") {
    const firstMs = next.graceFirstFailureAt ? Date.parse(next.graceFirstFailureAt) : null;
    const spaced = firstMs !== null &&
      evaluation.marketDataMs - firstMs >= DAY_TRADE_QUALIFICATION_GRACE_MIN_MS;
    const distinct = priorMarketDataMs === null ||
      evaluation.marketDataMs > priorMarketDataMs;
    if (spaced && distinct) {
      next.graceFailureCount = Math.min(
        DAY_TRADE_QUALIFICATION_GRACE_REQUIRED_FAILURES,
        next.graceFailureCount + 1,
      );
      if (next.graceFailureCount >= DAY_TRADE_QUALIFICATION_GRACE_REQUIRED_FAILURES) {
        next.pillarPhase = "EXPIRED";
        next.pillarExpiredAt = failureAtIso;
        next.pillarExpirationReasonCodes = evaluation.reasonCodes;
        events.push(
          buildEvent("EXPIRED", evaluation.marketDataMs, prev.symbol, prev.sessionDate, {
            reason_codes: evaluation.reasonCodes,
          }),
        );
      }
    }
  }
  return next;
}

function stepDesk(
  prev: DayTradeQualificationEpisodeState,
  evaluation: DayTradeQualificationEvaluation,
  events: DayTradeQualificationLifecycleEvent[],
  requalifiedThisTick: boolean,
): DayTradeQualificationEpisodeState {
  const next = { ...prev };
  const atIso = isoFromMs(evaluation.marketDataMs);
  const wasOnDesk = prev.currentlyOnDesk;
  const onDesk = evaluation.onAuthoritativeDesk;

  if (onDesk && !wasOnDesk) {
    next.currentlyOnDesk = true;
    next.everOnDesk = true;
    if (!next.firstDeskAt) next.firstDeskAt = atIso;
    next.lastDeskAt = atIso;
    next.monitoringEligible = false;
    if (prev.everOnDesk && prev.lastDeskDepartureAt && !requalifiedThisTick) {
      events.push(
        buildEvent("DESK_REENTERED", evaluation.marketDataMs, prev.symbol, prev.sessionDate, {
          prior_departure_reason: prev.lastDeskDepartureReason,
        }),
      );
    } else if (!prev.everOnDesk) {
      events.push(
        buildEvent("DESK_ENTERED", evaluation.marketDataMs, prev.symbol, prev.sessionDate),
      );
    }
    return next;
  }

  if (!onDesk && wasOnDesk) {
    next.currentlyOnDesk = false;
    next.lastDeskDepartureAt = atIso;
    const reason = classifyDeskDeparture({
      fivePillarsPass: evaluation.fivePillarsPass,
      freshnessPass: evaluation.freshnessPass,
      opportunityEligible: evaluation.opportunityEligible,
      onAuthoritativeDesk: false,
      pillarPhaseExpired: next.pillarPhase === "EXPIRED",
    });
    next.lastDeskDepartureReason = reason;
    next.monitoringEligible = true;
    events.push(
      buildEvent("DESK_EXITED", evaluation.marketDataMs, prev.symbol, prev.sessionDate, {
        reason,
      }),
    );
    return next;
  }

  if (onDesk && wasOnDesk) {
    next.lastDeskAt = atIso;
    next.monitoringEligible = false;
  }

  if (!onDesk && prev.everOnDesk) {
    next.monitoringEligible = !next.currentlyOnDesk;
  }

  return next;
}

export function stepDayTradeQualificationLifecycle(
  prev: DayTradeQualificationEpisodeState,
  evaluation: DayTradeQualificationEvaluation,
): DayTradeQualificationStepResult {
  const events: DayTradeQualificationLifecycleEvent[] = [];
  let next: DayTradeQualificationEpisodeState = {
    ...prev,
    monitoredPrice: evaluation.monitoredPrice ?? prev.monitoredPrice,
    monitoredVolume: evaluation.monitoredVolume ?? prev.monitoredVolume,
    providerAsOfIso: evaluation.providerAsOfIso ?? prev.providerAsOfIso,
    monitoringDataStatus: evaluation.evaluable ? "LIVE" : prev.monitoringDataStatus,
  };

  if (!evaluation.evaluable) {
    if (evaluation.monitoredPrice !== null || evaluation.monitoredVolume !== null) {
      next.monitoringDataStatus = prev.monitoringDataStatus === "LIVE" ? "STALE" : prev.monitoringDataStatus;
    }
    return { state: next, events };
  }

  if (prev.lastSnapshotKey !== null && prev.lastSnapshotKey === evaluation.snapshotKey) {
    return { state: next, events };
  }

  if (prev.lastMarketDataMs !== null && evaluation.marketDataMs < prev.lastMarketDataMs) {
    return { state: next, events };
  }

  const pillarBefore = next.pillarPhase;
  next = stepPillars(next, evaluation, events, prev.lastMarketDataMs);
  const requalifiedThisTick = pillarBefore === "EXPIRED" &&
    next.pillarPhase === "ACTIVE" &&
    events.some((e) => e.type === "REQUALIFIED");
  next = stepDesk(next, evaluation, events, requalifiedThisTick);

  next.lastSnapshotKey = evaluation.snapshotKey;
  next.lastMarketDataMs = evaluation.marketDataMs;

  return { state: next, events };
}

/** Monitoring tab: was on authoritative desk, currently off desk. */
export function isDayTradeQualificationMonitoringCandidate(
  state: DayTradeQualificationEpisodeState,
): boolean {
  return state.everOnDesk && !state.currentlyOnDesk && state.monitoringEligible;
}
