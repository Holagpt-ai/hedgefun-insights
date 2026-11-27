import { describe, expect, it } from "vitest";
import { resolveWatchlistRowRequestStatus } from "@/lib/watchlist-v2/watchlist-request-status";
import { resolveWatchlistRowPresentation } from "@/lib/watchlist-v2/watchlist-row-presentation";

describe("Watchlist refresh vs prior analysis integration", () => {
  it("recovery: succeeded refresh after stale prior", () => {
    const out = resolveWatchlistRowRequestStatus({
      status: "succeeded",
      error_code: null,
      requested_at: "2026-07-24T19:00:00Z",
      completed_at: "2026-07-24T19:05:00Z",
      analyzedAt: "2026-07-24T19:06:00Z",
      direction: "bullish",
      explanation: "Fresh thesis.",
      driverIds: ["driver.momentum"],
    });
    expect(out.requestStatus).toBe("succeeded");
    expect(out.priorAnalysisAvailable).toBe(true);
    expect(out.analysisFreshness).toBe("current");
    expect(
      resolveWatchlistRowPresentation({
        hasV2: true,
        direction: "bullish",
        requestStatus: out.requestStatus,
        secondaryHydrating: false,
        priorAnalysisAvailable: out.priorAnalysisAvailable,
      }),
    ).toBe("ready");
  });
});