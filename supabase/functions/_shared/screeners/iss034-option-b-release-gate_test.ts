/**
 * ISS-034 Option B — release-gate regressions (not R1–R7 matrix).
 * Reconciles preserve skip vs row omission vs companion-tab health.
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { shouldPreservePriorScreenerGeneration } from "./generation-preserve.ts";
import type { TabEvaluationEvidenceMap } from "./evaluation-evidence.ts";
import {
  degradedGappersPublicationRowOmissionAllowed,
  omitGappersRowsForDegradedPublication,
} from "./screener-degraded-gappers-publish.ts";

const MORNING = "2026-11-16T14:25:00.000Z";
const AFTERNOON = Date.parse("2026-11-16T22:05:00.000Z");
const PREMARKET_OPEN = Date.parse("2026-09-24T08:10:00.000Z");

const companionsEvaluated = {
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

const gappersIncomplete = {
  status: "prerequisite_unavailable" as const,
  universe_count: 13240,
  volume_positive_count: 1302,
  gap_calculable_count: 1298,
  no_prior_session_count: 1,
  split_scale_suppressed_count: 1,
  unresolved_gap_input_count: 2,
  qualified_count: 0,
  selected_count: 0,
  reason: "gap_input_coverage_incomplete",
};

const sampleRows = [
  { tab_id: "gappers", symbol: "G1" },
  { tab_id: "gainers_losers", symbol: "GL1" },
  { tab_id: "day_trade_radar", symbol: "D1" },
] as const;

Deno.test("RG-omit: row filter blocked when companion tabs not evaluated on candidate", () => {
  const evidence: TabEvaluationEvidenceMap = {
    gappers: gappersIncomplete,
    gainers_losers: {
      status: "prerequisite_unavailable",
      universe_count: 100,
      qualified_count: 0,
      selected_count: 0,
    },
    new_highs_lows: {
      status: "not_evaluated",
      baseline_status: "available",
      baseline_quote_count: 1000,
      universe_count: 100,
      selected_count: 0,
      reason: "baseline_coverage_incomplete",
    },
  };
  assertEquals(degradedGappersPublicationRowOmissionAllowed(evidence, true), false);
  const filtered = omitGappersRowsForDegradedPublication(sampleRows, evidence, true);
  assertEquals(filtered.length, sampleRows.length);
  assertEquals(filtered.some((r) => r.tab_id === "gappers"), true);
});

Deno.test("RG-repeat: repeated incomplete generation retains when flag on but companions missing", () => {
  const prior: TabEvaluationEvidenceMap = {
    gappers: gappersIncomplete,
    gainers_losers: {
      status: "prerequisite_unavailable",
      universe_count: 100,
      qualified_count: 0,
      selected_count: 0,
    },
    new_highs_lows: {
      status: "not_evaluated",
      baseline_status: "available",
      baseline_quote_count: 1000,
      universe_count: 100,
      selected_count: 0,
    },
  };
  const next: TabEvaluationEvidenceMap = { ...prior };
  assertEquals(
    shouldPreservePriorScreenerGeneration({
      priorEvidence: prior,
      nextEvidence: next,
      nowMs: AFTERNOON,
      priorSyncedAt: MORNING,
      allowDegradedGappersPublish: true,
    }),
    true,
  );
});

Deno.test("RG-repeat: repeated incomplete generation may publish when companions verified", () => {
  const prior: TabEvaluationEvidenceMap = {
    gappers: gappersIncomplete,
    ...companionsEvaluated,
  };
  const next: TabEvaluationEvidenceMap = { ...prior };
  assertEquals(
    shouldPreservePriorScreenerGeneration({
      priorEvidence: prior,
      nextEvidence: next,
      nowMs: AFTERNOON,
      priorSyncedAt: MORNING,
      allowDegradedGappersPublish: true,
    }),
    false,
  );
  assertEquals(degradedGappersPublicationRowOmissionAllowed(next, true), true);
  const filtered = omitGappersRowsForDegradedPublication(sampleRows, next, true);
  assertEquals(filtered.length, 2);
  assertEquals(filtered.some((r) => r.tab_id === "gappers"), false);
});

Deno.test("RG-session: prior surveillance-date boundary retains when incomplete Gappers lack companion verification", () => {
  const prior: TabEvaluationEvidenceMap = {
    gappers: {
      status: "evaluated",
      universe_count: 100,
      volume_positive_count: 50,
      gap_calculable_count: 50,
      qualified_count: 2,
      selected_count: 2,
    },
    ...companionsEvaluated,
  };
  const next: TabEvaluationEvidenceMap = {
    ...prior,
    gappers: gappersIncomplete,
    new_highs_lows: {
      status: "not_evaluated",
      baseline_status: "available",
      baseline_quote_count: 1000,
      universe_count: 100,
      selected_count: 0,
    },
  };
  assertEquals(
    shouldPreservePriorScreenerGeneration({
      priorEvidence: prior,
      nextEvidence: next,
      nowMs: PREMARKET_OPEN,
      priorSyncedAt: "2026-09-24T00:00:00.000Z",
      allowDegradedGappersPublish: true,
    }),
    true,
  );
  assertEquals(degradedGappersPublicationRowOmissionAllowed(next, true), false);
  assertEquals(
    omitGappersRowsForDegradedPublication(sampleRows, next, true).length,
    sampleRows.length,
  );
});

Deno.test("RG-recovery: evaluated Gappers evidence never triggers row omission", () => {
  const healed: TabEvaluationEvidenceMap = {
    gappers: {
      status: "evaluated",
      universe_count: 13240,
      volume_positive_count: 1302,
      gap_calculable_count: 1302,
      no_prior_session_count: 1,
      split_scale_suppressed_count: 1,
      unresolved_gap_input_count: 0,
      qualified_count: 3,
      selected_count: 3,
    },
    ...companionsEvaluated,
  };
  assertEquals(degradedGappersPublicationRowOmissionAllowed(healed, true), false);
  const filtered = omitGappersRowsForDegradedPublication(sampleRows, healed, true);
  assertEquals(filtered.length, sampleRows.length);
});

Deno.test("RG-fail-closed: prior_close incomplete reason never omits rows even with flag", () => {
  const evidence: TabEvaluationEvidenceMap = {
    gappers: {
      ...gappersIncomplete,
      reason: "prior_close_gap_inputs_unavailable",
    },
    ...companionsEvaluated,
  };
  assertEquals(degradedGappersPublicationRowOmissionAllowed(evidence, true), false);
});