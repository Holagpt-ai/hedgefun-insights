import type { ContinuationRvolMetricKind } from "@/lib/am-inbox/late-session-continuation-types";
import { impliedBaselineVolumeFromRatio } from "@/lib/screeners/continuation-rvol-confidence";
import type { ScreenerContinuationSource } from "@/lib/screeners/screener-continuation";

export interface ContinuationRvolCapture {
  rawRvol: number | null;
  metricKind: ContinuationRvolMetricKind | null;
  baselineVolume: number | null;
  baselineSampleSize: number | null;
}

const EMPTY_CAPTURE: ContinuationRvolCapture = {
  rawRvol: null,
  metricKind: null,
  baselineVolume: null,
  baselineSampleSize: null,
};

function positiveFinite(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function positiveInteger(value: unknown): number | null {
  const n = positiveFinite(value);
  if (n === null || !Number.isInteger(n)) return null;
  return n;
}

export type ContinuationRvolCaptureSource = Pick<
  ScreenerContinuationSource,
  | "rvol_20d"
  | "avg_volume_20d"
  | "time_adjusted_rvol"
  | "rvol_5m"
  | "volume"
  | "volume_5m"
  | "participation_baseline_session_count"
>;

/**
 * Selects one internally consistent RVOL tuple for late-session handoff capture.
 *
 * Precedence (same-session continuation — intraday before daily):
 * 1. time_adjusted_rvol with implied session baseline when present
 * 2. rvol_5m with 5m window baseline when present
 * 3. rvol_20d when both ratio and avg_volume_20d baseline exist
 */
export function resolveContinuationRvolCapture(
  row: ContinuationRvolCaptureSource,
): ContinuationRvolCapture {
  const timeAdjusted = positiveFinite(row.time_adjusted_rvol);
  if (timeAdjusted !== null) {
    return {
      rawRvol: timeAdjusted,
      metricKind: "time_adjusted",
      baselineVolume: impliedBaselineVolumeFromRatio(row.volume, timeAdjusted),
      baselineSampleSize: positiveInteger(row.participation_baseline_session_count),
    };
  }

  const rvol5m = positiveFinite(row.rvol_5m);
  if (rvol5m !== null) {
    return {
      rawRvol: rvol5m,
      metricKind: "rvol_5m",
      baselineVolume: impliedBaselineVolumeFromRatio(row.volume_5m, rvol5m),
      baselineSampleSize: positiveInteger(row.participation_baseline_session_count),
    };
  }

  const rvol20d = positiveFinite(row.rvol_20d);
  const avg20d = positiveFinite(row.avg_volume_20d);
  if (rvol20d !== null && avg20d !== null) {
    return {
      rawRvol: rvol20d,
      metricKind: "rvol_20d",
      baselineVolume: avg20d,
      baselineSampleSize: null,
    };
  }

  return { ...EMPTY_CAPTURE };
}
