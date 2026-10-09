/**
 * Authoritative cumulative session volume for participation (vol/yday, TARVOL).
 *
 * Metric roles:
 * - Provider `av` (accumulated volume on the latest aggregate): full surveillance-day
 *   cumulative from Polygon/Massive for the symbol's session context.
 * - `metricsSessionVolume`: `av` when present on the latest in-window bar, else the
 *   retained-bar sum in RadarBook (short window — not full session).
 * - `geometrySessionVolumeSum`: sum of bar volumes since geometry subsession start
 *   (resets on PM→RTH soft transition); partial when promotion is late.
 * - `snapshotDayVolume`: Polygon snapshot `day.v` from periodic enrichment only when
 *   stream cumulative is unavailable.
 *
 * 5-minute RVOL uses rolling windows + TOD baseline — never this cumulative field.
 */

export type CumulativeSessionVolumeSource =
  | "provider_accumulated"
  | "metrics"
  | "geometry"
  | "snapshot"
  | "none";

export interface CumulativeSessionVolumeInput {
  providerAccumulatedVolume: number | null;
  metricsSessionVolume: number;
  geometrySessionVolumeSum: number | null;
  snapshotDayVolume: number | null;
}

export interface CumulativeSessionVolumeResolution {
  volume: number;
  source: CumulativeSessionVolumeSource;
}

function positiveFinite(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || !(value > 0)) return null;
  return value;
}

/**
 * Picks one cumulative session volume for participation ratios and TARVOL inputs.
 * Never prefers partial geometry over provider accumulated volume when `av` exists.
 */
export function resolveCumulativeSessionVolume(
  input: CumulativeSessionVolumeInput,
): CumulativeSessionVolumeResolution {
  const providerAv = positiveFinite(input.providerAccumulatedVolume);
  if (providerAv !== null) {
    return { volume: providerAv, source: "provider_accumulated" };
  }

  const metrics = positiveFinite(input.metricsSessionVolume) ?? 0;
  const geometry = positiveFinite(input.geometrySessionVolumeSum);
  const snapshot = positiveFinite(input.snapshotDayVolume);

  if (metrics > 0) {
    if (geometry === null || metrics >= geometry) {
      return { volume: metrics, source: "metrics" };
    }
    return { volume: geometry, source: "geometry" };
  }

  if (geometry !== null) {
    return { volume: geometry, source: "geometry" };
  }

  if (snapshot !== null) {
    return { volume: snapshot, source: "snapshot" };
  }

  return { volume: 0, source: "none" };
}

/** Whole-share prior session total; null when missing or invalid. */
export function normalizePriorSessionShareVolume(
  value: number | null | undefined,
): number | null {
  const n = positiveFinite(value);
  if (n === null) return null;
  const shares = Math.round(n);
  return shares > 0 ? shares : null;
}
