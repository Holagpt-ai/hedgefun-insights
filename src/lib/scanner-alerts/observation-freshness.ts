export const SCANNER_ALERT_TOAST_LOOKBACK_MS = 6 * 3600_000;

/** Tolerate minor clock skew between client and observation source. */
export const SCANNER_ALERT_MAX_FUTURE_SKEW_MS = 5 * 60_000;

export function parseObservationMs(iso: string | null | undefined): number {
  return Date.parse(iso ?? "");
}

export function isPlausibleScannerAlertObservationMs(
  observationMs: number,
  nowMs: number,
): boolean {
  if (!Number.isFinite(observationMs)) return false;
  if (observationMs > nowMs + SCANNER_ALERT_MAX_FUTURE_SKEW_MS) return false;
  if (nowMs - observationMs > SCANNER_ALERT_TOAST_LOOKBACK_MS) return false;
  return true;
}
