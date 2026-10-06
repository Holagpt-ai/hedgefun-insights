/**
 * Internal Scanner / Radar / Pre-Market verification record.
 * Explains stored observations. It does not rank, emit events, or invent rows.
 */

import { RADAR_EVENT_ENGINE_ACTIVE_TYPES, RADAR_EVENT_ENGINE_RESERVED_TYPES } from "@/lib/radar/radar-event-engine";
import {
  computeTimeAdjustedRvol,
  participationStateFromAcceleration,
  type CumulativeBaselineSnapshot,
} from "@/lib/radar/intraday-participation";
import {
  assessScreenerGenerationSession,
  resolveConsumerSessionKind,
  surveillanceTradingDateFromMs,
} from "@/lib/screeners/screener-session";
import { resolveLateSessionExpiryState } from "@/lib/am-inbox/late-session-expiry";
import type { LateSessionSourceCategory } from "@/config/late-session-handoff.config";

export type ScannerFreshness = "LIVE" | "FRESH" | "DELAYED" | "STALE" | "UNAVAILABLE" | "CLOSED";

export type CandidateLifecycleTransition =
  | "appeared"
  | "disappeared"
  | "reappeared"
  | "hidden"
  | "unchanged";

export type VisibleReason =
  | "BELOW_VISIBLE_CAP"
  | "FILTERED_BY_TAB"
  | "SORT_WINDOW"
  | "STALE"
  | "UNAVAILABLE"
  | "CLOSED"
  | "NOT_QUALIFIED"
  | null;

export interface QualificationGates {
  price: "pass" | "fail" | "unavailable";
  move: "pass" | "fail" | "unavailable";
  volume: "pass" | "fail" | "unavailable";
  float: "pass" | "fail" | "unavailable";
  participation: "pass" | "fail" | "unavailable";
  freshness: "pass" | "fail" | "unavailable";
}

export interface PriorCandidateSnapshot {
  session_date: string;
  qualified: boolean;
  visible: boolean;
}

export interface SymbolObservation {
  symbol: string;
  session_date: string;
  candidate_seen_at: string | null;
  qualified: boolean;
  reason_codes: readonly string[];
  rank: number | null;
  visible_cap: number;
  tab_filtered: boolean;
  sort_hidden?: boolean;
  freshness: ScannerFreshness;
  last_provider_update: string | null;
  gates: QualificationGates;
  tarvol: number | null;
  participation_state: string | null;
  recent_radar_events: readonly {
    event_type: string;
    event_at: string | null;
    threshold: string | null;
  }[];
  late_session_category: LateSessionSourceCategory | null;
  day_two_am_session_date: string | null;
}

export interface SymbolSessionDiagnostic {
  symbol: string;
  session_date: string;
  surveillance_date: string | null;
  session_role: "current" | "prior" | "unknown";
  session_label: "current" | "Day-Two" | "Last Session" | "Previous Session";
  candidate_seen_at: string | null;
  candidate_status: "qualified" | "disqualified" | "session_mismatch" | "stale" | "unavailable" | "closed";
  candidate_rank: number | null;
  visible: boolean;
  visible_state: "visible" | "not_visible";
  reason_not_visible: VisibleReason;
  transition: CandidateLifecycleTransition;
  promotion_reason: string | null;
  removal_reason: string | null;
  requalification_reason: string | null;
  qualification: QualificationGates;
  freshness: ScannerFreshness;
  last_provider_update: string | null;
  recent_radar_events: SymbolObservation["recent_radar_events"];
  tarvol: number | null;
  participation_state: string | null;
  late_session_category: string | null;
  day_two_state: "active" | "expired" | "absent";
}

const UNPROMOTABLE = new Set<ScannerFreshness>(["STALE", "UNAVAILABLE", "CLOSED"]);

export function describeSurveillanceInstant(nowMs: number): {
  surveillance_date: string | null;
  session_kind: string;
  live: boolean;
} {
  const surveillance_date = surveillanceTradingDateFromMs(nowMs);
  const session_kind = resolveConsumerSessionKind(nowMs);
  const live = session_kind === "pre-market" || session_kind === "market" || session_kind === "after-hours";
  return { surveillance_date, session_kind, live };
}

export function sessionRoleForCandidate(input: {
  candidateSessionDate: string;
  nowMs: number;
  referenceIso?: string | null;
}): "current" | "prior" | "unknown" {
  const surveillance = surveillanceTradingDateFromMs(input.nowMs);
  if (!surveillance || !input.candidateSessionDate) return "unknown";
  if (input.referenceIso) {
    const alignment = assessScreenerGenerationSession({
      nowMs: input.nowMs,
      referenceIso: input.referenceIso,
    });
    if (alignment === "previous_during_live") return "prior";
    if (alignment === "current" && input.candidateSessionDate === surveillance) return "current";
  }
  return input.candidateSessionDate === surveillance ? "current" : "prior";
}

export function freshnessAllowsPromotion(freshness: ScannerFreshness): boolean {
  return !UNPROMOTABLE.has(freshness);
}

