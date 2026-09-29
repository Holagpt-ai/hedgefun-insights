/**
 * Premarket gap uses the extended last versus the prior regular close.
 * Regular-session opening gaps stay on day.o. No rows are invented.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isCoherent52WeekRange } from "./baseline-corporate-action.ts";
import { evaluateGappersEvidence } from "./evaluation-evidence.ts";
import { isValidBaselineQuote } from "./new-highs-lows.ts";
import { mapTabRows, type GenerationMeta } from "./rows.ts";
import {
  gapPercent,
  qualifiesGappers,
  selectForTab,
  type PolygonTicker,
} from "./selection.ts";

const NOW = Date.parse("2026-09-29T13:00:00.000Z");
const META: GenerationMeta = {
  syncedAt: new Date(NOW).toISOString(),
  syncRunId: "11111111-2222-3333-4444-555555555555",
  nowMs: NOW,
  extendedSession: true,
};

function premarket(
  symbol: string,
  last: number | null,
  prevClose: number | null,
  volume = 2_000_000,
): PolygonTicker {
  const prevDay = prevClose === null ? { v: 100_000 } : { c: prevClose, v: 100_000 };
  return {
    ticker: symbol,
    updated: NOW * 1_000_000,
    day: { v: volume },
    prevDay,
    ...(last === null ? {} : { lastTrade: { p: last, t: NOW * 1_000_000 } }),
    todaysChangePerc: 900,
  };
}

Deno.test("gappers: valid prev close and premarket last calculate the gap", () => {
  const t = premarket("ZZX", 3, 2);
  assertEquals(gapPercent(t, true), 50);
  assertEquals(qualifiesGappers(t, true), true);
  const [row] = mapTabRows("gappers", [t], (s) => s, META);
  assertEquals(row.price, 3);
  assertEquals(row.gap_percent, 50);
  assertEquals(row.symbol, "ZZX");
});

Deno.test("gappers: +5% and -5% qualify; below 5% does not", () => {
  const up = premarket("UP", 2.1, 2);
  const down = premarket("DN", 1.9, 2);
  const flat = premarket("FLAT", 2.08, 2);
  assertEquals(gapPercent(up, true), 5);
  assertEquals(gapPercent(down, true), -5);
  assertEquals(gapPercent(flat, true), 4);
  assertEquals(qualifiesGappers(up, true), true);
  assertEquals(qualifiesGappers(down, true), true);
  assertEquals(qualifiesGappers(flat, true), false);
  const selected = selectForTab("gappers", [flat, up, down], 20, { extendedSession: true });
  assertEquals(selected.map((t) => t.ticker), ["DN", "UP"]);
});

Deno.test("gappers: missing previous close stays prerequisite_unavailable", () => {
  const universe = [premarket("ZZX", 3, null)];
  assertEquals(gapPercent(universe[0], true), null);
  const evidence = evaluateGappersEvidence(universe, [], undefined, true);
  assertEquals(evidence.status, "prerequisite_unavailable");
  assertEquals(evidence.reason, "prior_close_gap_inputs_unavailable");
  assertEquals(selectForTab("gappers", universe, 20, { extendedSession: true }).length, 0);
});

Deno.test("gappers: zero previous close stays unavailable and creates no row", () => {
  const universe = [premarket("ZZX", 3, 0)];
  assertEquals(gapPercent(universe[0], true), null);
  const evidence = evaluateGappersEvidence(universe, [], undefined, true);
  assertEquals(evidence.status, "prerequisite_unavailable");
  assertEquals(evidence.gap_calculable_count, 0);
  assertEquals(selectForTab("gappers", universe, 20, { extendedSession: true }).length, 0);
});

Deno.test("gappers: provider percent is not a stand-in when the last is missing", () => {
  const t = premarket("ZZX", null, 2);
  assertEquals(gapPercent(t, true), null);
  assertEquals(qualifiesGappers(t, true), false);
});

Deno.test("gappers: regular session still uses the opening print", () => {
  const t: PolygonTicker = {
    ticker: "ZZX",
    updated: NOW * 1_000_000,
    day: { o: 2.1, c: 2.4, v: 2_000_000 },
    prevDay: { c: 2, v: 100_000 },
    lastTrade: { p: 3 },
  };
  assertEquals(gapPercent(t, false), 5);
  assertEquals(gapPercent(t, true), 50);
  assertEquals(qualifiesGappers(t, false), true);
});

Deno.test("gappers: evidence is evaluated when prev close and extended last exist", () => {
  const universe = [premarket("ZZX", 3, 2), premarket("AAA", 2.08, 2)];
  const selected = selectForTab("gappers", universe, 20, { extendedSession: true });
  const evidence = evaluateGappersEvidence(universe, selected, undefined, true);
  assertEquals(evidence.status, "evaluated");
  assertEquals(evidence.gap_calculable_count, 2);
  assertEquals(evidence.qualified_count, 1);
  assertEquals(evidence.selected_count, 1);
  assertEquals(selected.map((t) => t.ticker), ["ZZX"]);
});

Deno.test("gappers: selection does not invent symbols", () => {
  const selected = selectForTab("gappers", [premarket("FLAT", 2.02, 2)], 20, {
    extendedSession: true,
  });
  assertEquals(selected, []);
});

Deno.test("gappers: split-scale 52w guard still rejects an incoherent baseline", () => {
  assertEquals(isCoherent52WeekRange(424, 0.0329), false);
  assertEquals(
    isValidBaselineQuote({
      symbol: "ZZX",
      high_52w: 424,
      low_52w: 0.0329,
      sessions_observed: 40,
    }),
    false,
  );
  const doubled: PolygonTicker = {
    ticker: "ZZX",
    day: { o: 4, c: 4, v: 1_000 },
    prevDay: { c: 2, v: 100 },
  };
  assertEquals(gapPercent(doubled, false), 100);
});
