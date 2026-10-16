import type { AmInboxLateSessionCandidate } from "@/lib/am-inbox/late-session-continuation-types";
import type { ContinuationCategory } from "@/config/continuation.config";
import { CONTINUATION_CATEGORY_PRIORITY } from "@/config/continuation.config";
import { rankAmInboxLateSessionCandidates } from "@/lib/am-inbox/am-inbox-late-session-priority";

export function continuationCandidateIdentityKey(
  entry: AmInboxLateSessionCandidate,
): string {
  const { context } = entry;
  if (context.securityId) {
    return `${context.securityId}:${context.sourceSessionDate}`;
  }
  return `sym:${context.symbol}:${context.sourceSessionDate}`;
}

function captureTimestampMs(entry: AmInboxLateSessionCandidate): number | null {
  const ms = Date.parse(entry.context.sourceTimestamp);
  return Number.isFinite(ms) ? ms : null;
}

/** Newer captures sort first (deterministic tie-break by symbol). */
export function compareLateSessionCaptureRecency(
  a: AmInboxLateSessionCandidate,
  b: AmInboxLateSessionCandidate,
): number {
  const ta = captureTimestampMs(a);
  const tb = captureTimestampMs(b);
  if (ta !== null && tb !== null && ta !== tb) return tb - ta;
  if (ta !== null && tb === null) return -1;
  if (ta === null && tb !== null) return 1;
  return a.context.symbol.localeCompare(b.context.symbol);
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

function securityIdentityConflict(
  a: AmInboxLateSessionCandidate,
  b: AmInboxLateSessionCandidate,
): boolean {
  const idA = a.context.securityId;
  const idB = b.context.securityId;
  return Boolean(idA && idB && idA !== idB);
}

/**
 * Merge two captures for the same session identity. Returns null when security IDs conflict.
 * Newer capture wins field values; categories and evidence labels union.
 */
export function mergeLateSessionCandidateEntries(
  prev: AmInboxLateSessionCandidate,
  entry: AmInboxLateSessionCandidate,
): AmInboxLateSessionCandidate | null {
  if (securityIdentityConflict(prev, entry)) return null;

  const newer = compareLateSessionCaptureRecency(prev, entry) <= 0 ? prev : entry;
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

  return {
    context: {
      ...newer.context,
      sourceCategory: primary,
      evidenceLabels,
    },
    workflow: newer.workflow ?? prev.workflow,
    sourceCategories: unique,
  };
}

/** One card per verified identity (or symbol) per source session — newest capture wins. */
export function collapseLateSessionCandidates(
  entries: readonly AmInboxLateSessionCandidate[],
): AmInboxLateSessionCandidate[] {
  const sorted = [...entries].sort(compareLateSessionCaptureRecency);
  const byKey = new Map<string, AmInboxLateSessionCandidate>();
  const conflictExtras: AmInboxLateSessionCandidate[] = [];

  for (const entry of sorted) {
    const key = continuationCandidateIdentityKey(entry);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, entry);
      continue;
    }
    const merged = mergeLateSessionCandidateEntries(prev, entry);
    if (merged) {
      byKey.set(key, merged);
    } else {
      conflictExtras.push(entry);
    }
  }

  return rankAmInboxLateSessionCandidates([...byKey.values(), ...conflictExtras]);
}
