/**
 * Day Trade Radar strategy filter + Top-10 opportunity ranking.
 * View layer only — does not alter Radar engine candidate detection or ordering.
 */

import { finiteMetric } from "@/lib/screeners/screener-metric-display";
import { resolveDailyRvol20d } from "@/lib/screeners/screener-intelligence-fields";
import { assessRvolConfidence } from "@/lib/screeners/rvol-confidence";
import {
  LEGACY_MOVE_MIN_PCT,
  LEGACY_PRICE_MAX,
  LEGACY_PRICE_MIN,
  LEGACY_VOLUME_RATIO_MIN,
} from "@/lib/screeners/legacy-confirmation";
import type { RadarRankedRow } from "./types";

export const DAY_TRADE_RADAR_MAX_ROWS = 10;
export const DAY_TRADE_FLOAT_MAX_SHARES = 10_000_000;
export const DAY_TRADE_RVOL_MIN = LEGACY_VOLUME_RATIO_MIN;

export const DAY_TRADE_EMPTY_MESSAGE =
  "No stocks currently meet the Day Trade momentum criteria.";

const SIGNAL_PRIORITY: Record<string, number> = {
  EXPLOSIVE: 5,
  REACTIVATED: 4,
  BUILDING: 3,
  CONFIRMING: 3,
  TOP_LEADER: 2,
  VOLUME_LEADER: 1,
};

const FRESHNESS_PRIORITY: Record<string, number> = {
  fresh: 4,
  active: 3,
  cooling: 1,
  stale: 0,
  unknown: 0,
};

const PARTICIPATION_PRIORITY: Record<string, number> = {
  EXTREME: 4,
  SURGING: 3,
  RISING: 2,
  STEADY: 1,
  COOLING: 0,
};

export type DayTradeFloatGate = "pass" | "fail_high_float" | "unknown";

export interface DayTradeEligibility {
  eligible: boolean;
  priceGate: boolean | null;
  moveGate: boolean | null;
  floatGate: DayTradeFloatGate;
  participationGate: boolean | null;
  classicRvol: number | null;
}

function priceInBand(price: number | null | undefined): boolean | null {
  const n = finiteMetric(price);
  if (n === null) return null;
  return n >= LEGACY_PRICE_MIN && n <= LEGACY_PRICE_MAX;
}

function moveGate(change: number | null | undefined): boolean | null {
  const n = finiteMetric(change);
  if (n === null) return null;
  return n >= LEGACY_MOVE_MIN_PCT;
}

export function evaluateDayTradeFloat(
  floatShares: number | null | undefined,
): DayTradeFloatGate {
  const n = finiteMetric(floatShares);
  if (n === null) return "unknown";
  if (n > DAY_TRADE_FLOAT_MAX_SHARES) return "fail_high_float";
  return "pass";
}

/** Classic full-day RVOL 20D when a verified baseline exists. Never inferred from vol/yday. */
export function resolveClassicDayTradeRvol(row: RadarRankedRow): number | null {
  return resolveDailyRvol20d(row);
}

export type DayTradeParticipationSource =
  | "rvol_20d"
  | "volume_ratio_prior_session"
  | "rvol_5m"
  | "time_adjusted_rvol"
  | "unavailable";

export interface DayTradeParticipationFact {
  source: DayTradeParticipationSource;
  value: number | null;
  pass: boolean;
}

export interface DayTradeParticipationSignal {
  source: Exclude<DayTradeParticipationSource, "unavailable">;
  value: number | null;
  available: boolean;
  trusted: boolean;
  pass: boolean;
}

export interface DayTradeParticipationEvaluation {
  signals: DayTradeParticipationSignal[];
  pass: boolean;
  /** Source that satisfied the gate when pass=true. */
  winningSource: DayTradeParticipationSource | null;
  winningValue: number | null;
  availableSources: DayTradeParticipationSource[];
}

const INTRADAY_PASS_PRIORITY: readonly Exclude<
  DayTradeParticipationSource,
  "unavailable"
>[] = ["rvol_5m", "time_adjusted_rvol", "rvol_20d", "volume_ratio_prior_session"];

function participationSignalTrusted(
  source: Exclude<DayTradeParticipationSource, "unavailable">,
  row: RadarRankedRow,
  value: number,
): boolean {
  if (source === "volume_ratio_prior_session") {
    const prior = finiteMetric(row.prior_session_volume);
    if (prior === null || !(prior > 0)) return false;
    const assessed = assessRvolConfidence({
      rawRvol: value,
      baselineVolume: prior,
      metricKind: "volume_ratio_prior",
    });
    return assessed.rvolConfidence !== "INSUFFICIENT_HISTORY";
  }
  if (source === "rvol_20d") {
    return finiteMetric(row.avg_volume_20d) !== null && finiteMetric(row.avg_volume_20d)! > 0;
  }
  return true;
}

