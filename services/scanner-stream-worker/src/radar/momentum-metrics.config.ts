/** Completed 5-minute interval length used for velocity / RVOL windows. */
export const MOMENTUM_WINDOW_5M_MS = 5 * 60_000;

/** Minimum prior regular-session days with data in the same TOD bucket. */
export const RVOL_5M_MIN_TOD_SAMPLES = 5;

/** Calendar days of 5-minute history requested from the provider (upper bound). */
export const RVOL_5M_LOOKBACK_CALENDAR_DAYS = 30;

/** Max concurrent Polygon history fetches for TOD baselines. */
export const RVOL_5M_FETCH_CONCURRENCY = 4;

/** One history request cannot hold a worker slot indefinitely. */
export const RVOL_5M_FETCH_TIMEOUT_MS = 8_000;

/** Provider failure stays a missing baseline, then may be retried. */
export const RVOL_5M_FAILURE_BACKOFF_MS = 30_000;
