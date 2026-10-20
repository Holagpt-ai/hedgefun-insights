import { describe, expect, it, vi } from "vitest";
import { resolveRadarHistoricalContextAccessToken } from "@/lib/radar/radar-historical-context-access";

describe("resolveRadarHistoricalContextAccessToken", () => {
  it("prefers signed-in session token", () => {
    expect(resolveRadarHistoricalContextAccessToken("user-jwt-token")).toBe("user-jwt-token");
  });

  it("falls back to publishable then legacy anon env", () => {
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "publishable-jwt");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "legacy-anon-jwt");
    expect(resolveRadarHistoricalContextAccessToken(undefined)).toBe("publishable-jwt");
    vi.unstubAllEnvs();
  });

  it("returns null when no credentials configured", () => {
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
    expect(resolveRadarHistoricalContextAccessToken(null)).toBeNull();
    vi.unstubAllEnvs();
  });
});
