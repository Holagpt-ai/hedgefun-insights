/**
 * Intraday Participation Intelligence V1 configuration.
 */

/** Minimum prior completed sessions required for time_adjusted_rvol. */
export const INTRADAY_PARTICIPATION_MIN_BASELINE_SESSIONS = 5;

/** Target historical sample size (upper bound from lookback). */
export const INTRADAY_PARTICIPATION_TARGET_BASELINE_SESSIONS = 20;

/** Calendar days of 5m history requested (reuses worker Polygon fetch window). */
export const INTRADAY_PARTICIPATION_LOOKBACK_CALENDAR_DAYS = 30;

/** Max symbols retained in the in-memory participation baseline cache. */
export const INTRADAY_PARTICIPATION_CACHE_MAX_SYMBOLS = 512;

/**
 * Minimum verified minute coverage in each 5m window before acceleration % is computed.
 * Prevents divide-by-near-zero from sparse/partial prior windows (not a cap on legitimate extremes).
 */
export const VOLUME_ACCEL_MIN_COVERED_MINUTES = 4;

/**
 * Minimum second-level observations in a calendar minute before that minute counts
 * toward window coverage (prevents isolated ticks from masquerading as full minutes).
 */
export const VOLUME_WINDOW_MIN_BARS_PER_MINUTE = 30;

/** Participation state thresholds (volume_acceleration_pct vs prior 5m window). */
export const PARTICIPATION_ACCEL_COOLING_MAX = -20;
export const PARTICIPATION_ACCEL_STEADY_MAX = 20;
export const PARTICIPATION_ACCEL_RISING_MAX = 50;
export const PARTICIPATION_ACCEL_SURGING_MAX = 100;

export const PARTICIPATION_STATES = [
  "SURGING",
  "RISING",
  "STEADY",
  "COOLING",
  "UNAVAILABLE",
] as const;

export type ParticipationState = (typeof PARTICIPATION_STATES)[number];

export const INTRADAY_PARTICIPATION_CACHE_VERSION = "v1" as const;
