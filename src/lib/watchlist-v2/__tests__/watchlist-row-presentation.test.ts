import { describe, expect, it } from "vitest";
import {
  resolveWatchlistRowPresentation,
  watchlistPresentationBadgeLabel,
} from "@/lib/watchlist-v2/watchlist-row-presentation";

describe("resolveWatchlistRowPresentation", () => {
  it("shows loading while secondary queries hydrate without a V2 row", () => {
    expect(
      resolveWatchlistRowPresentation({
        hasV2: false,
        direction: "data_unavailable",
        requestStatus: "none",
        secondaryHydrating: true,
      }),
    ).toBe("loading_analysis");
    expect(watchlistPresentationBadgeLabel("loading_analysis")).toMatch(/Loading analysis/i);
  });

  it("distinguishes pending queue from provider-unavailable analysis", () => {
    expect(
      resolveWatchlistRowPresentation({
        hasV2: false,
        direction: "data_unavailable",
        requestStatus: "pending",
        secondaryHydrating: false,
      }),
    ).toBe("analysis_pending");
    expect(
      resolveWatchlistRowPresentation({
        hasV2: true,
        direction: "data_unavailable",
        requestStatus: "none",
        secondaryHydrating: false,
      }),
    ).toBe("provider_unavailable");
  });

  it("marks analysis failures and awaiting-first states", () => {
    expect(
      resolveWatchlistRowPresentation({
        hasV2: false,
        direction: "data_unavailable",
        requestStatus: "failed",
        secondaryHydrating: false,
      }),
    ).toBe("analysis_failed");
    expect(
      resolveWatchlistRowPresentation({
        hasV2: false,
        direction: "data_unavailable",
        requestStatus: "none",
        secondaryHydrating: false,
      }),
    ).toBe("awaiting_first_analysis");
  });
});