import type {
  AmInboxLateSessionCandidate,
  AmInboxLateSessionView,
  LateSessionContinuationContext,
} from "@/lib/am-inbox/late-session-continuation-types";
import { resolveLateSessionExpiryState } from "@/lib/am-inbox/late-session-expiry";
import { listStoredLateSessionHandoffs, persistLateSessionHandoff } from "@/lib/am-inbox/late-session-handoff-storage";
import { readHistoricalWorkflowContext } from "@/lib/historical-workflow/workflow-handoff-storage";
import type { ContinuationCategory } from "@/config/continuation.config";
import { CONTINUATION_CATEGORY_PRIORITY } from "@/config/continuation.config";

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

function pickPrimaryCategory(categories: readonly ContinuationCategory[]): ContinuationCategory {
  let best: ContinuationCategory = categories[0]!;
  let bestRank = CONTINUATION_CATEGORY_PRIORITY[best] ?? 0;
  for (const cat of categories) {
    const rank = CONTINUATION_CATEGORY_PRIORITY[cat] ?? 0;
    if (rank > bestRank) {
      best = cat;
      bestRank = rank;
    }
  }
  return best;
}

/** One card per symbol per source session — highest-priority category wins. */
export function collapseLateSessionCandidates(
  entries: readonly AmInboxLateSessionCandidate[],
): AmInboxLateSessionCandidate[] {
  const byKey = new Map<string, AmInboxLateSessionCandidate>();
  for (const entry of entries) {
    const key = `${entry.context.symbol}:${entry.context.sourceSessionDate}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, entry);
      continue;
    }
    const categories = [
      ...prev.sourceCategories,
      ...entry.sourceCategories,
      prev.context.sourceCategory,
      entry.context.sourceCategory,
    ];
    const unique = [...new Set(categories)] as ContinuationCategory[];
    const primary = pickPrimaryCategory(unique);
    const evidenceLabels = [
      ...new Set([...prev.context.evidenceLabels, ...entry.context.evidenceLabels]),
    ];
    byKey.set(key, {
      context: {
        ...prev.context,
        sourceCategory: primary,
        evidenceLabels,
        rvol: entry.context.rvol ?? prev.context.rvol,
        sessionMovePct: entry.context.sessionMovePct ?? prev.context.sessionMovePct,
      },
      workflow: entry.workflow ?? prev.workflow,
      sourceCategories: unique,
    });
  }
  return [...byKey.values()].sort((a, b) =>
    a.context.symbol.localeCompare(b.context.symbol),
  );
}

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

  const candidates = collapseLateSessionCandidates(raw);

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
