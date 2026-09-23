import {
  formatDayRange,
  isFiniteNumber,
  isPositiveFinite,
  parseTimestampMs,
  type ScreenerResultRow,
  type ScreenerUiStatus,
} from "@/lib/screeners/contract";
import type { RadarRankedRow, RadarRankingFields, RadarSignalLabel, LegacyConfirmationFields } from "./types";
import { isRadarCapabilityEnabled } from "./radar-capabilities";
import { isRadarV22Signal } from "@/lib/radar-v22";

/**
 * Authoritative ranks from verified backend order (volume desc, symbol asc).
 * Catalyst / display fields must never reorder this list.
 */
export function rankRadarRows(
  rows: readonly ScreenerResultRow[],
  status: ScreenerUiStatus,
): RadarRankedRow[] {
  return rows.map((row, index) => {
    const rank = index + 1;
    const ranking = row as ScreenerResultRow & RadarRankingFields & LegacyConfirmationFields;
    return {
      ...row,
      rank,
      signal: signalForRank(rank, status, false, ranking.signal_status),
      hod_distance_percent: computeHodDistancePercent(row.price, row.day_high),
      radar_rank: ranking.radar_rank ?? rank,
      signal_status: ranking.signal_status,
      signal_tier: ranking.signal_tier,
      rolling_volume_5s: ranking.rolling_volume_5s,
      rolling_volume_15s: ranking.rolling_volume_15s,
      rolling_volume_60s: ranking.rolling_volume_60s,
      acceleration_5m: ranking.acceleration_5m,
      rvol_5m: ranking.rvol_5m,
      vol_velocity: ranking.vol_velocity,
      volume_acceleration_pct: ranking.volume_acceleration_pct,
      rolling_dollar_volume_60s: ranking.rolling_dollar_volume_60s,
      session_vwap: ranking.session_vwap,
      vwap_side: ranking.vwap_side,
      freshness_class: ranking.freshness_class,
      move_15s_pct: ranking.move_15s_pct,
      move_60s_pct: ranking.move_60s_pct,
      promoted_at: ranking.promoted_at ?? null,
      last_hod_break_at: ranking.last_hod_break_at ?? null,
      radar_trading_date: ranking.radar_trading_date ?? null,
      legacy_confirmed: ranking.legacy_confirmed,
      legacy_price_gate: ranking.legacy_price_gate,
      legacy_move_gate: ranking.legacy_move_gate,
      legacy_volume_gate: ranking.legacy_volume_gate,
    };
  });
}

export function signalForRank(
  rank: number,
  status: ScreenerUiStatus,
  inactive: boolean,
  signalStatus?: string,
): RadarSignalLabel {
  if (inactive) return "INACTIVE";
  if (status === "stale") return "STALE";
  if (isRadarV22Signal(signalStatus) && signalStatus !== "STALE" && signalStatus !== "INACTIVE") {
    return signalStatus;
  }
  if (rank === 1) return "TOP LEADER";
  return "VOLUME LEADER";
}

/** Percentage distance from HOD. Null when either input is missing/invalid. */
export function computeHodDistancePercent(
  price: number | null | undefined,
  dayHigh: number | null | undefined,
): number | null {
  if (!isRadarCapabilityEnabled("hodDistance")) return null;
  if (!isFiniteNumber(price) || !isPositiveFinite(dayHigh)) return null;
  if (dayHigh === 0) return null;
  return Math.round(((dayHigh - price) / dayHigh) * 1000) / 10;
}

export function formatHodDistance(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "Unavailable";
  }
  return `${value.toFixed(1)}%`;
}

export function formatRadarPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `$${Number(value).toFixed(2)}`;
}

export function formatRadarPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const n = Number(value);
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

export function formatRadarVolume(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const n = Number(value);
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export function formatRadarMultiplier(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${Number(value).toFixed(1)}×`;
}

/** Honest empty for optional Radar metrics — never coerce missing to 0. */
export function formatRadarUnavailableMetric(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Unavailable";
  return formatRadarVolume(value);
}

export function formatRadarContextVolume(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Unavailable";
  return formatRadarVolume(value);
}

export function formatRadarContextMultiplier(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Unavailable";
  return `${Number(value).toFixed(1)}×`;
}

export function formatRadarDollarVolume(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Unavailable";
  return `$${formatRadarVolume(value)}`;
}

export function formatRadarAcceleration(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Unavailable";
  const n = Number(value);
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}`;
}

export function formatVwapState(
  side: string | null | undefined,
  vwap: number | null | undefined,
): string {
  const sideLabel = side === "above" || side === "below" ? side : null;
  const vwapLabel =
    vwap === null || vwap === undefined || !Number.isFinite(vwap) ? null : formatRadarPrice(vwap);
  if (!sideLabel && !vwapLabel) return "Unavailable";
  if (sideLabel && vwapLabel) return `${sideLabel} · ${vwapLabel}`;
  return sideLabel ?? vwapLabel ?? "Unavailable";
}

export function formatFreshness(value: string | null | undefined): string {
  if (typeof value !== "string" || !value.trim()) return "Unavailable";
  return value.trim();
}

export function formatRadarDataTime(iso: string | null | undefined): string {
  if (!iso) return "Unavailable";
  const ms = parseTimestampMs(iso);
  if (ms === null) return "Unavailable";
  return new Date(ms).toLocaleString();
}

/** Short-window move only. Callers must use 15s Move / 60s Move labels. */
export function formatShortWindowMove(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Unavailable";
  return formatRadarPercent(value);
}

export function formatRadarDayRange(
  dayLow: number | null | undefined,
  dayHigh: number | null | undefined,
): string {
  return formatDayRange(dayLow, dayHigh);
}

export function volumeRatioClass(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "text-foreground";
  }
  if (value >= 5) return "text-red-500 font-semibold";
  if (value >= 3) return "text-amber-500 font-semibold";
  return "text-foreground";
}

export function moveClass(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "text-foreground";
  }
  if (value > 0) return "text-green-600";
  if (value < 0) return "text-red-600";
  return "text-foreground";
}

/** Free-gate: rows at or beyond freeRowLimit are inaccessible when !isPro. */
export function isRadarRowAccessible(
  rank: number,
  isPro: boolean,
  freeRowLimit: number,
): boolean {
  if (isPro) return true;
  if (freeRowLimit <= 0) return false;
  return rank <= freeRowLimit;
}

export function radarSignalClass(signal: RadarSignalLabel): string {
  switch (signal) {
    case "TOP LEADER":
    case "EXPLOSIVE":
    case "REACTIVATED":
      return "text-amber-700 dark:text-amber-400";
    case "BUILDING":
    case "CONFIRMING":
      return "text-sky-700 dark:text-sky-400";
    case "COOLING":
    case "STALE":
    case "INACTIVE":
      return "text-muted-foreground";
    default:
      return "text-foreground";
  }
}

export function applySignals(
  rows: readonly RadarRankedRow[],
  status: ScreenerUiStatus,
  inactiveSymbol: string | null,
): RadarRankedRow[] {
  return rows.map((row) => ({
    ...row,
    signal: signalForRank(
      row.rank,
      status,
      inactiveSymbol !== null && row.symbol === inactiveSymbol,
      row.signal_status,
    ),
  }));
}
