import { describe, expect, it } from "vitest";
import { sanitizeIdentityPersistenceError } from "@/lib/historical-backfill/production-rollout";

describe("sanitizeIdentityPersistenceError", () => {
  it("redacts bearer tokens and surfaces constraint names", () => {
    const sanitized = sanitizeIdentityPersistenceError(
      new Error('duplicate key violates unique constraint "security_symbol_history_one_open_idx" Bearer sk-secret'),
    );
    expect(sanitized.constraintName).toBe("security_symbol_history_one_open_idx");
    expect(sanitized.errorMessage).toContain("[redacted]");
    expect(sanitized.errorMessage).not.toContain("sk-secret");
  });

  it("reads postgres error fields when present", () => {
    const sanitized = sanitizeIdentityPersistenceError({
      code: "23505",
      constraint: "security_symbol_history_one_open_idx",
      message: "duplicate key value violates unique constraint",
    });
    expect(sanitized.errorCode).toBe("23505");
    expect(sanitized.constraintName).toBe("security_symbol_history_one_open_idx");
  });
});
