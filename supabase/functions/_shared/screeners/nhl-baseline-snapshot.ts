import type { PolicyExclusionEvidence } from "./baseline-coverage.ts";
import { POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE } from "./baseline-coverage.ts";
import {
  deserializePolicyExclusionEvidence,
  serializePolicyExclusionEvidence,
  type SerializedPolicyExclusionEvidence,
} from "./policy-exclusion-serialize.ts";
import type { NhlBaselineQuote, NhlBaselineStatus } from "./new-highs-lows.ts";

/** Immutable NHL baseline identity + inputs frozen at generation start. */
export type FrozenNhlBaselineSnapshot = {
  baselineGenerationId: string;
  status: NhlBaselineStatus;
  declaredSymbolCount: number;
  quoteEntries: Array<[string, NhlBaselineQuote]>;
  policyExclusions: PolicyExclusionEvidence;
  frozenAtMs: number;
};

export function createFrozenNhlBaselineSnapshot(input: {
  baselineGenerationId: string;
  status: NhlBaselineStatus;
  declaredSymbolCount: number;
  quotes: ReadonlyMap<string, NhlBaselineQuote>;
  policyExclusions: PolicyExclusionEvidence;
  frozenAtMs: number;
}): FrozenNhlBaselineSnapshot {
  const policyExclusions = deserializePolicyExclusionEvidence(
    serializePolicyExclusionEvidence(input.policyExclusions),
  );
  return {
    baselineGenerationId: input.baselineGenerationId,
    status: input.status,
    declaredSymbolCount: input.declaredSymbolCount,
    quoteEntries: [...input.quotes.entries()],
    policyExclusions,
    frozenAtMs: input.frozenAtMs,
  };
}

export type StoredNhlBaselineSnapshot = Omit<
  FrozenNhlBaselineSnapshot,
  "policyExclusions"
> & {
  policyExclusions: SerializedPolicyExclusionEvidence;
};

export function serializeNhlBaselineSnapshotForStorage(
  snap: FrozenNhlBaselineSnapshot,
): StoredNhlBaselineSnapshot {
  return {
    baselineGenerationId: snap.baselineGenerationId,
    status: snap.status,
    declaredSymbolCount: snap.declaredSymbolCount,
    quoteEntries: snap.quoteEntries,
    policyExclusions: serializePolicyExclusionEvidence(snap.policyExclusions),
    frozenAtMs: snap.frozenAtMs,
  };
}

export function parseNhlBaselineSnapshotFromStorage(
  raw: unknown,
): FrozenNhlBaselineSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.baselineGenerationId !== "string") return null;
  if (typeof o.status !== "string") return null;
  if (!Array.isArray(o.quoteEntries)) return null;
  return {
    baselineGenerationId: o.baselineGenerationId,
    status: o.status as NhlBaselineStatus,
    declaredSymbolCount: Number(o.declaredSymbolCount) || 0,
    quoteEntries: o.quoteEntries as FrozenNhlBaselineSnapshot["quoteEntries"],
    policyExclusions: deserializePolicyExclusionEvidence(o.policyExclusions),
    frozenAtMs: Number(o.frozenAtMs) || 0,
  };
}

export function quotesFromSnapshot(
  snap: FrozenNhlBaselineSnapshot,
): Map<string, NhlBaselineQuote> {
  return new Map(snap.quoteEntries);
}

export function snapshotBaselineGenerationId(
  snap: FrozenNhlBaselineSnapshot | null | undefined,
): string | null {
  return snap?.baselineGenerationId ?? null;
}

/** Fail closed when live baseline generation drifts mid-run. */
export function assertFrozenBaselineStillValid(
  frozen: FrozenNhlBaselineSnapshot,
  live: {
    baselineGenerationId: string;
    status: NhlBaselineStatus;
  },
): { ok: true } | { ok: false; reason: string } {
  if (live.baselineGenerationId !== frozen.baselineGenerationId) {
    return { ok: false, reason: "nhl_baseline_generation_changed" };
  }
  if (live.status !== frozen.status) {
    return { ok: false, reason: "nhl_baseline_status_changed" };
  }
  return { ok: true };
}

export function emptyFrozenSnapshot(nowMs: number): FrozenNhlBaselineSnapshot {
  return {
    baselineGenerationId: "",
    status: "initializing",
    declaredSymbolCount: 0,
    quoteEntries: [],
    policyExclusions: POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE,
    frozenAtMs: nowMs,
  };
}
