/**
 * 52-week baseline extrema must stay on one split-adjusted price scale.
 * Polygon grouped daily uses adjusted=true; running max/min can still retain
 * a pre-restatement high when later session bars are restated lower after a
 * reverse split (incremental apply never revisits prior dates).
 */

export const BASELINE_DISCONTINUITY_RATIO_MIN = 100;
/** Fail-closed when published high/low span implausible on one adjusted scale. */
export const BASELINE_MAX_HL_RATIO = 2000;
const INTEGER_FACTOR_TOLERANCE = 0.03;

export function nearIntegerScaleFactor(ratio: number): number | null {
  if (!Number.isFinite(ratio) || ratio < BASELINE_DISCONTINUITY_RATIO_MIN) {
    return null;
  }
  const rounded = Math.round(ratio);
  if (rounded < BASELINE_DISCONTINUITY_RATIO_MIN) return null;
  if (Math.abs(ratio - rounded) / rounded <= INTEGER_FACTOR_TOLERANCE) {
    return rounded;
  }
  return null;
}

/**
 * Restate a stale running high when today's session high implies a reverse-split
 * scale change (legacy >> session by a near-integer factor).
 */
export function restateLegacyHigh(legacyHigh: number, sessionHigh: number): number {
  if (!(legacyHigh > 0) || !(sessionHigh > 0)) return legacyHigh;
  if (legacyHigh <= sessionHigh * BASELINE_DISCONTINUITY_RATIO_MIN) {
    return legacyHigh;
  }
  const factor = nearIntegerScaleFactor(legacyHigh / sessionHigh);
  if (factor === null) return legacyHigh;
  const restated = legacyHigh / factor;
  return restated >= sessionHigh ? restated : sessionHigh;
}

/**
 * Restate a stale running low when today's session low implies history was on a
 * smaller scale (session low >> legacy low by a near-integer factor).
 */
export function restateLegacyLow(legacyLow: number, sessionLow: number): number {
  if (!(legacyLow > 0) || !(sessionLow > 0)) return legacyLow;
  if (sessionLow <= legacyLow * BASELINE_DISCONTINUITY_RATIO_MIN) {
    return legacyLow;
  }
  const factor = nearIntegerScaleFactor(sessionLow / legacyLow);
  if (factor === null) return legacyLow;
  const restated = legacyLow * factor;
  return restated <= sessionLow ? restated : sessionLow;
}

export function merge52WeekHigh(existingHigh: number, barHigh: number): number {
  const reconciled = restateLegacyHigh(existingHigh, barHigh);
  return reconciled >= barHigh ? reconciled : barHigh;
}

export function merge52WeekLow(existingLow: number, barLow: number): number {
  const reconciled = restateLegacyLow(existingLow, barLow);
  return reconciled <= barLow ? reconciled : barLow;
}

export function isCoherent52WeekRange(high: number, low: number): boolean {
  if (!(high > 0) || !(low > 0) || !(low <= high)) return false;
  const ratio = high / low;
  if (!Number.isFinite(ratio)) return false;
  return ratio <= BASELINE_MAX_HL_RATIO;
}
