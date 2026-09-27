import { SCREENER_STALE_AFTER_MS } from "@/lib/screeners/contract";

/**
 * Versioned SHADOW observation policy.
 * HIGH_PRIORITY means important for observation.
 * It is not ENTER, buy, order-ready, recommended, approved, or ENTRY_READY.
 * Rank ceiling is a provisional observation filter, not trading alpha.
 */
export interface ShadowObservationPolicy {
  version: string;
  highPriorityMaxSourceRank: number | null;
  cooldownDurationMs: number;
  staleAfterMs: number;
}

export const SHADOW_OBSERVATION_POLICY_V1: ShadowObservationPolicy = {
  version: "shadow-observation-v1",
  highPriorityMaxSourceRank: 3,
  cooldownDurationMs: 24 * 60 * 60 * 1000,
  staleAfterMs: SCREENER_STALE_AFTER_MS,
};

export const SHADOW_OBSERVATION_POLICY = SHADOW_OBSERVATION_POLICY_V1;

export function isHighPriorityObservation(
  sourceRank: number,
  policy: ShadowObservationPolicy = SHADOW_OBSERVATION_POLICY,
): boolean {
  if (policy.highPriorityMaxSourceRank == null) return false;
  return sourceRank <= policy.highPriorityMaxSourceRank;
}

export function cooldownUntilIso(
  nowMs: number,
  policy: ShadowObservationPolicy = SHADOW_OBSERVATION_POLICY,
): string {
  return new Date(nowMs + policy.cooldownDurationMs).toISOString();
}
