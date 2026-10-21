import { describe, expect, it } from "vitest";
import { authGatedHref, buildLoginPath, currentReturnPath } from "@/lib/auth/auth-return-url";
import { sanitizeAuthRedirectPath as sanitizeCore } from "@/lib/auth/safe-auth-redirect";

describe("auth return url helpers", () => {
  it("preserves dashboard deep links through login", () => {
    const dest = "/dashboard/catalyst?symbol=AAPL";
    expect(buildLoginPath(dest)).toBe(`/login?next=${encodeURIComponent(dest)}`);
    expect(authGatedHref(dest, false)).toBe(buildLoginPath(dest));
    expect(authGatedHref(dest, true)).toBe(dest);
  });

  it("sanitizes external and auth-loop paths", () => {
    expect(sanitizeCore("https://evil.test/x")).toBe("/dashboard");
    expect(buildLoginPath("/login")).toBe("/login?next=%2Fdashboard");
  });

  it("builds return path from router location", () => {
    expect(currentReturnPath({ pathname: "/dashboard/watchlist", search: "?symbol=MSFT" }))
      .toBe("/dashboard/watchlist?symbol=MSFT");
  });
});
