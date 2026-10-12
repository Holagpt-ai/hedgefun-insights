import {
  DAY_TRADE_FRESHNESS_ACTIVE_MS,
  DAY_TRADE_FRESHNESS_AGING_MIN_VELOCITY,
  DAY_TRADE_FRESHNESS_AGING_MS,
  DAY_TRADE_FRESHNESS_MIN_ROLLING_60S,
  DAY_TRADE_FRESHNESS_RECENT_MS,
  DAY_TRADE_FRESHNESS_REACTIVATION_ACCEL_PCT,
} from "./freshness.config.ts";
import type { DayTradeMetricsRow } from "./evaluate-five-pillars.ts";

function finite(n: unknown): number | null {
  if (n === null || n === undefined) return null;
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function latestActivityMs(row: DayTradeMetricsRow): number | null {
  const candidates = [
    parseMs(row.primary_scanner_event_at),
    parseMs(row.last_hod_break_at),
    parseMs(row.promoted_at),
  ].filter((v): v is number => v !== null);
  if (candidates.length === 0) return null;
  return Math.max(...candidates);
}

function strongParticipation(row: DayTradeMetricsRow): boolean {
  const velocity = finite(row.vol_velocity);
  const vol60 = finite(row.rolling_volume_60s);
  const accel = finite(row.volume_acceleration_pct);
  const freshness = (row.freshness_class ?? "").toLowerCase();
  const participation = (row.participation_state ?? "").toUpperCase();
  const signal = (row.signal_status ?? "").toUpperCase();
  if (velocity !== null && velocity >= DAY_TRADE_FRESHNESS_AGING_MIN_VELOCITY) return true;
  if (vol60 !== null && vol60 >= DAY_TRADE_FRESHNESS_MIN_ROLLING_60S) return true;
  if (accel !== null && accel >= DAY_TRADE_FRESHNESS_REACTIVATION_ACCEL_PCT) return true;
  if (participation === "RISING" || participation === "SURGING" || participation === "EXTREME") {
    return true;
  }
  if (signal === "REACTIVATED" || signal === "EXPLOSIVE" || signal === "BUILDING") return true;
  if (freshness === "fresh" || freshness === "active") return true;
  return false;
}

function isCooling(row: DayTradeMetricsRow): boolean {
  const freshness = (row.freshness_class ?? "").toLowerCase();
  const signal = (row.signal_status ?? "").toUpperCase();
  const accel = finite(row.volume_acceleration_pct);
  if (freshness === "cooling" || freshness === "stale") return true;
  if (signal === "COOLING") return true;
  if (accel !== null && accel < 0) return true;
  return false;
}

/** Market-data clock for freshness (not wall clock). */
export function qualifiesFreshnessFromMetrics(
  row: DayTradeMetricsRow,
  marketDataMs: number,
): boolean {
  const activityMs = latestActivityMs(row);
  const strong = strongParticipation(row);
  const cooling = isCooling(row);
  if (activityMs === null) return strong;
  const ageMs = Math.max(0, marketDataMs - activityMs);
  if (ageMs <= DAY_TRADE_FRESHNESS_ACTIVE_MS) return true;
  if (ageMs <= DAY_TRADE_FRESHNESS_RECENT_MS) return strong || !cooling;
  if (ageMs <= DAY_TRADE_FRESHNESS_AGING_MS) return strong && !cooling;
  return strong && !cooling && ageMs <= DAY_TRADE_FRESHNESS_RECENT_MS * 2;
}
