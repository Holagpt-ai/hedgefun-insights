import { describe, expect, it } from "vitest";
import {
  computeLatencyMs,
  deriveMarketFeedDisplayTier,
  formatSubSecondAge,
  marketFeedDisplayLabel,
} from "../telemetry";

describe("market feed telemetry", () => {
  it("computes latency from timestamps", () => {
    expect(computeLatencyMs(1_000, 4_000)).toBe(3_000);
  });

  it("labels streaming vs delayed from telemetry", () => {
    const now = Date.parse("2026-09-23T18:00:00.000Z");
    expect(
      deriveMarketFeedDisplayTier({
        feed_mode: "realtime",
        connection_state: "subscribed",
        stale: false,
        latency_ms: 1_500,
        last_message_at: "2026-09-23T17:59:59.500Z",
      }, now),
    ).toBe("streaming");
    expect(
      deriveMarketFeedDisplayTier({
        feed_mode: "delayed",
        connection_state: "subscribed",
        stale: false,
        latency_ms: 900_000,
      }, now),
    ).toBe("delayed");
    expect(marketFeedDisplayLabel("near_realtime")).toBe("Near real-time");
  });

  it("formatSubSecondAge shows sub-minute precision", () => {
    const now = Date.parse("2026-09-23T18:00:02.000Z");
    expect(formatSubSecondAge("2026-09-23T18:00:01.200Z", now)).toBe("<1s ago");
    expect(formatSubSecondAge("2026-09-23T17:59:59.000Z", now)).toBe("3s ago");
  });
});
