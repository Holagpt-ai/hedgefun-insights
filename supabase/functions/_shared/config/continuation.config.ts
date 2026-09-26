/**
 * Late-Session Continuation / Day-Two Watch V1 configuration.
 *
 * Next-session handoff intelligence only. Does not affect Discovery Rank,
 * Trade Quality weights, Trader Lens, filters, Trigger Time, or live Radar.
 *
 * Session windows are America/New_York wall-clock times. Internal timestamps
 * remain UTC. Evaluation uses timezone-aware conversion — not a fixed UTC offset.
 */

const MS_PER_HOUR = 3_600_000;

export const CONTINUATION_MODEL_VERSION = "v1" as const;
export type ContinuationModelVersion = typeof CONTINUATION_MODEL_VERSION;

export const CONTINUATION_CATEGORIES = [
  "POWER_HOUR_MOMENTUM",
  "STRONG_CLOSE_NEAR_HOD",
  "AFTER_HOURS_CONTINUATION",
  "DAY_TWO_WATCH",
] as const;

export type ContinuationCategory = (typeof CONTINUATION_CATEGORIES)[number];

/** Tie-break priority only. A symbol may still qualify for multiple categories. */
export const CONTINUATION_CATEGORY_PRIORITY: Record<ContinuationCategory, number> = {
  POWER_HOUR_MOMENTUM: 4,
  STRONG_CLOSE_NEAR_HOD: 3,
  AFTER_HOURS_CONTINUATION: 2,
  DAY_TWO_WATCH: 1,
};

export const CONTINUATION_HIGH_CONFIDENCE_CATEGORIES = [
  "POWER_HOUR_MOMENTUM",
  "STRONG_CLOSE_NEAR_HOD",
  "AFTER_HOURS_CONTINUATION",
] as const;

export const CONTINUATION_COMPONENT_WEIGHTS = {
  lateSessionVelocity: 20,
  closeHodStrength: 20,
  dollarVolume: 15,
  catalyst: 15,
  vwapHold: 10,
  floatTurnover: 10,
  rvol20d: 5,
  tradeQuality: 5,
} as const;

export type ContinuationComponentKey = keyof typeof CONTINUATION_COMPONENT_WEIGHTS;

export const CONTINUATION_TOTAL_WEIGHT = Object.values(CONTINUATION_COMPONENT_WEIGHTS).reduce(
  (sum, weight) => sum + weight,
  0,
);

export const CONTINUATION_MIN_COVERAGE_PCT = 60;
export const CONTINUATION_DAY_TWO_MIN_SCORE = 70;

/** Inclusive Power Hour window in Eastern ms-of-day: 15:00–16:00 ET. */
export const CONTINUATION_POWER_HOUR_START_MS = 15 * MS_PER_HOUR;
export const CONTINUATION_POWER_HOUR_END_MS = 16 * MS_PER_HOUR;

/** After Hours is strictly after 16:00 through 20:00 ET inclusive. */
export const CONTINUATION_AFTER_HOURS_START_EXCLUSIVE_MS = 16 * MS_PER_HOUR;
export const CONTINUATION_AFTER_HOURS_END_INCLUSIVE_MS = 20 * MS_PER_HOUR;

export const CONTINUATION_VELOCITY_SCORES = {
  STRONG: 20,
  MODERATE: 14,
  WEAK: 7,
  NONE: 0,
} as const;

export type ContinuationVelocityState = keyof typeof CONTINUATION_VELOCITY_SCORES | "UNKNOWN";

export type ContinuationHodTier = {
  readonly maxInclusive: number | null;
  readonly score: number;
};

export const CONTINUATION_HOD_TIERS: readonly ContinuationHodTier[] = [
  { maxInclusive: 1, score: 20 },
  { maxInclusive: 2, score: 17 },
  { maxInclusive: 3, score: 13 },
  { maxInclusive: 5, score: 8 },
  { maxInclusive: 10, score: 3 },
  { maxInclusive: null, score: 0 },
] as const;

export type ContinuationNumericTier = {
  readonly minInclusive: number;
  readonly maxExclusive: number | null;
  readonly score: number;
};

export const CONTINUATION_DOLLAR_VOLUME_TIERS: readonly ContinuationNumericTier[] = [
  { minInclusive: 0, maxExclusive: 1_000_000, score: 1 },
  { minInclusive: 1_000_000, maxExclusive: 5_000_000, score: 4 },
  { minInclusive: 5_000_000, maxExclusive: 15_000_000, score: 8 },
  { minInclusive: 15_000_000, maxExclusive: 30_000_000, score: 11 },
  { minInclusive: 30_000_000, maxExclusive: 50_000_000, score: 13 },
  { minInclusive: 50_000_000, maxExclusive: null, score: 15 },
] as const;