export function explainVisibility(input: {
  qualified: boolean;
  rank: number | null;
  visibleCap: number;
  tabFiltered: boolean;
  sortHidden?: boolean;
  freshness: ScannerFreshness;
}): { visible: boolean; reason_not_visible: VisibleReason } {
  if (input.freshness === "STALE") return { visible: false, reason_not_visible: "STALE" };
  if (input.freshness === "UNAVAILABLE") return { visible: false, reason_not_visible: "UNAVAILABLE" };
  if (input.freshness === "CLOSED") return { visible: false, reason_not_visible: "CLOSED" };
  if (!input.qualified) return { visible: false, reason_not_visible: "NOT_QUALIFIED" };
  if (input.tabFiltered) return { visible: false, reason_not_visible: "FILTERED_BY_TAB" };
  if (input.sortHidden) return { visible: false, reason_not_visible: "SORT_WINDOW" };
  if (input.rank !== null && input.visibleCap > 0 && input.rank > input.visibleCap) {
    return { visible: false, reason_not_visible: "BELOW_VISIBLE_CAP" };
  }
  return { visible: true, reason_not_visible: null };
}

function removalCode(reasonCodes: readonly string[]): string {
  const code = reasonCodes.find((item) => item.trim().length > 0) ?? "DROPPED_BELOW_THRESHOLD";
  return `REMOVED_${code}`;
}

export function explainCandidateTransition(input: {
  nowMs: number;
  prior: PriorCandidateSnapshot | null;
  current: SymbolObservation & { visible?: boolean };
}): {
  transition: CandidateLifecycleTransition;
  promotion_reason: string | null;
  removal_reason: string | null;
  requalification_reason: string | null;
  candidate_status: SymbolSessionDiagnostic["candidate_status"];
  session_role: "current" | "prior" | "unknown";
  session_label: SymbolSessionDiagnostic["session_label"];
  visible: boolean;
  reason_not_visible: VisibleReason;
} {
  const session_role = sessionRoleForCandidate({
    candidateSessionDate: input.current.session_date,
    nowMs: input.nowMs,
    referenceIso: input.current.last_provider_update,
  });
  const visibility = explainVisibility({
    qualified: input.current.qualified,
    rank: input.current.rank,
    visibleCap: input.current.visible_cap,
    tabFiltered: input.current.tab_filtered,
    sortHidden: input.current.sort_hidden,
    freshness: input.current.freshness,
  });
  const priorSameSession = input.prior !== null && input.prior.session_date === input.current.session_date;
  const handoff = input.current.late_session_category && input.current.day_two_am_session_date
    ? explainDayTwo({
      sourceSessionDate: input.current.session_date,
      sourceCategory: input.current.late_session_category,
      amSessionDate: input.current.day_two_am_session_date,
    })
    : null;
  const handoffActive = handoff?.day_two_state === "active";
  const session_label: SymbolSessionDiagnostic["session_label"] =
    input.current.late_session_category === "DAY_TWO_WATCH" && handoffActive
      ? "Day-Two"
      : handoffActive
        ? "Last Session"
        : session_role === "prior"
          ? "Previous Session"
          : "current";

  if (session_role === "prior" && !handoffActive) {
    return {
      transition: "unchanged",
      promotion_reason: null,
      removal_reason: "SESSION_MISMATCH",
      requalification_reason: null,
      candidate_status: "session_mismatch",
      session_role,
      session_label,
      visible: false,
      reason_not_visible: "NOT_QUALIFIED",
    };
  }

  if (!freshnessAllowsPromotion(input.current.freshness)) {
    const candidate_status = input.current.freshness === "CLOSED"
      ? "closed"
      : input.current.freshness === "UNAVAILABLE"
        ? "unavailable"
        : "stale";
    return {
      transition: priorSameSession && input.prior?.visible ? "disappeared" : "unchanged",
      promotion_reason: null,
      removal_reason: "STALE_INPUT_NOT_PROMOTABLE",
      requalification_reason: null,
      candidate_status,
      session_role,
      session_label,
      visible: false,
      reason_not_visible: visibility.reason_not_visible,
    };
  }

  if (!input.current.qualified) {
    const disappeared = priorSameSession && input.prior?.qualified === true;
    return {
      transition: disappeared ? "disappeared" : "unchanged",
      promotion_reason: null,
      removal_reason: disappeared ? removalCode(input.current.reason_codes) : "NOT_QUALIFIED",
      requalification_reason: null,
      candidate_status: "disqualified",
      session_role,
      session_label,
      visible: false,
      reason_not_visible: "NOT_QUALIFIED",
    };
  }

  const wasQualified = priorSameSession && input.prior?.qualified === true;
  const wasVisible = priorSameSession && input.prior?.visible === true;
  let transition: CandidateLifecycleTransition = "unchanged";
  let promotion_reason: string | null = null;
  let requalification_reason: string | null = null;
  if (!wasQualified) {
    transition = input.prior && priorSameSession ? "reappeared" : "appeared";
    if (transition === "reappeared") requalification_reason = "REQUALIFIED";
    else promotion_reason = "PROMOTED";
  } else if (wasVisible && !visibility.visible) {
    transition = "hidden";
  } else if (!wasVisible && visibility.visible && input.prior) {
    transition = "reappeared";
    requalification_reason = "REQUALIFIED";
  }

  return {
    transition,
    promotion_reason,
    removal_reason: null,
    requalification_reason,
    candidate_status: "qualified",
    session_role,
    session_label,
    visible: visibility.visible,
    reason_not_visible: visibility.reason_not_visible,
  };
}

