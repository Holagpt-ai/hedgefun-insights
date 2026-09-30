import { CONTINUATION_MIN_SESSION_VOLUME } from "@/config/continuation.config";
import type { AmInboxLateSessionCandidate } from "@/lib/am-inbox/late-session-continuation-types";

/**
 * Handoff qualification for AM Inbox funnel semantics.
 * Requires meaningful session volume plus at least one continuation signal.
 */
export function qualifiesLateSessionHandoffCandidate(
  entry: AmInboxLateSessionCandidate,
): boolean {
  const { context } = entry;
  const volume = context.volume;
  if (volume === null || volume === undefined || !Number.isFinite(volume)) {
    return false;
  }
  if (volume < CONTINUATION_MIN_SESSION_VOLUME) return false;

  const hasRvol = context.rvol !== null && context.rvol !== undefined &&
    Number.isFinite(context.rvol) && context.rvol > 0;
  const hasHodEvidence = context.closeDistanceFromHodPct !== null &&
    context.closeDistanceFromHodPct !== undefined &&
    Number.isFinite(context.closeDistanceFromHodPct);
  const hasCategorySignal = entry.sourceCategories.length > 0;
  const hasEvidenceLabels = context.evidenceLabels.length > 0;

  return hasRvol || hasHodEvidence || hasCategorySignal || hasEvidenceLabels;
}
