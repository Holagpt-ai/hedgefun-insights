import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildVolumeHistoryFromCache } from "./volume-history.ts";
import type { DailyCache } from "./grouped.ts";

Deno.test("buildVolumeHistoryFromCache skips invalid and out-of-period volumes", () => {
  const cache: DailyCache = new Map([
    ["2026-08-01", new Map([
      ["AAA", { h: 10, l: 5, v: 1_000_000 }],
      ["BBB", { h: 10, l: 5, v: null }],
      ["CCC", { h: 10, l: 5, v: -1 }],
    ])],
    ["2026-08-02", new Map([
      ["AAA", { h: 11, l: 6, v: 2_000_000 }],
    ])],
  ]);
  const rows = buildVolumeHistoryFromCache(
    cache,
    ["2026-08-01", "2026-08-02"],
    "2026-08-01",
    "2026-08-02",
  );
  assertEquals(rows, [
    { symbol: "AAA", session_date: "2026-08-01", volume: 1_000_000 },
    { symbol: "AAA", session_date: "2026-08-02", volume: 2_000_000 },
  ]);
});
