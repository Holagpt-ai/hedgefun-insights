import { describe, expect, it, vi } from "vitest";
import { buildLateSessionContinuationContext } from "@/lib/am-inbox/build-late-session-continuation-context";
import type { AmInboxLateSessionCandidate } from "@/lib/am-inbox/late-session-continuation-types";
import { buildLateSessionContinuationFunnel } from "@/lib/am-inbox/am-inbox-late-session-view";
import { buildLateSessionPriorityEvaluation } from "@/lib/am-inbox/late-session-priority-evaluation";
import * as lateSessionPriority from "@/lib/am-inbox/am-inbox-late-session-priority";
import {
  computeAmInboxLateSessionPriorityScore,
  continuationVolumeKingComponent,
  rankAmInboxLateSessionCandidates,
} from "@/lib/am-inbox/am-inbox-late-session-priority";
import { qualifiesLateSessionHandoffCandidate } from "@/lib/am-inbox/late-session-handoff-qualification";
import {
  CONTINUATION_PRIORITY_ABSOLUTE_FLOOR,
  CONTINUATION_PRIORITY_MIN_VOLUME_KING,
  resolveContinuationPriorityScoreCutoff,
} from "@/config/continuation-priority.config";

const POOL_SIZE = 850;

function candidate(symbol: string, volume: number, rvol: number): AmInboxLateSessionCandidate {
  return {
    context: buildLateSessionContinuationContext({
      symbol,
      sourceSessionDate: "2026-10-26",
      sourceTimestamp: "2026-10-26T20:00:00.000Z",
      sourceCategory: "POWER_HOUR_MOMENTUM",
      volume,
      rvol,
      rvolMetricKind: "rvol_20d",
      dollarVolume: volume * 12,
    }),
    workflow: null,
    sourceCategories: ["POWER_HOUR_MOMENTUM"],
  };
}

/** Pre-184.1 reference: recompute cutoff from the full pool on every priority check. */
function naiveIsLateSessionPriorityCandidate(
  entry: AmInboxLateSessionCandidate,
  qualifiedPool: readonly AmInboxLateSessionCandidate[],
): boolean {
  if (!qualifiesLateSessionHandoffCandidate(entry)) return false;
  if (continuationVolumeKingComponent(entry) < CONTINUATION_PRIORITY_MIN_VOLUME_KING) {
    return false;
  }
  const score = computeAmInboxLateSessionPriorityScore(entry);
  if (score < CONTINUATION_PRIORITY_ABSOLUTE_FLOOR) return false;
  const cutoff = resolveContinuationPriorityScoreCutoff(
    qualifiedPool.map((row) => computeAmInboxLateSessionPriorityScore(row)),
  );
  return score >= cutoff;
}

function naiveBuildLateSessionContinuationFunnel(
  detected: readonly AmInboxLateSessionCandidate[],
  collapsed: readonly AmInboxLateSessionCandidate[],
) {
  const qualified = collapsed.filter(qualifiesLateSessionHandoffCandidate);
  const qualifiedRanked = rankAmInboxLateSessionCandidates(qualified);
  const priority = qualifiedRanked.filter((entry) =>
    naiveIsLateSessionPriorityCandidate(entry, qualifiedRanked),
  );
  const qualifiedNonPriority = qualifiedRanked.filter(
    (entry) => !naiveIsLateSessionPriorityCandidate(entry, qualifiedRanked),
  );
  return {
    priority,
    qualifiedForViewAll: [...priority, ...qualifiedNonPriority],
    qualifiedRanked,
  };
}

function buildLargePool(): AmInboxLateSessionCandidate[] {
  return Array.from({ length: POOL_SIZE }, (_, i) => {
    const tier = i % 5;
    const volume = (tier + 1) * 250_000 + (i % 17) * 10_000;
    const rvol = 0.5 + (i % 40) * 0.15;
    return candidate(`SYM${i.toString().padStart(4, "0")}`, volume, rvol);
  });
}

describe("Batch 184.1 — late-session priority evaluation at scale", () => {
  it("matches naive priority classification and ordering for 850 candidates", () => {
    const collapsed = buildLargePool();
    const naive = naiveBuildLateSessionContinuationFunnel(collapsed, collapsed);
    const optimized = buildLateSessionContinuationFunnel(collapsed, collapsed);

    expect(optimized.priority.map((e) => e.context.symbol)).toEqual(
      naive.priority.map((e) => e.context.symbol),
    );
    expect(optimized.qualifiedForViewAll.map((e) => e.context.symbol)).toEqual(
      naive.qualifiedForViewAll.map((e) => e.context.symbol),
    );
    expect(optimized.funnel.priorityCount).toBe(naive.priority.length);
    expect(optimized.funnel.qualifiedCount).toBe(naive.qualifiedRanked.length);
  });

  it("reduces score computations for priority band vs naive double-pass cutoff remaps", () => {
    const collapsed = buildLargePool();
    const qualified = collapsed.filter(qualifiesLateSessionHandoffCandidate);
    const qualifiedRanked = rankAmInboxLateSessionCandidates(qualified);

    const scoreSpy = vi.spyOn(lateSessionPriority, "computeAmInboxLateSessionPriorityScore");

    const evaluation = buildLateSessionPriorityEvaluation(qualifiedRanked);
    const optimizedPriorityPassCalls = scoreSpy.mock.calls.length;

    scoreSpy.mockClear();
    for (const entry of qualifiedRanked) {
      naiveIsLateSessionPriorityCandidate(entry, qualifiedRanked);
    }
    for (const entry of qualifiedRanked) {
      naiveIsLateSessionPriorityCandidate(entry, qualifiedRanked);
    }
    const naiveTwoPassCalls = scoreSpy.mock.calls.length;

    expect(evaluation.scoreComputationCount).toBe(qualifiedRanked.length);
    expect(optimizedPriorityPassCalls).toBe(qualifiedRanked.length);
    expect(naiveTwoPassCalls).toBeGreaterThanOrEqual(qualifiedRanked.length * qualifiedRanked.length);
    expect(optimizedPriorityPassCalls).toBeLessThan(naiveTwoPassCalls / qualifiedRanked.length);

    scoreSpy.mockRestore();
  });
});
