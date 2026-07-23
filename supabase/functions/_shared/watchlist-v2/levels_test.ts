import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeKeyLevels, computeTransitionLevels } from "./levels.ts";

// bars: 09:30, 09:31 (pre & rth), 10:00 ET
const t0930 = Date.parse("2026-07-23T13:30:00Z");
const t0931 = Date.parse("2026-07-23T13:31:00Z");
const t1000 = Date.parse("2026-07-23T14:00:00Z");
const tPre = Date.parse("2026-07-23T12:00:00Z"); // 08:00 ET pre

const bars = [
  { t: tPre, o: 99.5, h: 100, l: 99, c: 99.8, v: 500 },
  { t: t0930, o: 100, h: 100.5, l: 99.9, c: 100.3, v: 1000 },
  { t: t0931, o: 100.3, h: 101, l: 100.2, c: 100.9, v: 2000 },
  { t: t1000, o: 100.9, h: 102, l: 100.8, c: 101.5, v: 3000 },
];

Deno.test("computeKeyLevels RTH VWAP is over RTH bars only", () => {
  const lv = computeKeyLevels(bars, "rth", 99);
  assertEquals(lv.basis.vwap_scope, "rth");
  assertEquals(lv.basis.hod_lod_scope, "rth");
  assert(lv.vwap !== null);
  // HOD should be max of RTH bars
  assertEquals(lv.hod, 102);
  assertEquals(lv.lod, 99.9);
  assertEquals(lv.premarket_high, 100);
});

Deno.test("computeKeyLevels premarket scope uses pre bars only", () => {
  const lv = computeKeyLevels(bars.slice(0, 1), "premarket", 99);
  assertEquals(lv.basis.hod_lod_scope, "premarket");
  assertEquals(lv.hod, 100);
  assertEquals(lv.lod, 99);
});

Deno.test("computeTransitionLevels excludes last bar", () => {
  const tr = computeTransitionLevels(bars, "rth");
  // exclude last t1000: RTH prior bars = t0930, t0931 → hod 101
  assertEquals(tr.hod_excl_current, 101);
  assertEquals(tr.previous_bar_close, 100.9);
});

Deno.test("computeTransitionLevels returns nulls with <2 bars", () => {
  const tr = computeTransitionLevels([bars[0]], "rth");
  assertEquals(tr.hod_excl_current, null);
  assertEquals(tr.previous_bar_close, null);
});
