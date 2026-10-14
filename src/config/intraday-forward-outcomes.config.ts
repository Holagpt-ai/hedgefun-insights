/**
 * Post-momentum intraday forward outcomes — observed bar windows after episode reference time.
 * Evidence only; computed from minute bars available at reconstruction time.
 */

export const INTRADAY_FORWARD_OUTCOME_MINUTE_HORIZONS = [5, 15, 30, 60] as const;

export type IntradayForwardOutcomeMinuteHorizon =
  (typeof INTRADAY_FORWARD_OUTCOME_MINUTE_HORIZONS)[number];

export const INTRADAY_FORWARD_OUTCOME_HORIZONS = [
  ...INTRADAY_FORWARD_OUTCOME_MINUTE_HORIZONS,
  "SESSION_CLOSE",
] as const;

export type IntradayForwardOutcomeHorizon =
  (typeof INTRADAY_FORWARD_OUTCOME_HORIZONS)[number];

export const INTRADAY_FORWARD_AVAILABILITY_STATES = [
  "AVAILABLE",
  "PARTIAL_WINDOW",
  "INSUFFICIENT_BARS",
  "INVALID_REFERENCE",
] as const;

export type IntradayForwardAvailabilityState =
  (typeof INTRADAY_FORWARD_AVAILABILITY_STATES)[number];

/** Minimum move (%) to treat end-of-window as continuation for POSITIVE / NEGATIVE episodes. */
export const INTRADAY_FORWARD_CONTINUATION_MIN_MOVE_PCT = 0.5;
