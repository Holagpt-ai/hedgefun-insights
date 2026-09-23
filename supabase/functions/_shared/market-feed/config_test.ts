import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  massiveEndpointForFeedMode,
  normalizeMarketDataFeedMode,
  normalizeMarketDataProvider,
  wsUrlForFeedConfig,
  wsUrlForMassiveEndpoint,
} from "./config.ts";

Deno.test("normalizeMarketDataFeedMode defaults to auto", () => {
  assertEquals(normalizeMarketDataFeedMode(undefined), "auto");
  assertEquals(normalizeMarketDataFeedMode(undefined, "delayed"), "delayed");
  assertEquals(normalizeMarketDataFeedMode(undefined, "realtime"), "realtime");
});

Deno.test("wsUrlForMassiveEndpoint selects hosts", () => {
  assertEquals(
    wsUrlForMassiveEndpoint("delayed"),
    "wss://delayed.massive.com/stocks",
  );
  assertEquals(
    wsUrlForMassiveEndpoint("realtime"),
    "wss://socket.massive.com/stocks",
  );
});

Deno.test("massiveEndpointForFeedMode maps canonical modes", () => {
  assertEquals(massiveEndpointForFeedMode("delayed"), "delayed");
  assertEquals(massiveEndpointForFeedMode("realtime"), "realtime");
  assertEquals(massiveEndpointForFeedMode("streaming"), "realtime");
  assertEquals(massiveEndpointForFeedMode("near_realtime"), "realtime");
  assertEquals(massiveEndpointForFeedMode("auto"), "realtime");
});

Deno.test("wsUrlForFeedConfig uses active endpoint override", () => {
  assertEquals(
    wsUrlForFeedConfig({
      provider: "polygon",
      mode: "realtime",
      activeEndpoint: "delayed",
    }),
    "wss://delayed.massive.com/stocks",
  );
});

Deno.test("normalizeMarketDataProvider accepts polygon/massive alias", () => {
  assertEquals(normalizeMarketDataProvider(undefined), "polygon");
  assertEquals(normalizeMarketDataProvider("massive"), "polygon");
  assertThrows(() => normalizeMarketDataProvider("unknown"));
});
