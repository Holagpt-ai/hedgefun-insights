import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { shouldPreservePriorScreenerGeneration } from "./generation-preserve.ts";
import type { TabEvaluationEvidenceMap } from "./evaluation-evidence.ts";

Deno.test("preserve: gappers evaluated → prerequisite_unavailable retains prior", () => {
  const prior: TabEvaluationEvidenceMap = {
    gappers: {
      status: "evaluated",
      universe_count: 100,
      volume_positive_count: 50,
      gap_calculable_count: 40,
      no_prior_session_count: 10,
      unresolved_gap_input_count: 0,
      qualified_count: 2,
      selected_count: 2,
    },
  };
  const next: TabEvaluationEvidenceMap = {
    gappers: {
      status: "prerequisite_unavailable",
      universe_count: 100,
      volume_positive_count: 50,
      gap_calculable_count: 0,
      no_prior_session_count: 0,
      unresolved_gap_input_count: 50,
      qualified_count: 0,
      selected_count: 0,
      reason: "prior_close_gap_inputs_unavailable",
    },
  };
  assertEquals(
    shouldPreservePriorScreenerGeneration({
      priorEvidence: prior,
      nextEvidence: next,
      nowMs: Date.parse("2026-09-17T14:00:00.000Z"),
      priorSyncedAt: "2026-09-17T13:55:00.000Z",
    }),
    true,
  );
});

Deno.test("preserve: nhl evaluated → not_evaluated retains prior generation", () => {
  const prior: TabEvaluationEvidenceMap = {
    new_highs_lows: {
      status: "evaluated",
      baseline_status: "available",
      baseline_quote_count: 11_979,
      universe_count: 13_223,
      eligible_count: 9_693,
      evaluated_count: 9_019,
      policy_excluded_count: 666,
      no_history_count: 8,
      unresolved_count: 0,
      qualified_count: 181,
      selected_count: 20,
    },
  };
  const next: TabEvaluationEvidenceMap = {
    new_highs_lows: {
      status: "not_evaluated",
      baseline_status: "available",
      baseline_quote_count: 11_979,
      universe_count: 13_223,
      eligible_count: 9_693,
      evaluated_count: 9_019,
      policy_excluded_count: 666,
      no_history_count: 7,
      unresolved_count: 1,
      qualified_count: 181,
      selected_count: 20,
      reason: "baseline_coverage_incomplete",
      unresolved_symbols: ["HOLE"],
    },
  };
  assertEquals(
    shouldPreservePriorScreenerGeneration({
      priorEvidence: prior,
      nextEvidence: next,
      nowMs: Date.parse("2026-09-17T14:00:00.000Z"),
      priorSyncedAt: "2026-09-17T13:55:00.000Z",
    }),
    true,
  );
});

Deno.test("preserve: validated zero after evaluated does not retain", () => {
  const prior: TabEvaluationEvidenceMap = {
    volume_spikes: {
      status: "evaluated",
      universe_count: 100,
      qualified_count: 3,
      selected_count: 3,
    },
  };
  const next: TabEvaluationEvidenceMap = {
    volume_spikes: {
      status: "evaluated",
      universe_count: 100,
      qualified_count: 0,
      selected_count: 0,
    },
  };
  assertEquals(
    shouldPreservePriorScreenerGeneration({
      priorEvidence: prior,
      nextEvidence: next,
      nowMs: Date.parse("2026-09-17T14:00:00.000Z"),
      priorSyncedAt: "2026-09-17T13:55:00.000Z",
    }),
    false,
  );
});

Deno.test("preserve: prior snapshot from previous surveillance date is not retained at pre-market open", () => {
  const prior: TabEvaluationEvidenceMap = {
    gappers: {
      status: "evaluated",
      universe_count: 100,
      volume_positive_count: 50,
      gap_calculable_count: 40,
      no_prior_session_count: 10,
      unresolved_gap_input_count: 0,
      qualified_count: 2,
      selected_count: 2,
    },
  };
  const next: TabEvaluationEvidenceMap = {
    gappers: {
      status: "prerequisite_unavailable",
      universe_count: 100,
      volume_positive_count: 50,
      gap_calculable_count: 0,
      no_prior_session_count: 0,
      unresolved_gap_input_count: 50,
      qualified_count: 0,
      selected_count: 0,
      reason: "prior_close_gap_inputs_unavailable",
    },
  };
  const premarketOpenMs = Date.parse("2026-09-24T08:10:00.000Z"); // 04:10 ET Sep 24
  assertEquals(
    shouldPreservePriorScreenerGeneration({
      priorEvidence: prior,
      nextEvidence: next,
      nowMs: premarketOpenMs,
      priorSyncedAt: "2026-09-24T00:00:00.000Z", // Sep 23 20:00 ET AH close generation
    }),
    false,
  );
});
