import type {
  AmInboxLateSessionCandidate,
  AmInboxLateSessionView,
  LateSessionContinuationContext,
  LateSessionContinuationFunnel,
} from "@/lib/am-inbox/late-session-continuation-types";
import { resolveLateSessionExpiryState } from "@/lib/am-inbox/late-session-expiry";
import { listStoredLateSessionHandoffs, persistLateSessionHandoff } from "@/lib/am-inbox/late-session-handoff-storage";
import { readHistoricalWorkflowContext } from "@/lib/historical-workflow/workflow-handoff-storage";
import { collapseLateSessionCandidates } from "@/lib/am-inbox/late-session-candidate-collapse";
import type { ContinuationCategory } from "@/config/continuation.config";
import {
  computeAmInboxLateSessionPriorityScore,
  continuationVolumeKingComponent,
  rankAmInboxLateSessionCandidates,
} from "@/lib/am-inbox/am-inbox-late-session-priority";
import { AM_INBOX_LATE_SESSION_VISIBLE_LIMIT } from "@/config/late-session-handoff.config";
import { qualifiesLateSessionHandoffCandidate } from "@/lib/am-inbox/late-session-handoff-qualification";
import {
  CONTINUATION_PRIORITY_ABSOLUTE_FLOOR,
  CONTINUATION_PRIORITY_MIN_VOLUME_KING,
  resolveContinuationPriorityScoreCutoff,
} from "@/config/continuation-priority.config";

/** @deprecated Use CONTINUATION_PRIORITY_ABSOLUTE_FLOOR + qualified percentile band. */
export const CONTINUATION_PRIORITY_SCORE_FLOOR = CONTINUATION_PRIORITY_ABSOLUTE_FLOOR;

export function isLateSessionPriorityCandidate(
  entry: AmInboxLateSessionCandidate,
  qualifiedPool?: readonly AmInboxLateSessionCandidate[],
): boolean {
  if (!qualifiesLateSessionHandoffCandidate(entry)) return false;
  if (continuationVolumeKingComponent(entry) < CONTINUATION_PRIORITY_MIN_VOLUME_KING) {
    return false;
  }
  const score = computeAmInboxLateSessionPriorityScore(entry);
  if (score < CONTINUATION_PRIORITY_ABSOLUTE_FLOOR) return false;
  if (!qualifiedPool || qualifiedPool.length === 0) {
    return score >= CONTINUATION_PRIORITY_ABSOLUTE_FLOOR;
  }
  const cutoff = resolveContinuationPriorityScoreCutoff(
    qualifiedPool.map((candidate) => computeAmInboxLateSessionPriorityScore(candidate)),
  );
  return score >= cutoff;
}

export function buildLateSessionContinuationFunnel(
  detected: readonly AmInboxLateSessionCandidate[],
  collapsed: readonly AmInboxLateSessionCandidate[],
): {
  qualified: AmInboxLateSessionCandidate[];
  priority: AmInboxLateSessionCandidate[];
  qualifiedForViewAll: AmInboxLateSessionCandidate[];
  defaultDisplay: AmInboxLateSessionCandidate[];
  funnel: LateSessionContinuationFunnel;
} {
  const qualified = collapsed.filter(qualifiesLateSessionHandoffCandidate);
  const qualifiedRanked = rankAmInboxLateSessionCandidates(qualified);
  const priority = qualifiedRanked.filter((entry) =>
    isLateSessionPriorityCandidate(entry, qualifiedRanked),
  );
  const qualifiedNonPriority = qualifiedRanked.filter(
    (entry) => !isLateSessionPriorityCandidate(entry, qualifiedRanked),
  );
  const qualifiedForViewAll = [...priority, ...qualifiedNonPriority];
  const priorityCount = priority.length;
  const displayUsesQualifiedFallback = priorityCount === 0 && qualifiedRanked.length > 0;
  const defaultDisplay = (displayUsesQualifiedFallback ? qualifiedRanked : priority).slice(
    0,
    AM_INBOX_LATE_SESSION_VISIBLE_LIMIT,
  );
  const displayedCount = defaultDisplay.length;

  return {
    qualified: qualifiedRanked,
    priority,
    qualifiedForViewAll,
    defaultDisplay,
    funnel: {
      detectedCount: detected.length,
      qualifiedCount: qualified.length,
      priorityCount,
      displayedCount,
      displayUsesQualifiedFallback,
    },
  };
}

function mergeContextWithWorkflow(
  context: LateSessionContinuationContext,
  amSessionDate: string,
): AmInboxLateSessionCandidate | null {
  const expiry = resolveLateSessionExpiryState({
    sourceSessionDate: context.sourceSessionDate,
    sourceCategory: context.sourceCategory,
    amSessionDate,
  });
  if (expiry.expiryState === "expired") return null;

  const workflow = readHistoricalWorkflowContext(context.symbol);
  return {
    context: {
      ...context,
      ...expiry,
      securityId: context.securityId ?? workflow?.securityId ?? null,
      historicalContextAvailable:
        workflow?.historicalContextAvailable ?? context.historicalContextAvailable,
      evidenceLabels: workflow?.evidenceLabels ?? context.evidenceLabels,
      sampleSizeQuality: workflow?.sampleSizeQuality ?? context.sampleSizeQuality,
      comparableEpisodeCount:
        workflow?.comparableEpisodeCount ?? context.comparableEpisodeCount,
      mostRecentComparableDate:
        workflow?.mostRecentComparableDate ?? context.mostRecentComparableDate,
      profileFreshness: workflow?.profileFreshness ?? context.profileFreshness,
    },
    workflow,
    sourceCategories: [context.sourceCategory] as readonly ContinuationCategory[],
  };
}

export { collapseLateSessionCandidates } from "@/lib/am-inbox/late-session-candidate-collapse";

export function buildAmInboxLateSessionViewFromContexts(
  amSessionDate: string,
  contexts: readonly LateSessionContinuationContext[],
): AmInboxLateSessionView {
  const raw: AmInboxLateSessionCandidate[] = [];
  let expiredCount = 0;
  const seen = new Set<string>();

  for (const context of contexts) {
    const merged = mergeContextWithWorkflow(context, amSessionDate);
    if (!merged) {
      expiredCount += 1;
      continue;
    }
    const key = `${merged.context.symbol}:${merged.context.sourceSessionDate}:${merged.context.sourceCategory}`;
    if (seen.has(key)) continue;
    seen.add(key);
    raw.push(merged);
    persistLateSessionHandoff(merged.context);
  }

  const collapsed = collapseLateSessionCandidates(raw);
  const { defaultDisplay, qualifiedForViewAll, funnel } = buildLateSessionContinuationFunnel(
    raw,
    collapsed,
  );

  return {
    asOfSessionDate: amSessionDate,
    candidates: defaultDisplay,
    qualifiedCandidates: qualifiedForViewAll,
    expiredCount,
    funnel,
  };
}

/** Legacy sessionStorage-only path (tests / offline mirror). Production uses server fetch + this merge. */
export function buildAmInboxLateSessionView(amSessionDate: string): AmInboxLateSessionView {
  const stored = listStoredLateSessionHandoffs();
  return buildAmInboxLateSessionViewFromContexts(
    amSessionDate,
    stored.map((entry) => entry.context),
  );
}
