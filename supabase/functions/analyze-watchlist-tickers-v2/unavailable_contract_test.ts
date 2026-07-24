// Regression: W2-P6-R4 — data_unavailable contract.
// direction=data_unavailable must never carry AI drivers or market signals.

import { assertEquals } from "https://deno.land/std@0.203.0/assert/mod.ts";
import { sanitizeUnavailableEvidence } from "./index.ts";
import type { MarketSignal } from "../_shared/watchlist-v2/contract.ts";

const sig: MarketSignal = {
  signal_id: "sig.a",
  label: "Above VWAP",
  category: "level",
  kind: "state",
  direction: "bullish",
  facts: {},
  inputs: ["vwap"],
  observed_at: "2026-07-24T19:00:00Z",
  rule_version: "w2b1c.1",
};


Deno.test("data_unavailable strips drivers and market signals", () => {
  const out = sanitizeUnavailableEvidence({
    direction: "data_unavailable",
    driverIds: ["driver.trend_up", "driver.vwap_reclaim"],
    marketSignals: [sig],
  });
  assertEquals(out.driverIds, []);
  assertEquals(out.marketSignals, []);
});

Deno.test("data_unavailable strips even when only signals present", () => {
  const out = sanitizeUnavailableEvidence({
    direction: "data_unavailable",
    driverIds: [],
    marketSignals: [sig, { ...sig, signal_id: "sig.b" }],
  });
  assertEquals(out.marketSignals.length, 0);
});

Deno.test("directional read preserves drivers and market signals", () => {
  const out = sanitizeUnavailableEvidence({
    direction: "bullish",
    driverIds: ["driver.trend_up"],
    marketSignals: [sig],
  });
  assertEquals(out.driverIds, ["driver.trend_up"]);
  assertEquals(out.marketSignals.length, 1);
});

Deno.test("neutral read preserves evidence", () => {
  const out = sanitizeUnavailableEvidence({
    direction: "neutral",
    driverIds: ["driver.range"],
    marketSignals: [sig],
  });
  assertEquals(out.driverIds.length, 1);
  assertEquals(out.marketSignals.length, 1);
});
