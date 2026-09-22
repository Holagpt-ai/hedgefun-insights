/**
 * Historical Forward Outcomes V1 — trading-session horizons and formulas.
 * Observed evidence only. Does not score, predict, or rank securities.
 */

import type { ForwardOutcomeHorizon } from "@/config/security-intelligence.config";

/** +N trading sessions after the episode session (persisted daily rows). */
export const FORWARD_OUTCOME_SESSION_HORIZONS = [
  { horizon: "D1" as const, tradingSessionsAfter: 1 },
  { horizon: "D2" as const, tradingSessionsAfter: 2 },
  { horizon: "D3" as const, tradingSessionsAfter: 3 },
  { horizon: "D5" as const, tradingSessionsAfter: 5 },
] as const satisfies readonly { horizon: ForwardOutcomeHorizon; tradingSessionsAfter: number }[];

export type ForwardOutcomeSessionHorizon = (typeof FORWARD_OUTCOME_SESSION_HORIZONS)[number]["horizon"];

export const FORWARD_OUTCOME_AVAILABILITY_STATES = [
  "AVAILABLE",
  "FUTURE_SESSION_NOT_LOADED",
  "EPISODE_TOO_RECENT",
  "INSUFFICIENT_HISTORY",
  "INVALID_EPISODE",
] as const;

export type ForwardOutcomeAvailabilityState = (typeof FORWARD_OUTCOME_AVAILABILITY_STATES)[number];

/** Reuses behavior-profile continuation threshold (same-session next-day observation). */
export { BEHAVIOR_PROFILE_DEFAULTS as FORWARD_OUTCOME_CONTINUATION_DEFAULTS } from "@/config/behavior-profile.config";

export const FORWARD_OUTCOME_FORMULA = {
  /** Close-to-close return uses episode reference close → horizon session close. */
  closeToCloseBase: "episode_reference_close",
  closeToCloseTarget: "horizon_session_close",
  /** Open-to-close on the horizon session only. */
  openToCloseBase: "horizon_session_open",
  openToCloseTarget: "horizon_session_close",
  /** Gap uses horizon session open vs prior session close (split-adjusted daily fields). */
  gapBase: "horizon_previous_close",
  gapOpen: "horizon_session_open",
  /** High/low excursion vs episode reference close. */
  excursionBase: "episode_reference_close",
  highExcursionPeak: "horizon_session_high",
  lowExcursionTrough: "horizon_session_low",
  /** Close position on horizon session OHLC range. */
  closePosition: "(close - low) / (high - low)",
  /** Zero denominator → null (never 0 as substitute for unknown). */
  zeroDenominator: "null",
  /** Daily history is treated as split-adjusted when stored; no extra adjustment in V1. */
  splitAdjustedSource: "security_daily_history",
} as const;

export const FORWARD_OUTCOME_GENERATION_DEFAULTS = {
  batchEpisodeLimit: 250,
  defaultSource: "forward_outcomes_v1",
} as const;