export const CONTINUATION_CATALYST_SCORES = {
  STRONG: 15,
  MODERATE: 10,
  WEAK: 5,
  NONE: 0,
} as const;

export const CONTINUATION_VWAP_SIGNAL_WEIGHTS = {
  aboveVwap: 5,
  holdingVwapAfterReclaim: 3,
  positiveStructure: 2,
} as const;

export const CONTINUATION_FLOAT_TURNOVER_TIERS: readonly ContinuationNumericTier[] = [
  { minInclusive: 0, maxExclusive: 0.25, score: 1 },
  { minInclusive: 0.25, maxExclusive: 0.5, score: 3 },
  { minInclusive: 0.5, maxExclusive: 1, score: 5 },
  { minInclusive: 1, maxExclusive: 2, score: 7 },
  { minInclusive: 2, maxExclusive: 4, score: 9 },
  { minInclusive: 4, maxExclusive: null, score: 10 },
] as const;

export const CONTINUATION_RVOL20D_TIERS: readonly ContinuationNumericTier[] = [
  { minInclusive: 0, maxExclusive: 1, score: 0 },
  { minInclusive: 1, maxExclusive: 2, score: 1 },
  { minInclusive: 2, maxExclusive: 3, score: 2 },
  { minInclusive: 3, maxExclusive: 5, score: 3 },
  { minInclusive: 5, maxExclusive: 10, score: 4 },
  { minInclusive: 10, maxExclusive: null, score: 5 },
] as const;

export const CONTINUATION_TRADE_QUALITY_TIERS: readonly ContinuationNumericTier[] = [
  { minInclusive: 85, maxExclusive: null, score: 5 },
  { minInclusive: 70, maxExclusive: 85, score: 4 },
  { minInclusive: 55, maxExclusive: 70, score: 3 },
  { minInclusive: 40, maxExclusive: 55, score: 2 },
  { minInclusive: 0, maxExclusive: 40, score: 1 },
] as const;

export const CONTINUATION_POWER_HOUR_MIN_DOLLAR_VOLUME = 5_000_000;
export const CONTINUATION_STRONG_CLOSE_MIN_DOLLAR_VOLUME = 3_000_000;
export const CONTINUATION_STRONG_CLOSE_MAX_HOD_DISTANCE_PCT = 3;
export const CONTINUATION_AFTER_HOURS_MIN_DOLLAR_VOLUME = 1_000_000;
export const CONTINUATION_AFTER_HOURS_MAINTAIN_HOD_PCT = 3;
export const CONTINUATION_DAY_TWO_MIN_DOLLAR_VOLUME = 3_000_000;
export const CONTINUATION_CRITICAL_MIN_DOLLAR_VOLUME = 250_000;
/** Minimum cumulative session shares before overnight handoff (Volume is king). */
export const CONTINUATION_MIN_SESSION_VOLUME = 300_000;
export const CONTINUATION_MAX_SPREAD_PCT = 8;

/** Closing rejection = (HOD − close) / HOD as percent. */
export const CONTINUATION_CLOSING_REJECTION_CAUTION_PCT = 3;
export const CONTINUATION_CLOSING_REJECTION_DISQUALIFY_PCT = 8;

/** After-hours extension below this percent vs regular close is not continuation. */
export const CONTINUATION_AFTER_HOURS_EXTENSION_MIN_PCT = -2;

export const CONTINUATION_TIME_ADJUSTED_RVOL_STRONG = 3;
export const CONTINUATION_VOLUME_ACCELERATION_QUALIFY_PCT = 15;

export const CONTINUATION_EXCLUDED_INSTRUMENT_TYPES = ["WARRANT", "RIGHT", "UNIT"] as const;

export const CONTINUATION_REASONS = [
  "POWER_HOUR_VOLUME_ACCELERATION",
  "CLOSE_WITHIN_1PCT_OF_HOD",
  "CLOSE_NEAR_HOD",
  "AFTER_HOURS_STRENGTH",
  "VERIFIED_CATALYST",
  "ABOVE_VWAP",
  "HIGH_DOLLAR_VOLUME",
  "FLOAT_ROTATION",
  "STRONG_RVOL",
  "HIGH_TRADE_QUALITY",
] as const;

export type ContinuationReason = (typeof CONTINUATION_REASONS)[number];

export const CONTINUATION_LABELS = ["READY", "INCOMPLETE"] as const;
export type ContinuationLabel = (typeof CONTINUATION_LABELS)[number];