function buildParticipationSignal(
  source: Exclude<DayTradeParticipationSource, "unavailable">,
  value: number | null,
  row: RadarRankedRow,
): DayTradeParticipationSignal {
  if (value === null) {
    return { source, value: null, available: false, trusted: false, pass: false };
  }
  const trusted = participationSignalTrusted(source, row, value);
  const pass = trusted && value >= DAY_TRADE_RVOL_MIN;
  return { source, value, available: true, trusted, pass };
}

/**
 * Evaluates all participation sources. Passes when any trusted signal meets threshold.
 */
export function evaluateDayTradeParticipation(row: RadarRankedRow): DayTradeParticipationEvaluation {
  const signals: DayTradeParticipationSignal[] = [
    buildParticipationSignal("rvol_20d", resolveClassicDayTradeRvol(row), row),
    buildParticipationSignal(
      "volume_ratio_prior_session",
      finiteMetric(row.volume_ratio_prior_session),
      row,
    ),
    buildParticipationSignal("rvol_5m", finiteMetric(row.rvol_5m), row),
    buildParticipationSignal(
      "time_adjusted_rvol",
      finiteMetric(row.time_adjusted_rvol),
      row,
    ),
  ];

  const availableSources = signals
    .filter((s) => s.available)
    .map((s) => s.source as DayTradeParticipationSource);

  let passing: DayTradeParticipationSignal | null = null;
  for (const source of INTRADAY_PASS_PRIORITY) {
    const match = signals.find((s) => s.source === source && s.pass);
    if (match) {
      passing = match;
      break;
    }
  }

  return {
    signals,
    pass: passing !== null,
    winningSource: passing?.source ?? null,
    winningValue: passing?.value ?? null,
    availableSources,
  };
}

/**
 * Primary participation fact for display/diagnostics.
 * When passing, prefers the intraday source that cleared the gate.
 */
export function resolveDayTradeParticipationFact(row: RadarRankedRow): DayTradeParticipationFact {
  const evaluation = evaluateDayTradeParticipation(row);
  if (evaluation.pass && evaluation.winningSource) {
    return {
      source: evaluation.winningSource,
      value: evaluation.winningValue,
      pass: true,
    };
  }

  for (const source of [
    "rvol_20d",
    "volume_ratio_prior_session",
    "rvol_5m",
    "time_adjusted_rvol",
  ] as const) {
    const signal = evaluation.signals.find((s) => s.source === source && s.available);
    if (signal) {
      return { source, value: signal.value, pass: false };
    }
  }

  return { source: "unavailable", value: null, pass: false };
}

/**
 * Participation gate: any trusted signal at/above threshold.
 * Does not fabricate classic RVOL from vol/yday.
 */
export function meetsDayTradeParticipation(row: RadarRankedRow): {
  pass: boolean;
  classicRvol: number | null;
  evaluation: DayTradeParticipationEvaluation;
} {
  const evaluation = evaluateDayTradeParticipation(row);
  const classic = evaluation.signals.find((s) => s.source === "rvol_20d");
  return {
    pass: evaluation.pass,
    classicRvol: classic?.available ? classic.value : null,
    evaluation,
  };
}

export function evaluateDayTradeEligibility(row: RadarRankedRow): DayTradeEligibility {
  const priceGate = priceInBand(row.price);
  const moveGateResult = moveGate(row.change_percent);
  const floatGate = evaluateDayTradeFloat(row.float_shares);
  const participation = meetsDayTradeParticipation(row);

  const eligible =
    priceGate === true &&
    moveGateResult === true &&
    floatGate !== "fail_high_float" &&
    participation.pass;

  return {
    eligible,
    priceGate,
    moveGate: moveGateResult,
    floatGate,
    participationGate: participation.pass,
    classicRvol: participation.classicRvol,
  };
}

export function qualifiesDayTradeMomentum(row: RadarRankedRow): boolean {
  return evaluateDayTradeEligibility(row).eligible;
}

function hodProximityScore(row: RadarRankedRow): number {
  const distance =
    finiteMetric(row.distance_from_hod_pct) ?? finiteMetric(row.hod_distance_percent);
  if (distance === null) return 0;
  return Math.max(0, 100 - distance * 4);
}

