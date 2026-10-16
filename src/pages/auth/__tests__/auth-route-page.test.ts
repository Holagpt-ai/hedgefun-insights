import { describe, expect, it } from "vitest";
import { sanitizeAuthRedirectPath } from "@/lib/auth/safe-auth-redirect";

describe("sanitizeAuthRedirectPath", () => {
  it("preserves valid dashboard deep links and query strings", () => {
    expect(sanitizeAuthRedirectPath("/dashboard/screeners")).toBe(
      "/dashboard/screeners",
    );
    expect(sanitizeAuthRedirectPath("/dashboard/screeners?tab=day_trade")).toBe(
      "/dashboard/screeners?tab=day_trade",
    );
  });

  it("rejects external and protocol-relative targets", () => {
    expect(sanitizeAuthRedirectPath("https://evil.test/path")).toBe("/dashboard");
    expect(sanitizeAuthRedirectPath("//evil.test/path")).toBe("/dashboard");
  });

  it("rejects backslash-normalized open redirects", () => {
    expect(sanitizeAuthRedirectPath(String.raw`\evil.test`)).toBe("/dashboard");
    expect(sanitizeAuthRedirectPath("/dashboard\\screeners")).toBe("/dashboard");
  });

  it("blocks auth-entry redirect loops", () => {
    expect(sanitizeAuthRedirectPath("/login")).toBe("/dashboard");
    expect(sanitizeAuthRedirectPath("/login?next=/dashboard")).toBe("/dashboard");
    expect(sanitizeAuthRedirectPath("/signup")).toBe("/dashboard");
    expect(sanitizeAuthRedirectPath("/reset-password")).toBe("/dashboard");
  });

  it("defaults empty values to dashboard", () => {
    expect(sanitizeAuthRedirectPath(null)).toBe("/dashboard");
    expect(sanitizeAuthRedirectPath("")).toBe("/dashboard");
  });
});
