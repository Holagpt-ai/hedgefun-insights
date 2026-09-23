import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  computeLatencyMs,
  deriveMarketFeedDisplayTier,
  isFeedMessageStale,
  marketFeedDisplayLabel,
} from "./telemetry.ts";

Deno.test("computeLatencyMs is received minus market timestamp", () => {
  assertEquals(computeLatencyMs(1_000, 4_500), 3_500);
  assertEquals(computeLatencyMs(null, 4_500), null);
  assertEquals(computeLatencyMs(5_000, 4_000), null);
});

Deno.test("isFeedMessageStale respects threshold", () => {
  assertEquals(isFeedMessageStale(1_000, 150_000, 120_000), true);
  assertEquals(isFeedMessageStale(100_000, 150_000, 120_000), false);
  assertEquals(isFeedMessageStale(null, 150_000), true);
});

Deno.test("deriveMarketFeedDisplayTier delayed mode and latency", () => {
  const now = Date.parse("2026-09-23T18:00:00.000Z");
  assertEquals(
    deriveMarketFeedDisplayTier({
      feed_mode: "delayed",
      connection_state: "subscribed",
      stale: false,
      latency_ms: 900_000,
      last_message_at: "2026-09-23T17:59:59.000Z",
    }, now),
    "delayed",
  );
  assertEquals(
    deriveMarketFeedDisplayTier({
      feed_mode: "realtime",
      connection_state: "subscribed",
      stale: false,
      latency_ms: 2_000,
      last_message_at: "2026-09-23T17:59:59.000Z",
    }, now),
    "streaming",
  );
  assertEquals(
    deriveMarketFeedDisplayTier({
      feed_mode: "realtime",
      connection_state: "subscribed",
      stale: true,
      latency_ms: 1_000,
    }, now),
    "stale",
  );
  assertEquals(marketFeedDisplayLabel("streaming"), "Streaming");
});
