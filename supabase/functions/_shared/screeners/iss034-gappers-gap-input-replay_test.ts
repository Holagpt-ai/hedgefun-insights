/**
 * ISS-034 production replay — classifier comparison and owner-shaped unresolved tails.
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  compareGappersGapInputAccounting,
  replayGappersGapInputAccounting,
} from "./gappers-gap-input-accounting.ts";
import type { PolygonTicker } from "./selection.ts";

const RTH_NOW = Date.parse("2026-11-16T22:05:00.000Z"); // 5:05 PM ET

function ticker(
  sym: string,
  overrides: Partial<PolygonTicker> = {},
): PolygonTicker {
  return {
    ticker: sym,
    day: { o: 10, c: 10.1, h: 10.2, l: 9.9, v: 1_000_000 },
    prevDay: { c: 10, v: 100_000 },
    updated: RTH_NOW * 1_000_000,
    ...overrides,
  };
}

/** Owner evidence: volume-active, missing day.o, no positive day.c, positive prevDay.c */
function ownerShapedUnresolved(sym: string): PolygonTicker {
  return ticker(sym, {
    day: { h: 1, l: 0.5, v: 950_000 },
    prevDay: { c: 12.5, v: 200_000 },
  });
}

const replayOpts = {
  extendedSession: false,
  observationSessionFields: false,
  nowMs: RTH_NOW,
  isStructurallyNoPriorSession: () => false,
};

Deno.test("ISS-034: close-vs-prior helper does not change unresolved count (owner-shaped tail)", () => {
  const universe = [
    ownerShapedUnresolved("PRODA"),
    ownerShapedUnresolved("PRODB"),
    ticker("CALC"),
  ];
  const { baseline, withHelper } = compareGappersGapInputAccounting(universe, replayOpts);
  assertEquals(baseline.unresolved_gap_input_count, 2);
  assertEquals(withHelper.unresolved_gap_input_count, 2);
  assertEquals(baseline.close_versus_prior_helper_matches, 0);
  assertEquals(baseline.unresolved[0]?.rejectReason, "missing_gap_reference");
  assertEquals(baseline.unresolved[0]?.rejectDetail.has_positive_day_o, false);
  assertEquals(baseline.unresolved[0]?.rejectDetail.has_positive_day_c, false);
  assertEquals(baseline.unresolved[0]?.rejectDetail.has_positive_prevDay_c, true);
});

Deno.test("ISS-034: production accum identity without close-vs-prior helper", () => {
  const fillers: PolygonTicker[] = [];
  for (let i = 0; i < 1298; i++) {
    fillers.push(ticker(`CALC${i}`));
  }
  const universe: PolygonTicker[] = [
    ...fillers,
    ticker("NO_PRIOR", {
      day: { o: 8, c: 8.2, h: 8.3, l: 7.9, v: 600_000 },
      prevDay: { o: 0, h: 0, l: 0, c: 0, v: 0 },
    }),
    ticker("SPLIT", {
      day: { o: 50, c: 1.01, h: 55, l: 0.9, v: 400_000 },
      prevDay: { c: 48, v: 50_000 },
    }),
    ownerShapedUnresolved("PRODA"),
    ownerShapedUnresolved("PRODB"),
  ];
  const result = replayGappersGapInputAccounting(universe, {
    ...replayOpts,
    isStructurallyNoPriorSession: (t) => {
      const sym = String(t.ticker);
      return sym === "NO_PRIOR";
    },
  });
  assertEquals(result.volume_positive_count, 1302);
  assertEquals(result.gap_calculable_count, 1298);
  assertEquals(result.no_prior_session_count, 1);
  assertEquals(result.split_scale_suppressed_count, 1);
  assertEquals(result.unresolved_gap_input_count, 2);
  assertEquals(result.unresolved.map((r) => r.symbol), ["PRODA", "PRODB"]);
});