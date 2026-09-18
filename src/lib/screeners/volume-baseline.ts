/**
 * Client-side RVOL 20D baseline validation (mirrors Deno shared module).
 */

import { computeDailyRvol20d } from "@/lib/screeners/daily-rvol";

export const RVOL_20D_SESSION_COUNT = 20;

export type VolumeBaselineQuote = {
  symbol: string;
  avg_volume_20d: number;
  volume_sessions_used: number;
  window_start_date: string;
  window_end_date: string;
};

export function isValidVolumeBaselineQuote(
  row: Partial<VolumeBaselineQuote>,
): row is VolumeBaselineQuote {
  if (typeof row.symbol !== "string" || !row.symbol.trim()) return false;
  if (row.volume_sessions_used !== RVOL_20D_SESSION_COUNT) return false;
  if (typeof row.avg_volume_20d !== "number" || !Number.isFinite(row.avg_volume_20d)) {
    return false;
  }
  if (!(row.avg_volume_20d > 0)) return false;
  if (typeof row.window_start_date !== "string" || typeof row.window_end_date !== "string") {
    return false;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.window_start_date)) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.window_end_date)) return false;
  if (row.window_start_date > row.window_end_date) return false;
  return true;
}

export function isVolumeBaselineValidForTradingDate(
  baseline: VolumeBaselineQuote,
  tradingDate: string,
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tradingDate)) return false;
  return baseline.window_end_date < tradingDate;
}

export function rvol20dFromBaseline(
  currentVolume: number | null | undefined,
  baseline: VolumeBaselineQuote | null | undefined,
  tradingDate: string,
): { avg_volume_20d: number | null; rvol_20d: number | null } {
  if (!baseline || !isVolumeBaselineValidForTradingDate(baseline, tradingDate)) {
    return { avg_volume_20d: null, rvol_20d: null };
  }
  const rvol = computeDailyRvol20d(currentVolume, baseline.avg_volume_20d);
  // Zero session volume yields a non-positive ratio, which is not a valid
  // rvol pair downstream. Report no RVOL rather than a rejected pair.
  if (rvol === null || !(rvol > 0)) {
    return { avg_volume_20d: null, rvol_20d: null };
  }
  return { avg_volume_20d: baseline.avg_volume_20d, rvol_20d: rvol };
}
