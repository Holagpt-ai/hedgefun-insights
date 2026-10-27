import type { AmInboxLateSessionCandidate } from "@/lib/am-inbox/late-session-continuation-types";
import {
  computeAmInboxLateSessionPriorityScore,
  continuationVolumeKingComponent,
} from "@/lib/am-inbox/am-inbox-late-session-priority";
import { qualifiesLateSessionHandoffCandidate } from "@/lib/am-inbox/late-session-handoff-qualification";
import {
  CONTINUATION_PRIORITY_ABSOLUTE_FLOOR,
  CONTINUATION_PRIORITY_MIN_VOLUME_KING,
  resolveContinuationPriorityScoreCutoff,
} from "@/config/continuation-priority.config";

export type LateSessionPriorityEvaluation = {
  readonly cutoff: number;
  readonly scoreFor: (entry: AmInboxLateSessionCandidate) => number;
  readonly volumeKingFor: (entry: AmInboxLateSessionCandidate) => number;
  readonly isPriority: (entry: AmInboxLateSessionCandidate) => boolean;
  /** One {@link computeAmInboxLateSessionPriorityScore} call per qualified row. */
  readonly scoreComputationCount: number;
};

/**
 * Precompute priority scores, volume-king components, and the qualified-pool cutoff once.
 */
export function buildLateSessionPriorityEvaluation(
  qualifiedPool: readonly AmInboxLateSessionCandidate[],
): LateSessionPriorityEvaluation {
  const scoreByEntry = new WeakMap<AmInboxLateSessionCandidate, number>();
  const volumeKingByEntry = new WeakMap<AmInboxLateSessionCandidate, number>();
  const scores: number[] = [];
  let scoreComputationCount = 0;

  for (const entry of qualifiedPool) {
    const score = computeAmInboxLateSessionPriorityScore(entry);
    scoreComputationCount += 1;
    scoreByEntry.set(entry, score);
    volumeKingByEntry.set(entry, continuationVolumeKingComponent(entry));
    scores.push(score);
  }

  const cutoff = resolveContinuationPriorityScoreCutoff(scores);

  const isPriority = (entry: AmInboxLateSessionCandidate): boolean => {
    if (!qualifiesLateSessionHandoffCandidate(entry)) return false;
    const volumeKing = volumeKingByEntry.get(entry) ?? continuationVolumeKingComponent(entry);
    if (volumeKing < CONTINUATION_PRIORITY_MIN_VOLUME_KING) return false;
    const score = scoreByEntry.get(entry) ?? computeAmInboxLateSessionPriorityScore(entry);
    if (score < CONTINUATION_PRIORITY_ABSOLUTE_FLOOR) return false;
    if (qualifiedPool.length === 0) return score >= CONTINUATION_PRIORITY_ABSOLUTE_FLOOR;
    return score >= cutoff;
  };

  return {
    cutoff,
    scoreFor: (entry) => scoreByEntry.get(entry) ?? computeAmInboxLateSessionPriorityScore(entry),
    volumeKingFor: (entry) =>
      volumeKingByEntry.get(entry) ?? continuationVolumeKingComponent(entry),
    isPriority,
    scoreComputationCount,
  };
}
