import {
  SHADOW_OBSERVATION_POLICY,
  type ShadowObservationPolicy,
} from "@/lib/ai-trader/runtime/observation-policy";

/**
 * Conservative Shadow observation defaults.
 * Values come from the versioned ShadowObservationPolicy.
 * HIGH_PRIORITY uses Radar sourceRank only — not an invented alpha threshold and not a buy signal.
 */
export const SHADOW_RUNTIME_CONFIG = {
  staleAfterMs: SHADOW_OBSERVATION_POLICY.staleAfterMs,
  cooldownDurationMs: SHADOW_OBSERVATION_POLICY.cooldownDurationMs,
  highPriorityMaxSourceRank: SHADOW_OBSERVATION_POLICY.highPriorityMaxSourceRank,
  contextSchemaVersion: "v1",
  policyVersion: SHADOW_OBSERVATION_POLICY.version,
} as const;

export type ShadowRuntimeConfig = typeof SHADOW_RUNTIME_CONFIG;

export function shadowRuntimePolicy(): ShadowObservationPolicy {
  return SHADOW_OBSERVATION_POLICY;
}
