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
 * Minimum wall-clock span between earliest and latest bar in a 5m window before
 * acceleration % is computed (guards fragmented/partial history, not low trade frequency).
 */
export const VOLUME_ACCEL_MIN_OBSERVATION_SPAN_MINUTES = 4;

/**
 * Max silence between window open and first bar before the prior/current 5m window
 * is treated as missing feed history (Polygon omits no-trade seconds; silence here
 * indicates late join, not illiquidity).
 */
export const VOLUME_ACCEL_MAX_LEADING_SILENCE_MS = 60_000;

/**
 * Minimum total share volume in the prior 5m window before acceleration % is shown.
 * Guards two-point / near-zero priors (not intermittent trading with meaningful baseline).
 */
export const VOLUME_ACCEL_MIN_PRIOR_WINDOW_TOTAL_VOLUME = 100;

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
