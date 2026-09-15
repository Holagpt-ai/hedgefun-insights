/**
 * Validated 52-week baseline policy-exclusion evidence.
 * Distinguishes symbols observed during the trailing window but below
 * BASELINE_MIN_SESSIONS from unresolved missing coverage.
 */

import { normalizeSymbol } from "./selection.ts";

export const POLICY_EXCLUSION_REASON_INSUFFICIENT_SESSIONS =
  "insufficient_sessions" as const;

export type PolicyExclusionReason =
  typeof POLICY_EXCLUSION_REASON_INSUFFICIENT_SESSIONS;

export type PolicyExclusionRow = {
  generation_id: string;
  symbol: string;
  reason: string;
  sessions_observed: number;
  min_sessions: number;
};

export type PolicyExclusionEvidence = {
  available: boolean;
  min_sessions: number | null;
  excluded_count: number | null;
  symbols: ReadonlySet<string>;
};

export const POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE: PolicyExclusionEvidence = {
  available: false,
  min_sessions: null,
  excluded_count: null,
  symbols: new Set(),
};

export function isRecognizedPolicyExclusionReason(
  value: unknown,
): value is PolicyExclusionReason {
  return value === POLICY_EXCLUSION_REASON_INSUFFICIENT_SESSIONS;
}

export function parseStatePolicyExclusionFields(
  row: Record<string, unknown> | null | undefined,
): { min_sessions: number; excluded_count: number } | null {
  if (!row) return null;
  const min = Number(row.policy_min_sessions);
  const count = Number(row.policy_excluded_count);
  if (!Number.isInteger(min) || min < 1) return null;
  if (!Number.isInteger(count) || count < 0) return null;
  return { min_sessions: min, excluded_count: count };
}

function isValidExclusionRow(
  row: PolicyExclusionRow,
  generationId: string,
  minSessions: number,
): boolean {
  if (row.generation_id !== generationId) return false;
  const symbol = normalizeSymbol(row.symbol);
  if (!symbol || symbol !== row.symbol) return false;
  if (!isRecognizedPolicyExclusionReason(row.reason)) return false;
  if (!Number.isInteger(row.sessions_observed) || row.sessions_observed < 1) {
    return false;
  }
  if (!Number.isInteger(row.min_sessions) || row.min_sessions < 1) {
    return false;
  }
  if (row.min_sessions !== minSessions) return false;
  if (!(row.sessions_observed < row.min_sessions)) return false;
  return true;
}

export function parsePolicyExclusionRow(
  raw: Record<string, unknown>,
): PolicyExclusionRow | null {
  const generation_id = typeof raw.generation_id === "string"
    ? raw.generation_id
    : "";
  const symbol = typeof raw.symbol === "string" ? raw.symbol : "";
  const reason = typeof raw.reason === "string" ? raw.reason : "";
  const sessions_observed = Number(raw.sessions_observed);
  const min_sessions = Number(raw.min_sessions);
  if (!generation_id || !symbol) return null;
  if (!Number.isInteger(sessions_observed) || !Number.isInteger(min_sessions)) {
    return null;
  }
  return {
    generation_id,
    symbol,
    reason,
    sessions_observed,
    min_sessions,
  };
}

/**
 * Fail-closed validation for current-generation exclusion evidence.
 * Returns unavailable on any malformed, incomplete, or count-mismatched payload.
 * Does not speak to baseline-quote validity.
 */
export function validatePolicyExclusionEvidence(input: {
  generationId: string;
  policyMinSessions: unknown;
  policyExcludedCount: unknown;
  rows: Array<Record<string, unknown>>;
}): PolicyExclusionEvidence {
  const min = Number(input.policyMinSessions);
  const declaredCount = Number(input.policyExcludedCount);
  if (!Number.isInteger(min) || min < 1) {
    return POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE;
  }
  if (!Number.isInteger(declaredCount) || declaredCount < 0) {
    return POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE;
  }
  if (typeof input.generationId !== "string" || !input.generationId) {
    return POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE;
  }
  if (!Array.isArray(input.rows)) {
    return POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE;
  }
  if (input.rows.length !== declaredCount) {
    return POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE;
  }

  const symbols = new Set<string>();
  for (const raw of input.rows) {
    if (!raw || typeof raw !== "object") {
      return POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE;
    }
    const parsed = parsePolicyExclusionRow(raw);
    if (!parsed || !isValidExclusionRow(parsed, input.generationId, min)) {
      return POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE;
    }
    if (symbols.has(parsed.symbol)) {
      return POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE;
    }
    symbols.add(parsed.symbol);
  }

  if (symbols.size !== declaredCount) {
    return POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE;
  }

  return {
    available: true,
    min_sessions: min,
    excluded_count: declaredCount,
    symbols,
  };
}
