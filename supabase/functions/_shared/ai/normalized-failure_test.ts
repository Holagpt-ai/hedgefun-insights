import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  classifyHttpFailure,
  isRetryableAiFailure,
} from "./normalized-failure.ts";

Deno.test("maps timeout, 5xx, auth, and malformed responses", () => {
  assertEquals(classifyHttpFailure({ httpStatus: null, timedOut: true }), "TIMEOUT");
  assertEquals(classifyHttpFailure({ httpStatus: 529 }), "PROVIDER_5XX");
  assertEquals(classifyHttpFailure({ httpStatus: 500 }), "PROVIDER_5XX");
  assertEquals(classifyHttpFailure({ httpStatus: 429 }), "RATE_LIMIT");
  assertEquals(classifyHttpFailure({ httpStatus: 401 }), "AUTH");
  assertEquals(classifyHttpFailure({ httpStatus: 200, malformed: true }), "MALFORMED_RESPONSE");
  assertEquals(classifyHttpFailure({ httpStatus: 200, schemaInvalid: true }), "SCHEMA_VALIDATION");
});

Deno.test("retries only timeout, rate limit, and provider 5xx", () => {
  assertEquals(isRetryableAiFailure("TIMEOUT"), true);
  assertEquals(isRetryableAiFailure("PROVIDER_5XX"), true);
  assertEquals(isRetryableAiFailure("RATE_LIMIT"), true);
  assertEquals(isRetryableAiFailure("AUTH"), false);
  assertEquals(isRetryableAiFailure("MALFORMED_RESPONSE"), false);
  assertEquals(isRetryableAiFailure("INSUFFICIENT_EVIDENCE"), false);
  assertEquals(isRetryableAiFailure("COST_GUARD"), false);
});
