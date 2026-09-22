import type {
  AmInboxLateSessionCandidate,
  AmInboxLateSessionView,
  LateSessionContinuationContext,
} from "@/lib/am-inbox/late-session-continuation-types";
import { resolveLateSessionExpiryState } from "@/lib/am-inbox/late-session-expiry";
import { listStoredLateSessionHandoffs, persistLateSessionHandoff } from "@/lib/am-inbox/late-session-handoff-storage";
import { readHistoricalWorkflowContext } from "@/lib/historical-workflow/workflow-handoff-storage";
import type { ContinuationCategory } from "@/config/continuation.config";

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

export function buildAmInboxLateSessionViewFromContexts(
  amSessionDate: string,
  contexts: readonly LateSessionContinuationContext[],
): AmInboxLateSessionView {
  const candidates: AmInboxLateSessionCandidate[] = [];
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
    candidates.push(merged);
    persistLateSessionHandoff(merged.context);
  }

  return {
    asOfSessionDate: amSessionDate,
    candidates,
    expiredCount,
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
