import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isCoherent52WeekRange,
  merge52WeekHigh,
  merge52WeekLow,
  restateLegacyHigh,
} from "./baseline-corporate-action.ts";

Deno.test("CTNT-like reverse split restates stale running high", () => {
  const restated = restateLegacyHigh(424, 0.04);
  assertEquals(restated < 0.05 && restated > 0.03, true);
  assertEquals(merge52WeekHigh(424, 0.035) < 0.05, true);
  assertEquals(merge52WeekHigh(424, 0.04) < 0.05, true);
});

Deno.test("coherence gate rejects mixed-scale CTNT baseline pair", () => {
  assertEquals(isCoherent52WeekRange(424, 0.0329), false);
  assertEquals(isCoherent52WeekRange(20, 5), true);
});

Deno.test("1-for-200 discontinuity between sessions", () => {
  assertEquals(merge52WeekHigh(200, 1), 1);
  assertEquals(merge52WeekLow(0.01, 2), 2);
});

Deno.test("normal uptrend is unchanged", () => {
  assertEquals(merge52WeekHigh(10, 12), 12);
  assertEquals(merge52WeekLow(5, 4), 4);
});
