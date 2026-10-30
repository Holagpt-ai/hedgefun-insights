import {
  POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE,
  type PolicyExclusionEvidence,
} from "./baseline-coverage.ts";

/** JSON-safe policy exclusion payload (Postgres jsonb). */
export type SerializedPolicyExclusionEvidence = {
  available: boolean;
  min_sessions: number | null;
  excluded_count: number | null;
  symbols: string[];
};

export function serializePolicyExclusionEvidence(
  evidence: PolicyExclusionEvidence,
): SerializedPolicyExclusionEvidence {
  const symbols = [...evidence.symbols].sort();
  if (evidence.available) {
    if (
      evidence.min_sessions === null ||
      evidence.excluded_count === null ||
      symbols.length !== evidence.excluded_count
    ) {
      return {
        available: false,
        min_sessions: null,
        excluded_count: null,
        symbols: [],
      };
    }
  }
  return {
    available: evidence.available,
    min_sessions: evidence.min_sessions,
    excluded_count: evidence.excluded_count,
    symbols,
  };
}

export function deserializePolicyExclusionEvidence(
  raw: unknown,
): PolicyExclusionEvidence {
  if (!raw || typeof raw !== "object") {
    return POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE;
  }
  const o = raw as Record<string, unknown>;
  const available = o.available === true;
  if (!available) {
    return POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE;
  }
  const min_sessions = o.min_sessions === null ? null : Number(o.min_sessions);
  const excluded_count = o.excluded_count === null
    ? null
    : Number(o.excluded_count);
  if (
    !Number.isInteger(min_sessions) || min_sessions! < 1 ||
    !Number.isInteger(excluded_count) || excluded_count! < 0
  ) {
    return POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE;
  }
  if (!Array.isArray(o.symbols)) {
    return POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE;
  }
  const symbols = new Set<string>();
  for (const item of o.symbols) {
    if (typeof item !== "string" || !item.trim()) {
      return POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE;
    }
    symbols.add(item);
  }
  if (symbols.size !== excluded_count) {
    return POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE;
  }
  return {
    available: true,
    min_sessions,
    excluded_count,
    symbols,
  };
}
