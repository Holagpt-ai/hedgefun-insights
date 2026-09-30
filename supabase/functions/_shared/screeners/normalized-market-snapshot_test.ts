import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  gapPercentFromVerifiedInputs,
  overlayVerifiedPreviousCloseOnTicker,
  previousCloseFromVerifiedMove,
} from "./normalized-market-snapshot.ts";
import { gapPercent, type PolygonTicker } from "./selection.ts";

Deno.test("overlay fills prevDay.c when radar fact exists", () => {
  const ticker: PolygonTicker = {
    ticker: "AAA",
    day: { v: 2_000_000 },
    lastTrade: { p: 3 },
    prevDay: { v: 100_000 },
  };
  const overlay = new Map([
    ["AAA", { symbol: "AAA", previousClose: 2, source: "radar_v22_candidate" as const }],
  ]);
  const enriched = overlayVerifiedPreviousCloseOnTicker(ticker, overlay);
  assertEquals(gapPercent(enriched, true), 50);
});

Deno.test("board-style move pair recovers previous close", () => {
  assertEquals(previousCloseFromVerifiedMove(11, 10), 10);
});

Deno.test("gapPercentFromVerifiedInputs matches selection contract", () => {
  assertEquals(gapPercentFromVerifiedInputs(2.1, 2), 5);
  assertEquals(gapPercentFromVerifiedInputs(10, null), null);
});
