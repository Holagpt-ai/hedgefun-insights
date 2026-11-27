import { describe, expect, it } from "vitest";
import { shouldApplyRadarHistoricalFailureState } from "@/lib/radar/radar-historical-enrichment-guards";
import type { RadarRepeatMoversView } from "@/lib/radar/radar-repeat-movers-types";

describe("radar historical enrichment guards", () => {
  const ready = {
    status: "ready" as const,
    view: { rows: [] } as unknown as RadarRepeatMoversView,
  };

  it("rejects obsolete poll generation failures", () => {
    expect(
      shouldApplyRadarHistoricalFailureState({
        cancelled: false,
        tabId: "day_trade_radar",
        expectedTabId: "day_trade_radar",
        pollGeneration: 1,
        activePollGeneration: 2,
        repeatMoversLoadState: { status: "loading" },
      }),
    ).toBe(false);
  });

  it("does not overwrite a newer successful enrichment", () => {
    expect(
      shouldApplyRadarHistoricalFailureState({
        cancelled: false,
        tabId: "day_trade_radar",
        expectedTabId: "day_trade_radar",
        pollGeneration: 2,
        activePollGeneration: 2,
        repeatMoversLoadState: ready,
      }),
    ).toBe(false);
  });

  it("allows terminal failure for the active generation when not ready", () => {
    expect(
      shouldApplyRadarHistoricalFailureState({
        cancelled: false,
        tabId: "day_trade_radar",
        expectedTabId: "day_trade_radar",
        pollGeneration: 3,
        activePollGeneration: 3,
        repeatMoversLoadState: { status: "loading" },
      }),
    ).toBe(true);
  });
});