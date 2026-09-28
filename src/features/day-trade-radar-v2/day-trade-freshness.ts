/**
 * Day Trade desk freshness — current participation, not trigger age alone.
 */

import {
  DAY_TRADE_FRESHNESS_ACTIVE_MS,
  DAY_TRADE_FRESHNESS_AGING_MIN_VELOCITY,
  DAY_TRADE_FRESHNESS_AGING_MS,
  DAY_TRADE_FRESHNESS_MIN_ROLLING_60S,
  DAY_TRADE_FRESHNESS_RECENT_MS,
  DAY_TRADE_FRESHNESS_REACTIVATION_ACCEL_PCT,
} from "@/config/day-trade-freshness.config";
import { parseTimestampMs } from "@/lib/screeners/contract";
import { toCanonicalUtcTimestamp } from "@/lib/screeners/trigger-time";
import { finiteMetric } from "@/lib/screeners/screener-metric-display";
import { formatElapsedAge } from "@/lib/screeners/elapsed-age";
import { formatTriggerTimePrimaryLine } from "@/lib/screeners/screener-trigger-time";
import { mapVolumeTrend } from "./multi-radar";
import type { RadarRankedRow } from "./types";

export type DayTradeFreshnessState = "ACTIVE" | "RECENT" | "REACTIVATED" | "AGING" | "STALE";

export interface DayTradeFreshnessEvaluation {
  state: DayTradeFreshnessState;
  activityAt: string | null;
  ageMs: number | null;
  eligibleForMainDesk: boolean;
  evidence: string[];
}

function parseActivityMs(iso: string | null | undefined): number | null {
  const canonical = toCanonicalUtcTimestamp(iso ?? null);
  if (!canonical) return null;
  return parseTimestampMs(canonical);
}

function latestActivityMs(row: RadarRankedRow): { ms: number | null; iso: string | null; evidence: string[] } {
  const candidates: { key: string; iso: string | null }[] = [
    { key: "primary_scanner_event_at", iso: row.primary_scanner_event_at ?? null },
    { key: "last_hod_break_at", iso: row.last_hod_break_at ?? null },
    { key: "promoted_at", iso: row.promoted_at ?? null },
  ];
  let bestMs: number | null = null;
  let bestIso: string | null = null;
  const evidence: string[] = [];
  for (const item of candidates) {
    const ms = parseActivityMs(item.iso);
    if (ms === null) continue;
    evidence.push(item.key);
    if (bestMs === null || ms > bestMs) {
      bestMs = ms;
      bestIso = toCanonicalUtcTimestamp(item.iso);
    }
  }
  return { ms: bestMs, iso: bestIso, evidence };
}

function hasStrongCurrentParticipation(row: RadarRankedRow): boolean {
  const velocity = finiteMetric(row.vol_velocity);
  const vol60 = finiteMetric(row.rolling_volume_60s);
  const accel =
    finiteMetric(row.volume_acceleration_pct) ?? finiteMetric(row.acceleration_5m);
  const trend = mapVolumeTrend(row.volume_acceleration_pct).label;
  const participation = (row.participation_state ?? "").trim().toUpperCase();
  const signal = (row.signal_status ?? row.signal ?? "").trim().toUpperCase();

  if (velocity !== null && velocity >= DAY_TRADE_FRESHNESS_AGING_MIN_VELOCITY) return true;
  if (vol60 !== null && vol60 >= DAY_TRADE_FRESHNESS_MIN_ROLLING_60S) return true;
  if (accel !== null && accel >= DAY_TRADE_FRESHNESS_REACTIVATION_ACCEL_PCT) return true;
  if (trend === "RISING ↑" || trend === "SURGING ↑↑" || trend === "EXTREME ↑↑") return true;
  if (participation === "RISING" || participation === "SURGING" || participation === "EXTREME") {
    return true;
  }
  if (signal === "REACTIVATED" || signal === "EXPLOSIVE" || signal === "BUILDING") return true;
  return false;
}

