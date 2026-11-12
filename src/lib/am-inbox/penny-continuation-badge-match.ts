/**
 * Optional AM Inbox badge matcher — not wired to live fetching or rendering.
 */

import {
  pennyBadgeMatchesAmInboxCandidate,
  validatePennyBadgeForHandoff,
} from "@/lib/am-inbox/penny-continuation-badge-integrity";
import { firstAmSessionDateAfterSource } from "@/lib/am-inbox/late-session-expiry";
import type {
  AmInboxPennyBadgeMatchTarget,
  PennyContinuationBadgeAttachment,
  PennyContinuationBadgeMatchResult,
  PennyContinuationWorkflowHandoff,
} from "@/lib/am-inbox/penny-continuation-workflow-types";

function normalizeSymbol(raw: string): string {
  return raw.trim().toUpperCase();
}

function handoffKey(handoff: PennyContinuationWorkflowHandoff): string {
  const idem = handoff.publicationIdempotencyKey ?? "na";
  return `${handoff.sourceSessionDate}:${handoff.symbol}:${idem}`;
}

function handoffHasVerifiedNextSessionCarry(
  handoff: PennyContinuationWorkflowHandoff,
): boolean {
  if (handoff.supplementalLabels.includes("next_session_carry")) return true;
  if (handoff.badge?.supplementalLabels.includes("next_session_carry")) return true;
  return false;
}

function liveEvidenceAllowedForAmSession(
  handoff: PennyContinuationWorkflowHandoff,
  amSessionDate: string,
): boolean {
  if (handoff.qualificationEvidenceKind === "prior_session_capture") {
    return true;
  }
  if (handoff.qualificationEvidenceKind !== "live_market") {
    return false;
  }
  if (handoff.sourceSessionDate === amSessionDate) {
    return true;
  }
  if (!handoffHasVerifiedNextSessionCarry(handoff)) {
    return false;
  }
  const carryAmSession = firstAmSessionDateAfterSource(handoff.sourceSessionDate);
  return amSessionDate === carryAmSession;
}

/**
 * Attach at most one Penny badge per candidate and per handoff key.
 * Does not alter candidate categories, volume order, or Five Pillars eligibility.
 */
export function matchPennyContinuationBadgesToAmInbox(input: {
  handoffs: readonly PennyContinuationWorkflowHandoff[];
  candidates: readonly AmInboxPennyBadgeMatchTarget[];
  amSessionDate: string;
  /** When true, badges attach even when publicationSuppressed (notification dedupe only). */
  attachWhenPublicationSuppressed?: boolean;
}): PennyContinuationBadgeMatchResult {
  const attachSuppressed = input.attachWhenPublicationSuppressed !== false;
  const attachments: PennyContinuationBadgeAttachment[] = [];
  const unmatchedHandoffKeys: string[] = [];
  const usedCandidates = new Set<string>();
  const usedHandoffs = new Set<string>();

  for (const handoff of input.handoffs) {
    const key = handoffKey(handoff);
    if (
      !handoff.continuationQualified ||
      !handoff.badge ||
      !validatePennyBadgeForHandoff(handoff.badge, handoff)
    ) {
      unmatchedHandoffKeys.push(key);
      continue;
    }
    if (handoff.publicationSuppressed && !attachSuppressed) {
      unmatchedHandoffKeys.push(key);
      continue;
    }
    if (usedHandoffs.has(key)) {
      unmatchedHandoffKeys.push(key);
      continue;
    }
    if (!liveEvidenceAllowedForAmSession(handoff, input.amSessionDate)) {
      unmatchedHandoffKeys.push(key);
      continue;
    }

    const sym = normalizeSymbol(handoff.symbol);
    const match = input.candidates.find((c) => {
      if (usedCandidates.has(c.candidateKey)) return false;
      if (c.expiryState !== "active") return false;
      if (normalizeSymbol(c.symbol) !== sym) return false;
      if (c.sourceSessionDate !== handoff.sourceSessionDate) return false;
      return true;
    });

    if (!match || !pennyBadgeMatchesAmInboxCandidate(handoff, match)) {
      unmatchedHandoffKeys.push(key);
      continue;
    }

    usedHandoffs.add(key);
    usedCandidates.add(match.candidateKey);
    const attachment: PennyContinuationBadgeAttachment = {
      handoffKey: key,
      matchedCandidateKey: match.candidateKey,
      badge: handoff.badge,
      publicationSuppressed: handoff.publicationSuppressed,
      qualificationEvidenceKind: handoff.qualificationEvidenceKind,
    };
    attachments.push(attachment);
  }

  return {
    attachments,
    unmatchedHandoffKeys,
    candidates: input.candidates,
  };
}
