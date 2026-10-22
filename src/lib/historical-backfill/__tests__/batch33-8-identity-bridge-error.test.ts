import { describe, expect, it } from "vitest";
import { RetryableBridgeError } from "@/lib/persistence/historical-bridge-client";
import {
  IdentityResolutionPersistenceError,
  sanitizeIdentityPersistenceError,
} from "@/lib/historical-backfill/production-rollout";

describe("batch 33.8 identity bridge errors", () => {
  it("surfaces bridge retry exhaustion with HTTP status in sanitized logs", () => {
    const wrapped = new IdentityResolutionPersistenceError(new RetryableBridgeError(504), {
      stage: "initial_resolve",
      symbol: "CPS",
    });
    expect(sanitizeIdentityPersistenceError(wrapped.cause)).toEqual({
      errorCode: "bridge_retry_exhausted",
      constraintName: null,
      errorMessage: "bridge_retry_exhausted status=504",
    });
  });
});