function isCooling(row: RadarRankedRow): boolean {
  const trend = mapVolumeTrend(row.volume_acceleration_pct).label;
  const signal = (row.signal_status ?? row.signal ?? "").trim().toUpperCase();
  const freshness = (row.freshness_class ?? "").trim().toLowerCase();
  return trend === "COOLING ↓" || signal === "COOLING" || freshness === "cooling" || freshness === "stale";
}

function promotedMs(row: RadarRankedRow): number | null {
  return parseActivityMs(row.promoted_at ?? null);
}

function recentEventMs(row: RadarRankedRow): number | null {
  const eventMs = parseActivityMs(row.primary_scanner_event_at ?? null);
  const hodMs = parseActivityMs(row.last_hod_break_at ?? null);
  if (eventMs === null) return hodMs;
  if (hodMs === null) return eventMs;
  return Math.max(eventMs, hodMs);
}

export function evaluateDayTradeFreshness(
  row: RadarRankedRow,
  nowMs: number,
): DayTradeFreshnessEvaluation {
  const { ms: activityMs, iso: activityAt, evidence } = latestActivityMs(row);
  const ageMs = activityMs === null ? null : Math.max(0, nowMs - activityMs);
  const strong = hasStrongCurrentParticipation(row);
  const cooling = isCooling(row);
  const promoMs = promotedMs(row);
  const recentEvent = recentEventMs(row);
  const reactivated =
    promoMs !== null &&
    recentEvent !== null &&
    nowMs - promoMs > DAY_TRADE_FRESHNESS_RECENT_MS &&
    nowMs - recentEvent <= DAY_TRADE_FRESHNESS_ACTIVE_MS &&
    strong;

  if (reactivated) {
    return {
      state: "REACTIVATED",
      activityAt: activityAt,
      ageMs,
      eligibleForMainDesk: true,
      evidence: [...evidence, "reactivation"],
    };
  }

  if (ageMs === null) {
    return {
      state: strong ? "ACTIVE" : "STALE",
      activityAt: null,
      ageMs: null,
      eligibleForMainDesk: strong,
      evidence,
    };
  }

  if (ageMs <= DAY_TRADE_FRESHNESS_ACTIVE_MS) {
    return {
      state: "ACTIVE",
      activityAt,
      ageMs,
      eligibleForMainDesk: true,
      evidence,
    };
  }

  if (ageMs <= DAY_TRADE_FRESHNESS_RECENT_MS) {
    return {
      state: "RECENT",
      activityAt,
      ageMs,
      eligibleForMainDesk: strong || !cooling,
      evidence,
    };
  }

  if (ageMs <= DAY_TRADE_FRESHNESS_AGING_MS) {
    const eligible = strong && !cooling;
    return {
      state: "AGING",
      activityAt,
      ageMs,
      eligibleForMainDesk: eligible,
      evidence,
    };
  }

  const eligible = strong && !cooling && recentEvent !== null && nowMs - recentEvent <= DAY_TRADE_FRESHNESS_RECENT_MS;
  return {
    state: eligible ? "REACTIVATED" : "STALE",
    activityAt,
    ageMs,
    eligibleForMainDesk: eligible,
    evidence,
  };
}

export function qualifiesDayTradeFreshness(row: RadarRankedRow, nowMs: number): boolean {
  return evaluateDayTradeFreshness(row, nowMs).eligibleForMainDesk;
}

export function formatDayTradeLeaderTiming(
  row: RadarRankedRow,
  nowMs: number,
): string | null {
  const freshness = evaluateDayTradeFreshness(row, nowMs);
  if (!freshness.activityAt) return null;
  const timeEt = formatTriggerTimePrimaryLine(freshness.activityAt);
  if (timeEt === "—") return null;
  const age = formatElapsedAge(freshness.activityAt, nowMs);
  const prefix =
    freshness.state === "REACTIVATED"
      ? "Reactivated"
      : freshness.state === "ACTIVE"
        ? "Active since"
        : "Triggered";
  return age ? `${prefix} ${timeEt} ET · ${age}` : `${prefix} ${timeEt} ET`;
}