function freshnessScore(row: RadarRankedRow): number {
  const key = (row.freshness_class ?? "unknown").toLowerCase();
  return FRESHNESS_PRIORITY[key] ?? 0;
}

function signalScore(row: RadarRankedRow): number {
  const status = (row.signal_status ?? row.signal ?? "").replace(/\s+/g, "_").toUpperCase();
  return SIGNAL_PRIORITY[status] ?? 0;
}

function participationScore(row: RadarRankedRow): number {
  let score = 0;
  const velocity = finiteMetric(row.vol_velocity);
  if (velocity !== null) score += Math.log10(velocity + 1) * 18;

  const rvol5m = finiteMetric(row.rvol_5m);
  if (rvol5m !== null) score += Math.min(rvol5m, 30) * 2.5;

  const timeAdjusted = finiteMetric(row.time_adjusted_rvol);
  if (timeAdjusted !== null) score += Math.min(timeAdjusted, 30) * 2;

  const vol60 = finiteMetric(row.rolling_volume_60s);
  if (vol60 !== null) score += Math.log10(vol60 + 1) * 10;

  const dollar60 = finiteMetric(row.rolling_dollar_volume_60s);
  if (dollar60 !== null) score += Math.log10(dollar60 + 1) * 8;

  const accel = finiteMetric(row.volume_acceleration_pct) ?? finiteMetric(row.acceleration_5m);
  if (accel !== null && accel > 0) score += Math.min(accel, 200) * 0.15;

  const state = (row.participation_state ?? "").trim().toUpperCase();
  score += (PARTICIPATION_PRIORITY[state] ?? 0) * 6;

  const classic = resolveClassicDayTradeRvol(row);
  if (classic !== null) score += Math.min(classic, 30) * 1.5;
  else {
    const volYday = finiteMetric(row.volume_ratio_prior_session);
    if (volYday !== null) score += Math.min(volYday, 30) * 1.2;
  }

  if (row.vwap_side === "above") score += 8;

  return score;
}

function promotionRecencyScore(row: RadarRankedRow, nowMs: number): number {
  const iso = row.promoted_at;
  if (!iso) return 0;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return 0;
  const ageMin = Math.max(0, (nowMs - at) / 60_000);
  if (ageMin <= 3) return 20;
  if (ageMin <= 15) return 12;
  if (ageMin <= 60) return 6;
  return 0;
}

/** Higher = stronger Day Trade opportunity (for sorting descending). */
export function dayTradeOpportunityScore(row: RadarRankedRow, nowMs = Date.now()): number {
  const move = finiteMetric(row.change_percent);
  let score = 0;
  if (move !== null) score += Math.min(move, 120) * 3;
  score += participationScore(row);
  score += hodProximityScore(row);
  score += freshnessScore(row) * 5;
  score += signalScore(row) * 4;
  score += promotionRecencyScore(row, nowMs);
  return score;
}

export function compareDayTradeOpportunity(
  a: RadarRankedRow,
  b: RadarRankedRow,
  nowMs = Date.now(),
): number {
  const diff = dayTradeOpportunityScore(b, nowMs) - dayTradeOpportunityScore(a, nowMs);
  if (diff !== 0) return diff;

  const moveDiff =
    (finiteMetric(b.change_percent) ?? -Infinity) - (finiteMetric(a.change_percent) ?? -Infinity);
  if (moveDiff !== 0) return moveDiff;

  const velDiff = (finiteMetric(b.vol_velocity) ?? -1) - (finiteMetric(a.vol_velocity) ?? -1);
  if (velDiff !== 0) return velDiff;

  const aPromo = a.promoted_at ?? "";
  const bPromo = b.promoted_at ?? "";
  if (aPromo !== bPromo) return bPromo.localeCompare(aPromo);

  return a.rank - b.rank;
}

export function rankDayTradeOpportunities(
  rows: readonly RadarRankedRow[],
  nowMs = Date.now(),
): RadarRankedRow[] {
  const qualified = rows.filter(qualifiesDayTradeMomentum);
  const sorted = [...qualified].sort((a, b) => compareDayTradeOpportunity(a, b, nowMs));
  return sorted.slice(0, DAY_TRADE_RADAR_MAX_ROWS).map((row, index) => ({
    ...row,
    day_trade_rank: index + 1,
  }));
}

export function filterDayTradePanelRows(
  universe: readonly RadarRankedRow[],
  nowMs = Date.now(),
): RadarRankedRow[] {
  return rankDayTradeOpportunities(universe, nowMs);
}
