/**
 * Day Trade qualification lifecycle (Scanner V42 / V42.1).
 */

/** Valid pillar failures required before verified expiration. */
export const DAY_TRADE_QUALIFICATION_GRACE_REQUIRED_FAILURES = 2;

/** Minimum spacing between grace failures (market-data clock). */
export const DAY_TRADE_QUALIFICATION_GRACE_MIN_MS = 60_000;

/** Max off-cap monitoring symbols refreshed per screener sync tick. */
export const DAY_TRADE_MONITORING_REFRESH_BATCH_SIZE = 25;

/** Minimum ms between monitoring-only provider refresh attempts per symbol. */
export const DAY_TRADE_MONITORING_REFRESH_MIN_INTERVAL_MS = 120_000;
