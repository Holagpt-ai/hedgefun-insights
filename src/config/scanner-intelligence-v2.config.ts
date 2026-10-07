/** Batch 8 — volume participation + historical match bounds (deterministic). */

export const RVOL_5M_MIN_TOD_SAMPLES = 8;

export const VOLUME_ACCELERATION_STATES = [
  "NORMAL",
  "BUILDING",
  "ACCELERATING",
  "EXPLOSIVE",
] as const;

export type VolumeAccelerationState = (typeof VOLUME_ACCELERATION_STATES)[number];

export const VOLUME_ACCELERATION_THRESHOLDS = {
  buildingPct: 8,
  acceleratingPct: 18,
  explosivePct: 35,
} as const;

export const VOLUME_VELOCITY_RATIO = {
  /** Minimum prior-window velocity (shares/min) to compute a ratio. */
  minPriorVelocity: 500,
} as const;

export const HISTORICAL_MATCH = {
  maxTopMatches: 5,
  minSimilarityScore: 0.35,
  limitedSampleThreshold: 3,
} as const;
