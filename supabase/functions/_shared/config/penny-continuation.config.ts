/**
 * Penny Continuation V1 — owner-approved thresholds (Batch 222 contract).
 * Development implementation only; not production-activated until separate owner approval.
 */

export const PENNY_CONTINUATION_MODEL_VERSION = "penny_continuation_v1" as const;
export type PennyContinuationModelVersion = typeof PENNY_CONTINUATION_MODEL_VERSION;

/** Exclusive lower bound — price must be strictly greater. */
export const PENNY_MIN_ELIGIBLE_PRICE = 0.0001;
/** Strict upper bound — price must be strictly less than $1.00. */
export const PENNY_MAX_ELIGIBLE_PRICE = 1.0;

export const PENNY_MIN_SESSION_SHARES = 500_000;
export const PENNY_MIN_DOLLAR_VOLUME = 250_000;
export const PENNY_MIN_SHARES_PER_MINUTE = 25_000;
export const PENNY_MIN_MOVE_PCT = 3.0;
export const PENNY_MAX_SPREAD_PCT = 2.5;

export const PENNY_HOD_SIGNAL_MAX_PCT = 12;
export const PENNY_HOD_TIER_A_MAX_PCT = 5;
export const PENNY_REACCEL_MIN_PCT = 15;

export const PENNY_MAX_OBSERVATION_AGE_MS = 120_000;
export const PENNY_REQUALIFY_COOLDOWN_MS = 5 * 60_000;
export const PENNY_INVALIDATION_SESSION_HIGH_DROP_PCT = 2;

export const PENNY_MIN_TIME_ADJUSTED_RVOL_RANK = 2.0;
export const PENNY_CATALYST_MAX_AGE_HOURS_RANK = 72;
export const PENNY_FLOAT_TURNOVER_TIER_A = 0.5;

export const PENNY_DOCUMENTED_PROVIDER_DELAY_MS = 900_000;
export const PENNY_CORE_SIGNALS_REQUIRED = 3;

export const PENNY_SCORE_WEIGHTS = {
  sharesPerMinute: 30,
  sessionVolume: 25,
  dollarVolume: 15,
  hodProximity: 15,
  vwapStructure: 10,
  catalystFreshness: 5,
} as const;

export type PennyScoreComponentKey = keyof typeof PENNY_SCORE_WEIGHTS;

export const PENNY_SCORE_TOTAL_WEIGHT = Object.values(PENNY_SCORE_WEIGHTS).reduce(
  (sum, w) => sum + w,
  0,
);

export type PennyDataDeliveryPolicy = "near_real_time" | "documented_delayed";
