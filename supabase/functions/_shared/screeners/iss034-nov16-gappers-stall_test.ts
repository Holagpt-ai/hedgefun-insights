/**
 * ISS-034 — Nov 16, 2026 all-day publication stall (read-only production shape).
 * Gappers accounting with tiny unresolved tail + prior_generation_retained preserve.
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  finalizeGappersEvidenceFromAccum,
  type GappersEvidenceAccum,
} from "./evaluation-evidence-chunk.ts";
import { shouldPreservePriorScreenerGeneration } from "./generation-preserve.ts";
import {
  gapSuppressedByCloseVersusPriorWithoutOpen,
  type PolygonTicker,
} from "./selection.ts";

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

/** Warrant/stub: positive volume, no day.o, scaled day.c vs prevDay.c */
function warrantNoOpen(sym: string): PolygonTicker {
  return ticker(sym, {
    day: { c: 0.51, h: 0.52, l: 0.05, v: 1_500_000 },
    prevDay: { c: 10, v: 500_000 },
  });
}

Deno.test("Nov16: missing day.o with close-vs-prior split is split-scale not unresolved", () => {
  const w = warrantNoOpen("WARR.WS");
  assertEquals(
    gapSuppressedByCloseVersusPriorWithoutOpen(w, { extendedSession: false }),
    true,
  );
});

Deno.test("Nov16: missing day.o without scale mismatch stays unresolved", () => {
  const t = ticker("PLAIN", {
    day: { c: 10.05, h: 10.1, l: 9.95, v: 800_000 },
    prevDay: { c: 10, v: 50_000 },
  });
  delete (t.day as { o?: unknown }).o;
  assertEquals(
    gapSuppressedByCloseVersusPriorWithoutOpen(t, { extendedSession: false }),
    false,
  );
});

Deno.test("Nov16: production-shaped accum evaluates when close-vs-prior split classifies tail", () => {
  const acc: GappersEvidenceAccum = {
    volume_positive_count: 1302,
    gap_calculable_count: 1298,
    no_prior_session_count: 1,
    split_scale_suppressed_count: 1,
    unresolved_gap_input_count: 2,
    unresolvedGapSymbols: ["AAA", "BBB"],
    qualified_count: 0,
  };
  const before = finalizeGappersEvidenceFromAccum(acc, 5000, 0);
  assertEquals(before.status, "prerequisite_unavailable");
  assertEquals(before.reason, "gap_input_coverage_incomplete");

  const healed: GappersEvidenceAccum = {
    ...acc,
    split_scale_suppressed_count: 3,
    unresolved_gap_input_count: 0,
    unresolvedGapSymbols: [],
  };
  const after = finalizeGappersEvidenceFromAccum(healed, 5000, 0);
  assertEquals(after.status, "evaluated");
});

Deno.test("Nov16: preserve fires when gappers degrades from evaluated", () => {
  const priorSynced = "2026-11-16T14:25:00.000Z";
  const prior = {
    gappers: {
      status: "evaluated" as const,
      universe_count: 4000,
      volume_positive_count: 1200,
      gap_calculable_count: 1198,
      no_prior_session_count: 0,
      split_scale_suppressed_count: 2,
      unresolved_gap_input_count: 0,
      qualified_count: 5,
      selected_count: 5,
    },
    gainers_losers: {
      status: "evaluated" as const,
      universe_count: 4000,
      qualified_count: 10,
      selected_count: 10,
    },
    new_highs_lows: {
      status: "evaluated" as const,
      baseline_status: "available" as const,
      baseline_quote_count: 10000,
      universe_count: 4000,
      selected_count: 8,
    },
  };
  const candidate = {
    ...prior,
    gappers: {
      ...prior.gappers,
      status: "prerequisite_unavailable" as const,
      unresolved_gap_input_count: 2,
      reason: "gap_input_coverage_incomplete",
    },
  };
  assertEquals(
    shouldPreservePriorScreenerGeneration({
      priorEvidence: prior,
      nextEvidence: candidate,
      nowMs: RTH_NOW,
      priorSyncedAt: priorSynced,
    }),
    true,
  );
});