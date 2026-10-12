/** Edge-safe copy of src/config/day-trade-freshness.config.ts */

export const DAY_TRADE_FRESHNESS_ACTIVE_MS = 30 * 60_000;
export const DAY_TRADE_FRESHNESS_RECENT_MS = 90 * 60_000;
export const DAY_TRADE_FRESHNESS_AGING_MS = 180 * 60_000;
export const DAY_TRADE_FRESHNESS_AGING_MIN_VELOCITY = 25_000;
export const DAY_TRADE_FRESHNESS_MIN_ROLLING_60S = 15_000;
export const DAY_TRADE_FRESHNESS_REACTIVATION_ACCEL_PCT = 35;
