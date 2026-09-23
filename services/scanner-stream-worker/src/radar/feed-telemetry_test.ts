import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createFeedTelemetryTracker } from "./feed-telemetry.ts";

Deno.test("feed telemetry tracks latency and stale on disconnect", () => {
  const tracker = createFeedTelemetryTracker({
    provider: "polygon",
    configuredFeedMode: "delayed",
    messageStaleMs: 10_000,
  });
  tracker.setConnectionState("subscribed");
  tracker.noteMarketMessage(1_000_000, 1_900_000);
  const snap = tracker.snapshot(1_900_500);
  assertEquals(snap.latency_ms, 900_000);
  assertEquals(snap.feed_mode, "delayed");
  assertEquals(snap.stale, false);
  tracker.setConnectionState("disconnected");
  assertEquals(tracker.snapshot(2_000_000).stale, true);
});
