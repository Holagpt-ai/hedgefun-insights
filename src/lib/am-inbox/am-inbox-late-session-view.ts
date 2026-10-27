import type {
  AmInboxLateSessionCandidate,
  AmInboxLateSessionView,
  LateSessionContinuationContext,
  LateSessionContinuationFunnel,
} from "@/lib/am-inbox/late-session-continuation-types";
import { resolveLateSessionExpiryState } from "@/lib/am-inbox/late-session-expiry";
import {
  listStoredLateSessionHandoffs,
  persistLateSessionHandoffBatch,
} from "@/lib/am-inbox/late-session-handoff-storage";
import { readHistoricalWorkflowContext } from "@/lib/historical-workflow/workflow-handoff-storage";
import { enrichHandoffContextFromHistoricalWorkflow } from "@/lib/am-inbox/late-session-workflow-handoff";
import { collapseLateSessionCandidates } from "@/lib/am-inbox/late-session-candidate-collapse";
import type { ContinuationCategory } from "@/config/continuation.config";
import {
  computeAmInboxLateSessionPriorityScore,
  continuationVolumeKingComponent,
  rankAmInboxLateSessionCandidates,
} from "@/lib/am-inbox/am-inbox-late-session-priority";
import {
  buildLateSessionPriorityEvaluation,
  type LateSessionPriorityEvaluation,
} from "@/lib/am-inbox/late-session-priority-evaluation";
import { AM_INBOX_LATE_SESSION_VISIBLE_LIMIT } from "@/config/late-session-handoff.config";
import { qualifiesLateSessionHandoffCandidate } from "@/lib/am-inbox/late-session-handoff-qualification";
import {
  CONTINUATION_PRIORITY_ABSOLUTE_FLOOR,
  CONTINUATION_PRIORITY_MIN_VOLUME_KING,
} from "@/config/continuation-priority.config";

export type { LateSessionPriorityEvaluation } from "@/lib/am-inbox/late-session-priority-evaluation";
export { buildLateSessionPriorityEvaluation } from "@/lib/am-inbox/late-session-priority-evaluation";

/** @deprecated Use CONTINUATION_PRIORITY_ABSOLUTE_FLOOR + qualified percentile band. */
export const CONTINUATION_PRIORITY_SCORE_FLOOR = CONTINUATION_PRIORITY_ABSOLUTE_FLOOR;

export function isLateSessionPriorityCandidate(
  entry: AmInboxLateSessionCandidate,
  qualifiedPool?: readonly AmInboxLateSessionCandidate[],
  evaluation?: LateSessionPriorityEvaluation,
): boolean {
  if (evaluation) return evaluation.isPriority(entry);
  if (!qualifiedPool || qualifiedPool.length === 0) {
    if (!qualifiesLateSessionHandoffCandidate(entry)) return false;
    if (continuationVolumeKingComponent(entry) < CONTINUATION_PRIORITY_MIN_VOLUME_KING) {
      return false;
    }
    const score = computeAmInboxLateSessionPriorityScore(entry);
    return score >= CONTINUATION_PRIORITY_ABSOLUTE_FLOOR;
  }
  return buildLateSessionPriorityEvaluation(qualifiedPool).isPriority(entry);
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
  const priorityEval = buildLateSessionPriorityEvaluation(qualifiedRanked);
  const priority: AmInboxLateSessionCandidate[] = [];
  const qualifiedNonPriority: AmInboxLateSessionCandidate[] = [];
  for (const entry of qualifiedRanked) {
    if (priorityEval.isPriority(entry)) priority.push(entry);
    else qualifiedNonPriority.push(entry);
  }
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
  const enriched = enrichHandoffContextFromHistoricalWorkflow(
    { ...context, ...expiry },
    workflow,
  );
  return {
    context: enriched.context,
    workflow: enriched.workflow,
    sourceCategories: [context.sourceCategory] as readonly ContinuationCategory[],
  };
}

export { collapseLateSessionCandidates } from "@/lib/am-inbox/late-session-candidate-collapse";

export type BuildAmInboxLateSessionViewOptions = {
  /**
   * Mirror collapsed rows into sessionStorage for offline/tests.
   * Server-driven AM Inbox should disable this — large Monday captures otherwise
   * block the main thread on every refetch.
   */
  mirrorCollapsedToSessionStorage?: boolean;
};

export function buildAmInboxLateSessionViewFromContexts(
  amSessionDate: string,
  contexts: readonly LateSessionContinuationContext[],
  options: BuildAmInboxLateSessionViewOptions = {},
): AmInboxLateSessionView {
  const mirrorCollapsed = options.mirrorCollapsedToSessionStorage !== false;
  const raw: AmInboxLateSessionCandidate[] = [];
  let expiredCount = 0;

  for (const context of contexts) {
    const merged = mergeContextWithWorkflow(context, amSessionDate);
    if (!merged) {
      expiredCount += 1;
      continue;
    }
    raw.push(merged);
  }

  const collapsed = collapseLateSessionCandidates(raw);
  if (mirrorCollapsed) {
    persistLateSessionHandoffBatch(collapsed.map((entry) => entry.context));
  }
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
