import type { ContinuationVelocityState } from "@/config/continuation.config";
import {
  VOLUME_ACCELERATION_THRESHOLDS,
  VOLUME_VELOCITY_RATIO,
  type VolumeAccelerationState,
} from "@/config/scanner-intelligence-v2.config";
import { finiteMetric } from "@/lib/screeners/screener-metric-display";

/** Classify smoothed 5m-vs-prior-5m acceleration percent (null when unavailable). */
export function classifyVolumeAccelerationState(
  volumeAccelerationPct: number | null | undefined,
): VolumeAccelerationState | null {
  const pct = finiteMetric(volumeAccelerationPct);
  if (pct === null) return null;
  if (pct >= VOLUME_ACCELERATION_THRESHOLDS.explosivePct) return "EXPLOSIVE";
  if (pct >= VOLUME_ACCELERATION_THRESHOLDS.acceleratingPct) return "ACCELERATING";
  if (pct >= VOLUME_ACCELERATION_THRESHOLDS.buildingPct) return "BUILDING";
  return "NORMAL";
}

/**
 * Ratio of recent shares/min to prior shares/min when both windows are known.
 * When only acceleration pct is available, derive approximate ratio: 1 + pct/100.
 */
export function volumeVelocityRatio(input: {
  currentVelocity?: number | null | undefined;
  priorVelocity?: number | null | undefined;
  volumeAccelerationPct?: number | null;
}): number | null {
  const curr = finiteMetric(input.currentVelocity);
  const prior = finiteMetric(input.priorVelocity);
  if (curr !== null && prior !== null && prior >= VOLUME_VELOCITY_RATIO.minPriorVelocity) {
    const ratio = curr / prior;
    return Number.isFinite(ratio) ? Math.round(ratio * 100) / 100 : null;
  }
  const accel = finiteMetric(input.volumeAccelerationPct);
  if (accel === null) return null;
  const derived = 1 + accel / 100;
  return Number.isFinite(derived) ? Math.round(derived * 100) / 100 : null;
}

export function accelerationStateToContinuationVelocity(
  state: VolumeAccelerationState | null,
): ContinuationVelocityState | null {
  if (!state) return null;
  if (state === "EXPLOSIVE" || state === "ACCELERATING") return "STRONG";
  if (state === "BUILDING") return "MODERATE";
  return "WEAK";
}

export function resolveRowVolumeVelocity(row: {
  vol_velocity?: number | null;
  volume_velocity?: number | null;
  volume_velocity_5m?: number | null;
}): number | null {
  return (
    finiteMetric(row.vol_velocity) ??
    finiteMetric(row.volume_velocity) ??
    finiteMetric(row.volume_velocity_5m)
  );
}
