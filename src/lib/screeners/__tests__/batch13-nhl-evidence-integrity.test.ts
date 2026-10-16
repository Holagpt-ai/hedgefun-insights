import { describe, expect, it } from "vitest";
import {
  computeNhlDistancePct,
  computeNhlDistanceSides,
  formatNhlDistanceLabel,
} from "@/lib/screeners/nhl-distance";
import { buildScannerTabEvidence } from "@/lib/screeners/scanner-tab-evidence";
import { resolveScreenerTruthState } from "@/lib/screeners/screener-truth-state";
import type { ScreenerResultRow } from "@/lib/screeners/contract";

describe("Batch 13 — NHL distance and display", () => {
  it("both event shows high and low distances", () => {
    const sides = computeNhlDistanceSides({
      range_event: "both",
      high_52w: 10,
      low_52w: 5,
      day_high: 10.5,
      day_low: 4.5,
    });
    expect(sides.highSidePct).toBe(5);
    expect(sides.lowSidePct).toBe(-10);
    const label = formatNhlDistanceLabel("both", computeNhlDistancePct({
      range_event: "both",
      high_52w: 10,
      low_52w: 5,
      day_high: 10.5,
      day_low: 4.5,
    }), sides);
    expect(label).toContain("above prior 52W high");
    expect(label).toContain("prior 52W low");
  });

  it("scanner evidence cites both baselines for dual events", () => {
    const row = {
      symbol: "DUAL",
      range_event: "both",
      high_52w: 20,
      low_52w: 5,
    } as ScreenerResultRow;
    const evidence = buildScannerTabEvidence("new_highs_lows", row);
    expect(evidence?.primaryLabel).toBe("New 52W high and low");
    expect(evidence?.detail).toContain("Prior 52W high");
    expect(evidence?.detail).toContain("prior 52W low");
  });
});

describe("Batch 13 — screener truth states", () => {
  it("does not claim validated zero when NHL coverage is incomplete", () => {
    const state = resolveScreenerTruthState({
      tabId: "new_highs_lows",
      status: "available",
      rowCount: 0,
      syncedAt: "2026-09-22T12:00:00.000Z",
      nhlBaselineStatus: "available",
      tabEvaluationEvidence: {
        new_highs_lows: {
          status: "not_evaluated",
          baseline_status: "available",
          baseline_quote_count: 1,
          universe_count: 1,
          eligible_count: 1,
          evaluated_count: 0,
          unresolved_count: 1,
          qualified_count: 0,
          selected_count: 0,
          reason: "baseline_coverage_incomplete",
        },
      },
    });
    expect(state.reason).not.toBe("validated_zero_matches");
    expect(state.explanation).toMatch(/not fully evaluated/i);
  });
});
