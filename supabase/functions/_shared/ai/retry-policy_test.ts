import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  AI_MAX_TRANSPORT_ATTEMPTS,
  computeRetryDelayMs,
  shouldRetryTransportFailure,
} from "./retry-policy.ts";

Deno.test("retries transient provider failures up to max attempts", () => {
  assertEquals(
    shouldRetryTransportFailure({
      httpStatus: 529,
      outcome: "provider_error",
      attempt: 1,
      maxAttempts: AI_MAX_TRANSPORT_ATTEMPTS,
    }),
    true,
  );
  assertEquals(
    shouldRetryTransportFailure({
      httpStatus: 529,
      outcome: "provider_error",
      attempt: 2,
      maxAttempts: AI_MAX_TRANSPORT_ATTEMPTS,
    }),
    false,
  );
});

Deno.test("does not retry auth or parse failures", () => {
  assertEquals(
    shouldRetryTransportFailure({
      httpStatus: 401,
      outcome: "provider_error",
      attempt: 1,
    }),
    false,
  );
  assertEquals(
    shouldRetryTransportFailure({
      httpStatus: 200,
      outcome: "parse_error",
      attempt: 1,
    }),
    false,
  );
});

Deno.test("backoff grows with attempt index", () => {
  const first = computeRetryDelayMs(1);
  const second = computeRetryDelayMs(2);
  assertEquals(first >= 1500 && first <= 1750, true);
  assertEquals(second >= first, true);
});
