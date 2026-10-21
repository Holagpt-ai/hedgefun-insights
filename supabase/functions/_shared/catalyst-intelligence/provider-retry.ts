import { SourceFetchError, safeFetch, type SafeFetchResult } from "./source-fetch.ts";

export const MAX_PROVIDER_HTTP_ATTEMPTS = 3;
export const BASE_PROVIDER_RETRY_MS = 1_000;

export function providerRetryDelayMs(attemptIndex: number, retryAfterSeconds: number | null): number {
  const jitter = Math.floor(Math.random() * 250);
  if (retryAfterSeconds != null && retryAfterSeconds > 0) {
    return Math.min(3_600_000, retryAfterSeconds * 1000 + jitter);
  }
  return Math.min(30_000, BASE_PROVIDER_RETRY_MS * 2 ** attemptIndex + jitter);
}

function parseRetryAfterSeconds(res: Response): number | null {
  const header = res.headers.get("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const dateMs = Date.parse(header);
  if (Number.isFinite(dateMs)) {
    return Math.max(0, Math.ceil((dateMs - Date.now()) / 1000));
  }
  return null;
}

function isRetryableError(err: unknown): boolean {
  if (!(err instanceof SourceFetchError)) return false;
  if (!err.retryable) return false;
  if (err.statusCode === 401 || err.statusCode === 403 || err.statusCode === 413) return false;
  return err.statusCode === 429 || (err.statusCode != null && err.statusCode >= 500)
    || err.category === "timeout" || err.category === "network";
}

export async function safeFetchWithRetry(input: Parameters<typeof safeFetch>[0] & {
  sleepFn?: (ms: number) => Promise<void>;
  maxAttempts?: number;
}): Promise<SafeFetchResult> {
  const maxAttempts = input.maxAttempts ?? MAX_PROVIDER_HTTP_ATTEMPTS;
  const sleepFn = input.sleepFn ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  let lastError: unknown = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await safeFetch(input);
    } catch (err) {
      lastError = err;
      if (!isRetryableError(err) || attempt >= maxAttempts - 1) throw err;
      let retryAfter: number | null = null;
      if (err instanceof SourceFetchError) {
        retryAfter = err.retryAfterSeconds;
      }
      await sleepFn(providerRetryDelayMs(attempt, retryAfter));
    }
  }
  throw lastError;
}
