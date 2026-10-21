export const MAX_PROVIDER_HTTP_ATTEMPTS = 3;
export const BASE_PROVIDER_RETRY_MS = 1_000;
/** Longer waits must use source `backoff_until` / poll scheduling — not Edge sleep. */
export const MAX_INLINE_PROVIDER_RETRY_SLEEP_MS = 10_000;

export function parseRetryAfterSeconds(header: string | null, nowMs = Date.now()): number | null {
  if (!header?.trim()) return null;
  const trimmed = header.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds) : null;
  }
  const dateMs = Date.parse(trimmed);
  if (!Number.isFinite(dateMs)) return null;
  return Math.max(0, Math.ceil((dateMs - nowMs) / 1000));
}

export function providerRetryDelayMs(attemptIndex: number, retryAfterSeconds: number | null): number {
  const jitter = Math.floor(Math.random() * 250);
  if (retryAfterSeconds != null && retryAfterSeconds > 0) {
    return Math.min(MAX_INLINE_PROVIDER_RETRY_SLEEP_MS, retryAfterSeconds * 1000 + jitter);
  }
  return Math.min(MAX_INLINE_PROVIDER_RETRY_SLEEP_MS, BASE_PROVIDER_RETRY_MS * 2 ** attemptIndex + jitter);
}

export function shouldDeferProviderRetryToBackoff(retryAfterSeconds: number | null): boolean {
  if (retryAfterSeconds == null || retryAfterSeconds <= 0) return false;
  return retryAfterSeconds * 1000 > MAX_INLINE_PROVIDER_RETRY_SLEEP_MS;
}
