/** Day Trade desk freshness bands (ms). Central tuning for V1.3 decay. */

export const DAY_TRADE_FRESHNESS_ACTIVE_MS = 30 * 60_000;
export const DAY_TRADE_FRESHNESS_RECENT_MS = 90 * 60_000;
export const DAY_TRADE_FRESHNESS_AGING_MS = 180 * 60_000;

/** Minimum velocity (shares/min) to treat AGING names as still actionable. */
export const DAY_TRADE_FRESHNESS_AGING_MIN_VELOCITY = 25_000;

/** Minimum 60s rolling volume for AGING / reactivation evidence. */
export const DAY_TRADE_FRESHNESS_MIN_ROLLING_60S = 15_000;

/** Acceleration % that indicates live participation for reactivation. */
export const DAY_TRADE_FRESHNESS_REACTIVATION_ACCEL_PCT = 35;
