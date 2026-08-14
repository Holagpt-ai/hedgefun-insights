import {
  formatDayRange,
  isFiniteNumber,
  isPositiveFinite,
  type ScreenerResultRow,
  type ScreenerUiStatus,
} from "@/lib/screeners/contract";
import type { RadarRankedRow, RadarRankingFields, RadarSignalLabel } from "./types";
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
    const ranking = row as ScreenerResultRow & RadarRankingFields;
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
