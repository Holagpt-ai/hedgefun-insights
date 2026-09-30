import { describe, expect, it } from "vitest";
import {
  resolveContinuationPriorityScoreCutoff,
  scoreDistributionSummary,
} from "@/config/continuation-priority.config";
import { computeAmInboxLateSessionPriorityScore } from "@/lib/am-inbox/am-inbox-late-session-priority";
import { buildLateSessionContinuationContext } from "@/lib/am-inbox/build-late-session-continuation-context";
import { isLateSessionPriorityCandidate } from "@/lib/am-inbox/am-inbox-late-session-view";
import { assessRvolConfidence } from "@/lib/screeners/rvol-confidence";

function entry(
  symbol: string,
  volume: number,
  rvol: number,
  dollarVolume: number | null = volume * 10,
) {
  return {
    context: buildLateSessionContinuationContext({
      symbol,
      sourceSessionDate: "2026-09-21",
      sourceTimestamp: "2026-09-21T20:00:00.000Z",
      sourceCategory: "POWER_HOUR_MOMENTUM",
      volume,
      rvol,
      dollarVolume: dollarVolume === undefined ? 50_000_000 : dollarVolume,
    }),
    workflow: null,
    sourceCategories: ["POWER_HOUR_MOMENTUM"] as const,
  };
}

describe("continuation priority calibration", () => {
  it("reports score distribution helpers for fixture pools", () => {
    const scores = [entry("A", 20_000_000, 12), entry("B", 5_000_000, 8), entry("C", 400_000, 0.2)]
      .map(computeAmInboxLateSessionPriorityScore);
    const summary = scoreDistributionSummary(scores);
    expect(summary.min).toBeLessThan(summary.p85);
    expect(summary.p85).toBeLessThanOrEqual(summary.max);
  });

  it("applies P85 band only when qualified pool is large", () => {
    const largePool = Array.from({ length: 25 }, (_, i) =>
      entry(`S${i}`, (25 - i) * 1_000_000, 5 + i * 0.2),
    );
    const scores = largePool.map(computeAmInboxLateSessionPriorityScore);
    const cutoff = resolveContinuationPriorityScoreCutoff(scores);
    expect(cutoff).toBeGreaterThan(72);
    const priorityCount = largePool.filter((candidate) =>
      isLateSessionPriorityCandidate(candidate, largePool),
    ).length;
    expect(priorityCount).toBeLessThan(largePool.length);
    expect(priorityCount).toBeGreaterThan(0);
  });

  it("separates weak qualified handoffs from priority band", () => {
    const qualified = [
      entry("STRONG", 20_000_000, 12),
      entry("MID", 5_000_000, 8),
      entry("WEAK", 400_000, 0.2, null as number | null),
    ];
    const cutoff = resolveContinuationPriorityScoreCutoff(
      qualified.map(computeAmInboxLateSessionPriorityScore),
    );
    expect(isLateSessionPriorityCandidate(qualified[2]!, qualified)).toBe(false);
    expect(isLateSessionPriorityCandidate(qualified[0]!, qualified)).toBe(true);
    expect(computeAmInboxLateSessionPriorityScore(qualified[2]!)).toBeLessThan(
      computeAmInboxLateSessionPriorityScore(qualified[0]!),
    );
  });

  it("caps thin-baseline raw RVOL in priority scoring", () => {
    const thin = assessRvolConfidence({
      rawRvol: 1000,
      baselineVolume: 100,
      metricKind: "time_adjusted",
    });
    const robust = assessRvolConfidence({
      rawRvol: 1000,
      baselineVolume: 500_000,
      metricKind: "time_adjusted",
    });
    expect(thin.rankingRvol!).toBeLessThan(robust.rankingRvol!);
  });
});
