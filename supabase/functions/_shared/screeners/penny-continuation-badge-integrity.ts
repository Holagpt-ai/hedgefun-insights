/**
 * Batch 225 — badge and handoff integrity guards (no scoring changes).
 */

import { PENNY_CONTINUATION_MODEL_VERSION } from "../config/penny-continuation.config.ts";
import type {
  PennyAmInboxBadgePayload,
  PennyContinuationResult,
  PennyReasonCode,
} from "./penny-continuation-types.ts";
import { normalizeSymbol } from "./selection.ts";

const SUPPORTED_BADGE_KIND = "penny_continuation_v1" as const;

const STALE_OR_INVALID_REASONS = new Set<PennyReasonCode>([
  "OBSERVATION_STALE",
  "CACHE_GENERATION_STALE",
  "INVALID_OBSERVATION_TS",
  "SYMBOL_OBSERVATION_SESSION_MISMATCH",
  "GENERATION_EVIDENCE_UNAVAILABLE",
  "PROVIDER_DELAY_UNKNOWN",
  "MISSING_OBSERVATION_TS",
  "DATA_UNAVAILABLE",
]);

export function pennyResultHasStaleOrInvalidEvidence(
  result: PennyContinuationResult,
): boolean {
  if (!result.qualifies || !result.continuationQualified) return true;
  if (result.dataFreshnessLabel === "stale") return true;
  return result.reasons.some((r) => STALE_OR_INVALID_REASONS.has(r));
}

export function pennyResultSessionConflictsIntegration(
  result: PennyContinuationResult,
  integrationSessionDate: string,
): boolean {
  const sessionDate = result.sessionDate;
  if (!sessionDate) return true;
  return sessionDate !== integrationSessionDate;
}

export function validatePennyAmInboxBadgePayload(
  badge: PennyAmInboxBadgePayload,
  expected: {
    symbol: string;
    sourceSessionDate: string;
  },
): boolean {
  if (badge.kind !== SUPPORTED_BADGE_KIND) return false;
  if (badge.model_version !== PENNY_CONTINUATION_MODEL_VERSION) return false;
  if (!badge.continuationQualified) return false;
  const sym = normalizeSymbol(badge.symbol);
  const expectedSym = normalizeSymbol(expected.symbol);
  if (!sym || !expectedSym || sym !== expectedSym) return false;
  if (badge.sessionDate !== expected.sourceSessionDate) return false;
  return true;
}

export function pennyHandoffProjectionAllowed(
  result: PennyContinuationResult,
  integrationSessionDate: string,
): boolean {
  if (pennyResultHasStaleOrInvalidEvidence(result)) return false;
  if (pennyResultSessionConflictsIntegration(result, integrationSessionDate)) {
    return false;
  }
  return true;
}
