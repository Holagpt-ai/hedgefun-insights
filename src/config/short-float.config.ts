/**
 * Short Float V1 configuration.
 *
 * Provider-neutral fundamentals model. Does not affect Discovery Rank,
 * Trade Quality weights, filters, Trigger Time, or live screener execution.
 *
 * Freshness is calendar-day based in V1. `SHORT_FLOAT_FRESHNESS_BASIS` exists
 * so a later sprint can switch to trading-day age without changing consumer fields.
 */

export const SHORT_FLOAT_MODEL_VERSION = "v1" as const;
export type ShortFloatModelVersion = typeof SHORT_FLOAT_MODEL_VERSION;

export const SHORT_FLOAT_VALUE_SOURCES = ["PROVIDER", "DERIVED"] as const;
export type ShortFloatValueSource = (typeof SHORT_FLOAT_VALUE_SOURCES)[number];

export const SHORT_FLOAT_QUALITY_STATES = [
  "VALID",
  "DISCREPANCY",
  "PARTIAL",
  "UNAVAILABLE",
  "INVALID",
] as const;
export type ShortFloatQualityState = (typeof SHORT_FLOAT_QUALITY_STATES)[number];

export const SHORT_FLOAT_FRESHNESS_STATES = ["FRESH", "AGING", "STALE", "UNKNOWN"] as const;
export type ShortFloatFreshnessState = (typeof SHORT_FLOAT_FRESHNESS_STATES)[number];

/** V1 uses UTC calendar days. Future: "trading-day". */
export const SHORT_FLOAT_FRESHNESS_BASIS = "calendar-day" as const;
export type ShortFloatFreshnessBasis = typeof SHORT_FLOAT_FRESHNESS_BASIS | "trading-day";

/** Absolute percentage-point tolerance between provider and derived short float. */
export const SHORT_FLOAT_DISCREPANCY_TOLERANCE_PCT = 2;

/** Inclusive calendar-day ceilings. Age is computed from sourceAsOf, not fetchedAt. */
export const SHORT_FLOAT_FRESH_MAX_CALENDAR_DAYS = 10;
export const SHORT_FLOAT_AGING_MAX_CALENDAR_DAYS = 20;

/** sourceAsOf later than evaluatedAt by more than this is treated as INVALID. */
export const SHORT_FLOAT_FUTURE_CLOCK_SKEW_MS = 15 * 60 * 1000;

export const SHORT_FLOAT_STALE_USABLE_FOR_SCORING = false;
export const SHORT_FLOAT_AGING_USABLE_FOR_SCORING = true;
export const SHORT_FLOAT_UNKNOWN_FRESHNESS_USABLE_FOR_SCORING = false;

export const SHORT_FLOAT_MS_PER_CALENDAR_DAY = 24 * 60 * 60 * 1000;

/** Reserved contextual bands. Not applied by the V1 normalizer. */
export const SHORT_FLOAT_CONTEXT_TIERS = {
  LOW: { maxExclusive: 10 },
  MODERATE: { maxExclusive: 20 },
  ELEVATED: { maxExclusive: 30 },
  HIGH: { maxExclusive: null },
} as const;
