import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { applyBaselineDay } from "./baseline-accumulate.ts";

Deno.test("incremental apply reconciles stale high after reverse split restatement", () => {
  const staging = new Map();
  const processed = new Set<string>();
  applyBaselineDay(staging, processed, "2026-03-01", [
    { symbol: "CTNT", h: 424, l: 380 },
  ]);
  applyBaselineDay(staging, processed, "2026-09-22", [
    { symbol: "CTNT", h: 0.04, l: 0.0329 },
  ]);
  const row = staging.get("CTNT");
  assertEquals(row?.high_52w, 0.04);
  assertEquals(row?.low_52w, 0.0329);
  assertEquals(row?.sessions_observed, 2);
});
