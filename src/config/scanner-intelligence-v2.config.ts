/** Batch 8 — volume participation + historical match bounds (deterministic). */

/** Must match worker `momentum-metrics.config.ts` — never invent a 1.0 fallback. */
export const RVOL_5M_MIN_TOD_SAMPLES = 5;

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
  /** Minimum comparable episodes with both-side features for a strong similarity label. */
  minFeaturesForStrongMatch: 4,
  /** Below this count, a match is labeled sparse evidence. */
  sparseFeatureThreshold: 2,
  /** Minimum episodes with known continuation to show a continuation rate. */
  minKnownOutcomesForRate: 2,
  /** Minimum observed forward outcomes for adequate outcome confidence. */
  minOutcomesForAdequateConfidence: 3,
} as const;
