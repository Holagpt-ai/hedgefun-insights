/** Supabase query / durable history retention (unchanged). */
export const SCANNER_ALERT_TOAST_LOOKBACK_MS = 6 * 3600_000;

/** Supported delayed-feed allowance plus polling/transport grace for live popups only. */
export const DELAYED_MARKET_OBSERVATION_ALLOWANCE_MS = 15 * 60_000;
export const LIVE_POPUP_TRANSPORT_GRACE_MS = 20 * 60_000;
export const SCANNER_ALERT_LIVE_POPUP_MAX_AGE_MS =
  DELAYED_MARKET_OBSERVATION_ALLOWANCE_MS + LIVE_POPUP_TRANSPORT_GRACE_MS;

/** Tolerate minor clock skew between client and observation source. */
export const SCANNER_ALERT_MAX_FUTURE_SKEW_MS = 5 * 60_000;

export function parseObservationMs(iso: string | null | undefined): number {
  return Date.parse(iso ?? "");
}

export function isValidScannerAlertObservationMs(
  observationMs: number,
  nowMs: number,
): boolean {
  if (!Number.isFinite(observationMs)) return false;
  if (observationMs > nowMs + SCANNER_ALERT_MAX_FUTURE_SKEW_MS) return false;
  return true;
}

/** Within the dashboard fetch window (6h); not used for live popup eligibility. */
export function isWithinScannerQueryLookbackMs(
  observationMs: number,
  nowMs: number,
): boolean {
  if (!isValidScannerAlertObservationMs(observationMs, nowMs)) return false;
  return nowMs - observationMs <= SCANNER_ALERT_TOAST_LOOKBACK_MS;
}

/** Fresh enough to show as a live popup (separate from query lookback). */
export function isWithinScannerLivePopupAgeMs(
  observationMs: number,
  nowMs: number,
): boolean {
  if (!isValidScannerAlertObservationMs(observationMs, nowMs)) return false;
  return nowMs - observationMs <= SCANNER_ALERT_LIVE_POPUP_MAX_AGE_MS;
}

/** @deprecated Use isValid + live/query helpers; kept for existing imports. */
export function isPlausibleScannerAlertObservationMs(
  observationMs: number,
  nowMs: number,
): boolean {
  return isWithinScannerQueryLookbackMs(observationMs, nowMs);
}
