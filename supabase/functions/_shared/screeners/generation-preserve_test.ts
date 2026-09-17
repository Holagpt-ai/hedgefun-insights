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
    shouldPreservePriorScreenerGeneration({ priorEvidence: prior, nextEvidence: next }),
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
    shouldPreservePriorScreenerGeneration({ priorEvidence: prior, nextEvidence: next }),
    false,
  );
});
