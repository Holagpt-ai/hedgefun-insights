/**
 * Day Trade qualification lifecycle (Scanner V42).
 * Grace requires consecutive distinct valid failed evaluations in market-data time.
 */

/** Valid pillar failures required before verified expiration. */
export const DAY_TRADE_QUALIFICATION_GRACE_REQUIRED_FAILURES = 2;

/** Minimum spacing between grace failures (market-data clock). */
export const DAY_TRADE_QUALIFICATION_GRACE_MIN_MS = 60_000;

/** Dedupe window for identical provider snapshots (receive-time guard). */
export const DAY_TRADE_QUALIFICATION_SNAPSHOT_DEDUPE_MS = 1_000;
