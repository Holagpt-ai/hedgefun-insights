/**
 * Client mirror — badge integrity for AM Inbox matching (Batch 225).
 */

import type {
  PennyAmInboxBadgePayload,
  PennyContinuationWorkflowHandoff,
} from "@/lib/am-inbox/penny-continuation-workflow-types";
import type { AmInboxPennyBadgeMatchTarget } from "@/lib/am-inbox/penny-continuation-workflow-types";

const SUPPORTED_BADGE_KIND = "penny_continuation_v1" as const;
const SUPPORTED_MODEL_VERSION = "penny_continuation_v1";

function normalizeSymbol(raw: string): string {
  return raw.trim().toUpperCase();
}

export function validatePennyBadgeForHandoff(
  badge: PennyAmInboxBadgePayload | null,
  handoff: PennyContinuationWorkflowHandoff,
): boolean {
  if (!badge || !handoff.continuationQualified) return false;
  if (badge.kind !== SUPPORTED_BADGE_KIND) return false;
  if (badge.model_version !== SUPPORTED_MODEL_VERSION) return false;
  if (badge.model_version !== handoff.model_version) return false;
  if (!badge.continuationQualified) return false;
  const sym = normalizeSymbol(badge.symbol);
  const handoffSym = normalizeSymbol(handoff.symbol);
  if (sym !== handoffSym) return false;
  if (badge.sessionDate !== handoff.sourceSessionDate) return false;
  if (handoff.dataFreshnessLabel === "stale") return false;
  return true;
}

export function pennyBadgeMatchesAmInboxCandidate(
  handoff: PennyContinuationWorkflowHandoff,
  candidate: AmInboxPennyBadgeMatchTarget,
): boolean {
  if (!validatePennyBadgeForHandoff(handoff.badge, handoff)) return false;
  const sym = normalizeSymbol(handoff.symbol);
  const candSym = normalizeSymbol(candidate.symbol);
  if (sym !== candSym) return false;
  if (handoff.sourceSessionDate !== candidate.sourceSessionDate) return false;
  if (handoff.badge!.sessionDate !== candidate.sourceSessionDate) return false;
  return true;
}
