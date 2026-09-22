/**
 * Deep Intraday Reconstruction V1 — deterministic evidence only.
 */

export const INTRADAY_RECONSTRUCTION_VERSION = "v1" as const;

export const INTRADAY_RECONSTRUCTION_TIERS = ["SIGNIFICANT", "EXTREME"] as const;

export const INTRADAY_COMPLETENESS_STATES = [
  "COMPLETE",
  "PARTIAL",
  "DAILY_ONLY",
  "UNAVAILABLE",
] as const;
export type IntradayCompletenessState = (typeof INTRADAY_COMPLETENESS_STATES)[number];

export const INTRADAY_BAR_GRANULARITIES = ["1m", "5m"] as const;
export type IntradayBarGranularity = (typeof INTRADAY_BAR_GRANULARITIES)[number];

/** Regular session 09:30–16:00 ET = 390 one-minute bars. */
export const REGULAR_SESSION_MINUTE_BARS_EXPECTED = 390;

/** Complete when regular-session bar coverage meets this ratio. */
export const INTRADAY_COMPLETE_COVERAGE_RATIO = 0.95;

/** Pullback leg: drawdown from running high vs session range. */
export const INTRADAY_MAJOR_PULLBACK_MIN_PCT = 0.03;

/** First major move: |bar close-open| / session open >= threshold. */
export const INTRADAY_FIRST_MAJOR_MOVE_MIN_PCT = 0.015;

/** Volume burst: bar volume >= multiplier × median regular-session bar volume. */
export const INTRADAY_VOLUME_BURST_MULTIPLIER = 3;

export const INTRADAY_HOD_SESSION_PHASES = ["EARLY", "MID", "LATE"] as const;
export type IntradayHodSessionPhase = (typeof INTRADAY_HOD_SESSION_PHASES)[number];

export const INTRADAY_RECONSTRUCTION_SOURCE = "polygon-aggregates-minute-v1";
