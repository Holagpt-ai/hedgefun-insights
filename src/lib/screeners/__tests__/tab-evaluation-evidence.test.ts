import { describe, expect, it } from "vitest";
import {
  gappersEvidenceSupportsZeroMatch,
  nhlEvidenceSupportsZeroMatch,
  parseTabEvaluationEvidence,
} from "@/lib/screeners/tab-evaluation-evidence";

describe("tab evaluation evidence parsing", () => {
  it("gappers: old payloads without accounting fields still parse", () => {
    const parsed = parseTabEvaluationEvidence({
      gappers: {
        status: "evaluated",
        universe_count: 500,
        volume_positive_count: 480,
        gap_calculable_count: 480,
        qualified_count: 0,
        selected_count: 0,
      },
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.gappers).toMatchObject({
      status: "evaluated",
      volume_positive_count: 480,
      gap_calculable_count: 480,
    });
    expect(
      (parsed?.gappers as { no_prior_session_count?: number } | undefined)
        ?.no_prior_session_count,
    ).toBeUndefined();
  });

  it("gappers: rejects evaluated payload missing volume_positive_count", () => {
    const parsed = parseTabEvaluationEvidence({
      gappers: {
        status: "evaluated",
        universe_count: 100,
        gap_calculable_count: 100,
        qualified_count: 0,
        selected_count: 0,
      },
    });
    expect(parsed).toBeNull();
  });

  it("gappers: rejects inferred volume_positive_count from universe_count", () => {
    const parsed = parseTabEvaluationEvidence({
      gappers: {
        status: "evaluated",
        universe_count: 500,
        gap_calculable_count: 500,
        qualified_count: 0,
        selected_count: 0,
      },
    });
    expect(parsed).toBeNull();
  });

  it("nhl: rejects evaluated payload missing baseline_quote_count", () => {
    const parsed = parseTabEvaluationEvidence({
      new_highs_lows: {
        status: "evaluated",
        baseline_status: "available",
        universe_count: 800,
        evaluated_count: 700,
        qualified_count: 0,
        selected_count: 0,
      },
    });
    expect(parsed).toBeNull();
  });

  it("nhl: rejects inferred baseline_quote_count default of 1", () => {
    const parsed = parseTabEvaluationEvidence({
      new_highs_lows: {
        status: "evaluated",
        baseline_status: "available",
        universe_count: 800,
        evaluated_count: 700,
        qualified_count: 0,
        selected_count: 0,
      },
    });
    expect(parsed).toBeNull();
  });
});

describe("zero-match support helpers", () => {
  it("gappers: requires full volume-active gap coverage", () => {
    expect(
      gappersEvidenceSupportsZeroMatch({
        status: "evaluated",
        universe_count: 500,
        volume_positive_count: 480,
        gap_calculable_count: 120,
        no_prior_session_count: 0,
        unresolved_gap_input_count: 0,
        qualified_count: 0,
        selected_count: 0,
      }),
    ).toBe(false);
  });

  it("gappers: rejects selected_count / qualified_count mismatch", () => {
    expect(
      gappersEvidenceSupportsZeroMatch({
        status: "evaluated",
        universe_count: 500,
        volume_positive_count: 480,
        gap_calculable_count: 480,
        no_prior_session_count: 0,
        unresolved_gap_input_count: 0,
        qualified_count: 0,
        selected_count: 5,
      }),
    ).toBe(false);
  });

  it("gappers: accepts sufficient coverage with zero qualifiers", () => {
    expect(
      gappersEvidenceSupportsZeroMatch({
        status: "evaluated",
        universe_count: 500,
        volume_positive_count: 480,
        gap_calculable_count: 470,
        no_prior_session_count: 10,
        unresolved_gap_input_count: 0,
        qualified_count: 0,
        selected_count: 0,
      }),
    ).toBe(true);
  });

  it("gappers: old evidence lacking accounting fields cannot certify zero", () => {
    expect(
      gappersEvidenceSupportsZeroMatch({
        status: "evaluated",
        universe_count: 500,
        volume_positive_count: 480,
        gap_calculable_count: 480,
        qualified_count: 0,
        selected_count: 0,
      }),
    ).toBe(false);
  });

  it("gappers: zero calculable count cannot certify validated zero", () => {
    expect(
      gappersEvidenceSupportsZeroMatch({
        status: "evaluated",
        universe_count: 500,
        volume_positive_count: 16,
        gap_calculable_count: 0,
        no_prior_session_count: 16,
        unresolved_gap_input_count: 0,
        qualified_count: 0,
        selected_count: 0,
      }),
    ).toBe(false);
  });

  it("nhl: rejects selected_count / qualified_count mismatch", () => {
    expect(
      nhlEvidenceSupportsZeroMatch({
        status: "evaluated",
        baseline_status: "available",
        baseline_quote_count: 700,
        universe_count: 800,
        eligible_count: 700,
        evaluated_count: 700,
        policy_excluded_count: 0,
        unresolved_count: 0,
        qualified_count: 0,
        selected_count: 3,
      }),
    ).toBe(false);
  });

  it("nhl: rejects incomplete eligible/evaluated coverage", () => {
    expect(
      nhlEvidenceSupportsZeroMatch({
        status: "evaluated",
        baseline_status: "available",
        baseline_quote_count: 700,
        universe_count: 800,
        eligible_count: 700,
        evaluated_count: 400,
        policy_excluded_count: 0,
        unresolved_count: 300,
        qualified_count: 0,
        selected_count: 0,
      }),
    ).toBe(false);
  });

  it("nhl: accepts full eligible coverage with zero qualifiers", () => {
    expect(
      nhlEvidenceSupportsZeroMatch({
        status: "evaluated",
        baseline_status: "available",
        baseline_quote_count: 700,
        universe_count: 800,
        eligible_count: 700,
        evaluated_count: 600,
        policy_excluded_count: 100,
        no_history_count: 0,
        unresolved_count: 0,
        qualified_count: 0,
        selected_count: 0,
      }),
    ).toBe(true);
  });

  it("nhl: accepts no_history in full eligible accounting", () => {
    expect(
      nhlEvidenceSupportsZeroMatch({
        status: "evaluated",
        baseline_status: "available",
        baseline_quote_count: 700,
        universe_count: 800,
        eligible_count: 700,
        evaluated_count: 600,
        policy_excluded_count: 94,
        no_history_count: 6,
        unresolved_count: 0,
        qualified_count: 0,
        selected_count: 0,
      }),
    ).toBe(true);
  });

  it("nhl: parses bounded diagnostic symbol samples", () => {
    const parsed = parseTabEvaluationEvidence({
      new_highs_lows: {
        status: "not_evaluated",
        baseline_status: "available",
        baseline_quote_count: 11_979,
        universe_count: 13_223,
        eligible_count: 100,
        evaluated_count: 90,
        policy_excluded_count: 5,
        no_history_count: 4,
        unresolved_count: 1,
        unresolved_symbols: ["HOLE"],
        no_history_symbols: ["IPO1", "IPO2"],
        qualified_count: 0,
        selected_count: 0,
        reason: "baseline_coverage_incomplete",
      },
    });
    expect(parsed?.new_highs_lows).toMatchObject({
      unresolved_symbols: ["HOLE"],
      no_history_symbols: ["IPO1", "IPO2"],
    });
  });

  it("nhl: old evidence lacking accounting fields cannot certify zero", () => {
    expect(
      nhlEvidenceSupportsZeroMatch({
        status: "evaluated",
        baseline_status: "available",
        baseline_quote_count: 700,
        universe_count: 800,
        eligible_count: 700,
        evaluated_count: 700,
        qualified_count: 0,
        selected_count: 0,
      }),
    ).toBe(false);
  });
});
