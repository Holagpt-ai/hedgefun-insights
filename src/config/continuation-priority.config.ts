/**
 * AM Inbox late-session continuation priority calibration.
 * Ranking score stays volume-first; priority is a selective band on top of qualified.
 */

/** Minimum composite score for any priority candidate (above weak handoff noise). */
export const CONTINUATION_PRIORITY_ABSOLUTE_FLOOR = 72;

/** Volume Is King — priority requires meaningful session liquidity, not category points alone. */
export const CONTINUATION_PRIORITY_MIN_VOLUME_KING = 70;

/** Priority requires score at or above this percentile within the qualified pool. */
export const CONTINUATION_PRIORITY_QUALIFIED_PERCENTILE = 85;

/** Percentile band applies only when the qualified pool is large enough to be meaningful. */
export const CONTINUATION_PRIORITY_MIN_QUALIFIED_FOR_PERCENTILE = 20;

export function percentileValue(sortedAsc: readonly number[], percentile: number): number {
  if (sortedAsc.length === 0) return CONTINUATION_PRIORITY_ABSOLUTE_FLOOR;
  const clamped = Math.min(100, Math.max(0, percentile));
  const index = Math.ceil((clamped / 100) * sortedAsc.length) - 1;
  return sortedAsc[Math.max(0, Math.min(sortedAsc.length - 1, index))]!;
}

export function resolveContinuationPriorityScoreCutoff(
  qualifiedScores: readonly number[],
): number {
  if (qualifiedScores.length === 0) {
    return CONTINUATION_PRIORITY_ABSOLUTE_FLOOR;
  }
  if (qualifiedScores.length < CONTINUATION_PRIORITY_MIN_QUALIFIED_FOR_PERCENTILE) {
    return CONTINUATION_PRIORITY_ABSOLUTE_FLOOR;
  }
  const sorted = [...qualifiedScores].sort((a, b) => a - b);
  const bandCutoff = percentileValue(sorted, CONTINUATION_PRIORITY_QUALIFIED_PERCENTILE);
  return Math.max(CONTINUATION_PRIORITY_ABSOLUTE_FLOOR, bandCutoff);
}

export function scoreDistributionSummary(scores: readonly number[]): {
  min: number;
  p25: number;
  median: number;
  p75: number;
  p85: number;
  p90: number;
  p95: number;
  max: number;
} {
  if (scores.length === 0) {
    return { min: 0, p25: 0, median: 0, p75: 0, p85: 0, p90: 0, p95: 0, max: 0 };
  }
  const sorted = [...scores].sort((a, b) => a - b);
  return {
    min: sorted[0]!,
    p25: percentileValue(sorted, 25),
    median: percentileValue(sorted, 50),
    p75: percentileValue(sorted, 75),
    p85: percentileValue(sorted, 85),
    p90: percentileValue(sorted, 90),
    p95: percentileValue(sorted, 95),
    max: sorted[sorted.length - 1]!,
  };
}
