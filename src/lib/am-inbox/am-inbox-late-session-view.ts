import type { AmInboxLateSessionCandidate, AmInboxLateSessionView } from "@/lib/am-inbox/late-session-continuation-types";
import { resolveLateSessionExpiryState } from "@/lib/am-inbox/late-session-expiry";
import { listStoredLateSessionHandoffs } from "@/lib/am-inbox/late-session-handoff-storage";
import { readHistoricalWorkflowContext } from "@/lib/historical-workflow/workflow-handoff-storage";
import type { ContinuationCategory } from "@/config/continuation.config";

export function buildAmInboxLateSessionView(amSessionDate: string): AmInboxLateSessionView {
  const stored = listStoredLateSessionHandoffs();
  const candidates: AmInboxLateSessionCandidate[] = [];
  let expiredCount = 0;

  for (const entry of stored) {
    const expiry = resolveLateSessionExpiryState({
      sourceSessionDate: entry.context.sourceSessionDate,
      sourceCategory: entry.context.sourceCategory,
      amSessionDate,
    });
    if (expiry.expiryState === "expired") {
      expiredCount += 1;
      continue;
    }

    const workflow = readHistoricalWorkflowContext(entry.context.symbol);
    candidates.push({
      context: {
        ...entry.context,
        ...expiry,
        securityId: entry.context.securityId ?? workflow?.securityId ?? null,
        historicalContextAvailable: workflow?.historicalContextAvailable ?? entry.context.historicalContextAvailable,
        evidenceLabels: workflow?.evidenceLabels ?? entry.context.evidenceLabels,
        sampleSizeQuality: workflow?.sampleSizeQuality ?? entry.context.sampleSizeQuality,
        comparableEpisodeCount: workflow?.comparableEpisodeCount ?? entry.context.comparableEpisodeCount,
        mostRecentComparableDate: workflow?.mostRecentComparableDate ?? entry.context.mostRecentComparableDate,
        profileFreshness: workflow?.profileFreshness ?? entry.context.profileFreshness,
      },
      workflow,
      sourceCategories: [entry.context.sourceCategory] as readonly ContinuationCategory[],
    });
  }

  // Preserve stored order — no historical re-ranking.
  return {
    asOfSessionDate: amSessionDate,
    candidates,
    expiredCount,
  };
}
