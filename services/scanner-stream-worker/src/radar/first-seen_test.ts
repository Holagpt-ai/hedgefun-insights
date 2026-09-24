import { assertEquals } from "jsr:@std/assert";
import { rememberRadarFirstSeen } from "./first-seen.ts";

Deno.test("first-seen stamps once and ignores later evaluation clocks", () => {
  const clock = new Map<string, number>();
  const first = rememberRadarFirstSeen(clock, "BENF", 1_700_000_000_000);
  const again = rememberRadarFirstSeen(clock, "BENF", 1_700_000_180_000);
  assertEquals(first, 1_700_000_000_000);
  assertEquals(again, 1_700_000_000_000);
  assertEquals(rememberRadarFirstSeen(clock, "AEHL", 1_700_000_090_000), 1_700_000_090_000);
});
