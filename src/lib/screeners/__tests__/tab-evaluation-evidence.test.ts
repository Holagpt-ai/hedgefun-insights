import { describe, expect, it } from "vitest";
import {
  gappersEvidenceSupportsZeroMatch,
  nhlEvidenceSupportsZeroMatch,
  parseTabEvaluationEvidence,
} from "@/lib/screeners/tab-evaluation-evidence";

describe("tab evaluation evidence parsing", () => {
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
        gap_calculable_count: 480,
        qualified_count: 0,
        selected_count: 0,
      }),
    ).toBe(true);
  });

  it("nhl: rejects selected_count / qualified_count mismatch", () => {
    expect(
      nhlEvidenceSupportsZeroMatch({
        status: "evaluated",
        baseline_status: "available",
        baseline_quote_count: 700,
        universe_count: 800,
        evaluated_count: 700,
        qualified_count: 0,
        selected_count: 3,
      }),
    ).toBe(false);
  });

  it("nhl: accepts meaningful evaluated coverage with zero qualifiers", () => {
    expect(
      nhlEvidenceSupportsZeroMatch({
        status: "evaluated",
        baseline_status: "available",
        baseline_quote_count: 700,
        universe_count: 800,
        evaluated_count: 700,
        qualified_count: 0,
        selected_count: 0,
      }),
    ).toBe(true);
  });
});
