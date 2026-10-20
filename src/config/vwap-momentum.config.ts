/**
 * VWAP momentum detection thresholds (Batch 28).
 * Used by scanner event qualification — no unexplained magic numbers in handlers.
 */

/** Minimum short-window move (percent) to confirm reclaim / hold participation. */
export const VWAP_RECLAIM_MIN_MOVE15_PCT = 0.1;

/** Minimum 60s volume to qualify VWAP loss / breakdown. */
export const VWAP_LOSS_MIN_VOL60S = 40_000;

/** Minimum negative 60s move (percent) to treat VWAP loss as breakdown with follow-through. */
export const VWAP_BREAKDOWN_MIN_MOVE60_PCT = -0.15;

/**
 * Rejection: reclaim then loss within this window (ms) while price ends below VWAP.
 */
export const VWAP_REJECTION_SEQUENCE_WINDOW_MS = 120_000;

/** Hold: minimum time above VWAP after last reclaim before HOLD signal (ms). */
export const VWAP_HOLD_MIN_DURATION_MS = 180_000;

/** Pulse window for transition timestamps (aligns with scanner transitionPulseMs default). */
export const VWAP_TRANSITION_PULSE_MS = 15_000;
