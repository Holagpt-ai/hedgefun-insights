/**
 * ISS-034 — Nov 16, 2026 all-day publication stall (read-only production shape).
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  finalizeGappersEvidenceFromAccum,
  type GappersEvidenceAccum,
} from "./evaluation-evidence-chunk.ts";
import { buildPriorGenerationRetentionAbortDetail } from "./generation-abort-diagnostics.ts";
import { shouldPreservePriorScreenerGeneration } from "./generation-preserve.ts";
import { gapSuppressedByCloseVersusPriorWithoutOpen, type PolygonTicker } from "./selection.ts";

const RTH_NOW = Date.parse("2026-11-16T22:05:00.000Z");

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

Deno.test("Nov16: close-vs-prior helper exists but is not wired into publish accounting", () => {
  const w = ticker("WARR.WS", {
    day: { c: 0.51, h: 0.52, l: 0.05, v: 1_500_000 },
    prevDay: { c: 10, v: 500_000 },
  });
  assertEquals(
    gapSuppressedByCloseVersusPriorWithoutOpen(w, { extendedSession: false }),
    true,
  );
});

Deno.test("Nov16: production-shaped accum stays incomplete with two unresolved", () => {
  const acc: GappersEvidenceAccum = {
    volume_positive_count: 1302,
    gap_calculable_count: 1298,
    no_prior_session_count: 1,
    split_scale_suppressed_count: 1,
    unresolved_gap_input_count: 2,
    unresolvedGapSymbols: ["PROD_A", "PROD_B"],
    qualified_count: 0,
  };
  const ev = finalizeGappersEvidenceFromAccum(acc, 13240, 0);
  assertEquals(ev.status, "prerequisite_unavailable");
  assertEquals(ev.reason, "gap_input_coverage_incomplete");
  assertEquals(ev.unresolved_gap_symbols, ["PROD_A", "PROD_B"]);
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
      unresolved_gap_symbols: ["PROD_A", "PROD_B"],
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

Deno.test("Nov16: prior_generation_retained abort stores candidate_gappers snapshot", () => {
  const next = {
    gappers: {
      status: "prerequisite_unavailable" as const,
      universe_count: 13240,
      volume_positive_count: 1302,
      gap_calculable_count: 1298,
      no_prior_session_count: 1,
      split_scale_suppressed_count: 1,
      unresolved_gap_input_count: 2,
      unresolved_gap_symbols: ["PROD_A"],
      qualified_count: 0,
      selected_count: 0,
      reason: "gap_input_coverage_incomplete",
    },
  };
  const detail = buildPriorGenerationRetentionAbortDetail({
    priorEvidence: { gappers: { ...next.gappers, status: "evaluated" } },
    nextEvidence: next,
    priorSyncedAt: "2026-11-16T14:25:00.000Z",
    candidateGenerationId: "4ed4a4c7-d8c4-4582-bd89-cc949d6e291d",
    candidateSyncRunId: "sync-run",
    candidateGappersAccum: {
      volume_positive_count: 1302,
      gap_calculable_count: 1298,
      no_prior_session_count: 1,
      split_scale_suppressed_count: 1,
      unresolved_gap_input_count: 2,
      unresolvedGapSymbols: ["PROD_B", "PROD_A"],
      qualified_count: 0,
    },
  });
  const evidence = detail.evidence as {
    candidate_gappers?: {
      unresolved_gap_input_count: number;
      unresolved_gap_symbols?: string[];
    };
  };
  assertEquals(evidence.candidate_gappers?.unresolved_gap_input_count, 2);
  assertEquals(evidence.candidate_gappers?.unresolved_gap_symbols, [
    "PROD_A",
    "PROD_B",
  ]);
});