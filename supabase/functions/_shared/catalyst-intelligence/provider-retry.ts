import {
  MAX_PROVIDER_HTTP_ATTEMPTS,
  providerRetryDelayMs,
  shouldDeferProviderRetryToBackoff,
} from "./retry-after-policy.ts";
import { SourceFetchError, safeFetch, type SafeFetchResult } from "./source-fetch.ts";

export {
  MAX_INLINE_PROVIDER_RETRY_SLEEP_MS,
  MAX_PROVIDER_HTTP_ATTEMPTS,
  parseRetryAfterSeconds,
  providerRetryDelayMs,
  shouldDeferProviderRetryToBackoff,
} from "./retry-after-policy.ts";

export function isRetryableProviderError(err: unknown): boolean {
  if (!(err instanceof SourceFetchError)) return false;
  if (!err.retryable) return false;
  if (err.statusCode === 401 || err.statusCode === 403 || err.statusCode === 413) return false;
  return err.statusCode === 429 || (err.statusCode != null && err.statusCode >= 500)
    || err.category === "timeout" || err.category === "network";
}

export async function safeFetchWithRetry(input: Parameters<typeof safeFetch>[0] & {
  sleepFn?: (ms: number) => Promise<void>;
  maxAttempts?: number;
  nowMs?: number;
}): Promise<SafeFetchResult> {
  const maxAttempts = input.maxAttempts ?? MAX_PROVIDER_HTTP_ATTEMPTS;
  const sleepFn = input.sleepFn ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const nowMs = input.nowMs ?? Date.now();
  let lastError: unknown = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await safeFetch({ ...input, nowMs });
    } catch (err) {
      lastError = err;
      if (!isRetryableProviderError(err) || attempt >= maxAttempts - 1) throw err;
      const retryAfter = err instanceof SourceFetchError ? err.retryAfterSeconds : null;
      if (shouldDeferProviderRetryToBackoff(retryAfter)) {
        throw err;
      }
      await sleepFn(providerRetryDelayMs(attempt, retryAfter));
    }
  }
  throw lastError;
}
