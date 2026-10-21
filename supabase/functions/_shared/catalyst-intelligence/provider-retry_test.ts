import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { SourceFetchError } from "./source-fetch.ts";
import {
  MAX_INLINE_PROVIDER_RETRY_SLEEP_MS,
  MAX_PROVIDER_HTTP_ATTEMPTS,
  parseRetryAfterSeconds,
  providerRetryDelayMs,
  shouldDeferProviderRetryToBackoff,
} from "./retry-after-policy.ts";
import { isRetryableProviderError, safeFetchWithRetry } from "./provider-retry.ts";

Deno.test("parseRetryAfterSeconds supports numeric seconds", () => {
  assertEquals(parseRetryAfterSeconds("120", 0), 120);
  assertEquals(parseRetryAfterSeconds("3.5", 0), 4);
});

Deno.test("parseRetryAfterSeconds supports HTTP-date", () => {
  const now = Date.parse("2026-09-22T15:00:00.000Z");
  const header = new Date(now + 45_000).toUTCString();
  assertEquals(parseRetryAfterSeconds(header, now), 45);
});

Deno.test("long Retry-After defers to backoff instead of inline sleep", () => {
  assertEquals(shouldDeferProviderRetryToBackoff(600), true);
  assertEquals(shouldDeferProviderRetryToBackoff(5), false);
  const delay = providerRetryDelayMs(0, 600);
  assertEquals(delay <= MAX_INLINE_PROVIDER_RETRY_SLEEP_MS, true);
});

Deno.test("429 retries inline for short Retry-After within attempt budget", async () => {
  let calls = 0;
  const sleeps: number[] = [];
  await assertRejects(
    () => safeFetchWithRetry({
      url: "https://example.com/feed",
      userAgent: "test",
      maxAttempts: MAX_PROVIDER_HTTP_ATTEMPTS,
      nowMs: 1_000,
      sleepFn: async (ms) => {
        sleeps.push(ms);
      },
      fetchImpl: async () => {
        calls += 1;
        const err = new SourceFetchError("upstream", 429, true);
        err.retryAfterSeconds = 2;
        throw err;
      },
    }),
    SourceFetchError,
  );
  assertEquals(calls, MAX_PROVIDER_HTTP_ATTEMPTS);
  assertEquals(sleeps.length, MAX_PROVIDER_HTTP_ATTEMPTS - 1);
});

Deno.test("429 with long Retry-After does not sleep inside invocation", async () => {
  let calls = 0;
  const sleeps: number[] = [];
  await assertRejects(
    () => safeFetchWithRetry({
      url: "https://example.com/feed",
      userAgent: "test",
      nowMs: 1_000,
      sleepFn: async (ms) => {
        sleeps.push(ms);
      },
      fetchImpl: async () => {
        calls += 1;
        const err = new SourceFetchError("upstream", 429, true);
        err.retryAfterSeconds = 900;
        throw err;
      },
    }),
    SourceFetchError,
  );
  assertEquals(calls, 1);
  assertEquals(sleeps.length, 0);
});

Deno.test("5xx retries with bounded attempts", async () => {
  let calls = 0;
  await assertRejects(
    () => safeFetchWithRetry({
      url: "https://example.com/feed",
      userAgent: "test",
      maxAttempts: MAX_PROVIDER_HTTP_ATTEMPTS,
      fetchImpl: async () => {
        calls += 1;
        throw new SourceFetchError("upstream", 503, true);
      },
    }),
    SourceFetchError,
  );
  assertEquals(calls, MAX_PROVIDER_HTTP_ATTEMPTS);
});

Deno.test("401 is not retryable", () => {
  const err = new SourceFetchError("upstream", 401, false);
  assertEquals(isRetryableProviderError(err), false);
});
