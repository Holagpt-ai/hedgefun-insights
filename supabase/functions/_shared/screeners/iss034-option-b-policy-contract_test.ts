/**
 * ISS-034 Option B — contract tests for CURRENT behavior (flag off).
 * Documents preservation gate until owner approves degraded Gappers publication.
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { shouldPreservePriorScreenerGeneration } from "./generation-preserve.ts";

const MORNING = "2026-11-16T14:25:00.000Z";
const AFTERNOON = Date.parse("2026-11-16T22:05:00.000Z");

Deno.test("R1: gappers-only degrade retains prior generation when flag off", () => {
  const prior = {
    gappers: {
      status: "evaluated" as const,
      universe_count: 100,
      volume_positive_count: 50,
      gap_calculable_count: 50,
      qualified_count: 5,
      selected_count: 5,
    },
    gainers_losers: {
      status: "evaluated" as const,
      universe_count: 100,
      qualified_count: 10,
      selected_count: 10,
    },
    new_highs_lows: {
      status: "evaluated" as const,
      baseline_status: "available" as const,
      baseline_quote_count: 1000,
      universe_count: 100,
      selected_count: 5,
    },
  };
  const candidate = {
    ...prior,
    gappers: {
      ...prior.gappers,
      status: "prerequisite_unavailable" as const,
      gap_calculable_count: 1298,
      unresolved_gap_input_count: 2,
      reason: "gap_input_coverage_incomplete",
    },
  };
  assertEquals(
    shouldPreservePriorScreenerGeneration({
      priorEvidence: prior,
      nextEvidence: candidate,
      nowMs: AFTERNOON,
      priorSyncedAt: MORNING,
    }),
    true,
  );
});

Deno.test("Option B contract (current): gappers degrade does not block when prior is same degraded state", () => {
  const degraded = {
    gappers: {
      status: "prerequisite_unavailable" as const,
      universe_count: 100,
      volume_positive_count: 50,
      gap_calculable_count: 48,
      unresolved_gap_input_count: 2,
      qualified_count: 0,
      selected_count: 0,
      reason: "gap_input_coverage_incomplete",
    },
  };
  assertEquals(
    shouldPreservePriorScreenerGeneration({
      priorEvidence: degraded,
      nextEvidence: degraded,
      nowMs: AFTERNOON,
      priorSyncedAt: MORNING,
    }),
    false,
  );
});