export function explainTarvol(input: {
  currentCumulativeVolume: number | null;
  baseline: CumulativeBaselineSnapshot | null;
  accelerationPct: number | null;
}): {
  time_adjusted_rvol: number | null;
  participation_state: string;
  baseline_usable: boolean;
} {
  const time_adjusted_rvol = computeTimeAdjustedRvol(input.currentCumulativeVolume, input.baseline);
  return {
    time_adjusted_rvol,
    participation_state: participationStateFromAcceleration(input.accelerationPct),
    baseline_usable: input.baseline !== null && !input.baseline.invalid && input.baseline.sufficient &&
      input.baseline.avgCumulativeVolume > 0,
  };
}

export function supportedRadarEventTypes(): readonly string[] {
  return RADAR_EVENT_ENGINE_ACTIVE_TYPES;
}

export function reservedRadarEventTypes(): readonly string[] {
  return RADAR_EVENT_ENGINE_RESERVED_TYPES;
}

export function explainDayTwo(input: {
  sourceSessionDate: string;
  sourceCategory: LateSessionSourceCategory;
  amSessionDate: string;
}): { day_two_state: "active" | "expired"; valid_through: string } {
  const expiry = resolveLateSessionExpiryState(input);
  return {
    day_two_state: expiry.expiryState === "active" ? "active" : "expired",
    valid_through: expiry.validThroughSessionDate,
  };
}

export function explainClosedSnapshot(input: {
  nowMs: number;
  snapshotIso: string | null;
}): "current" | "previous_during_live" | "not_applicable" {
  return assessScreenerGenerationSession({
    nowMs: input.nowMs,
    referenceIso: input.snapshotIso,
  });
}

export type BriefRunEvidence = {
  ran: boolean;
  action: "generate" | "return_cached" | "fail_closed";
  reason: string | null;
  duplicate_suppressed: boolean;
  stale: boolean;
  persisted: "insert" | "update" | "cached" | "none";
};

export function explainBriefDecision(input: {
  action: "fail_closed" | "return_cached" | "generate";
  reason?: string;
  persist?: "insert" | "update";
  candidateCount: number;
}): BriefRunEvidence {
  if (input.action === "fail_closed") {
    const stale = (input.reason ?? "").includes("stale") || input.reason === "source_stale";
    return {
      ran: false,
      action: "fail_closed",
      reason: input.reason ?? "insufficient_evidence",
      duplicate_suppressed: false,
      stale,
      persisted: "none",
    };
  }
  if (input.action === "return_cached") {
    return {
      ran: false,
      action: "return_cached",
      reason: input.candidateCount === 0 ? "empty_candidate_set_cached" : "duplicate_invocation",
      duplicate_suppressed: true,
      stale: false,
      persisted: "cached",
    };
  }
  return {
    ran: true,
    action: "generate",
    reason: input.candidateCount === 0 ? "empty_candidate_set" : null,
    duplicate_suppressed: false,
    stale: false,
    persisted: input.persist ?? "insert",
  };
}

export function inspectSymbolSession(input: {
  nowMs: number;
  prior: PriorCandidateSnapshot | null;
  current: SymbolObservation;
}): SymbolSessionDiagnostic {
  const explained = explainCandidateTransition({
    nowMs: input.nowMs,
    prior: input.prior,
    current: input.current,
  });
  const dayTwo = input.current.late_session_category && input.current.day_two_am_session_date
    ? explainDayTwo({
      sourceSessionDate: input.current.session_date,
      sourceCategory: input.current.late_session_category,
      amSessionDate: input.current.day_two_am_session_date,
    }).day_two_state
    : "absent";
  return {
    symbol: input.current.symbol,
    session_date: input.current.session_date,
    surveillance_date: surveillanceTradingDateFromMs(input.nowMs),
    session_role: explained.session_role,
    session_label: explained.session_label,
    candidate_seen_at: input.current.candidate_seen_at,
    candidate_status: explained.candidate_status,
    candidate_rank: input.current.rank,
    visible: explained.visible,
    visible_state: explained.visible ? "visible" : "not_visible",
    reason_not_visible: explained.reason_not_visible,
    transition: explained.transition,
    promotion_reason: explained.promotion_reason,
    removal_reason: explained.removal_reason,
    requalification_reason: explained.requalification_reason,
    qualification: input.current.gates,
    freshness: input.current.freshness,
    last_provider_update: input.current.last_provider_update,
    recent_radar_events: input.current.recent_radar_events,
    tarvol: input.current.tarvol,
    participation_state: input.current.participation_state,
    late_session_category: input.current.late_session_category,
    day_two_state: dayTwo,
  };
}
