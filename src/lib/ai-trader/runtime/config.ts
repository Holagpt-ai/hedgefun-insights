import { SCREENER_STALE_AFTER_MS } from "@/lib/screeners/contract";

/**
 * Conservative Shadow observation defaults.
 * Freshness reuses the existing Stocksist screener/Radar stale window (20 minutes).
 * Aging is intentionally slow: one calendar day of cooldown before REMOVED.
 * HIGH_PRIORITY uses Radar sourceRank only — not an invented alpha threshold.
 */
export const SHADOW_RUNTIME_CONFIG = {
  staleAfterMs: SCREENER_STALE_AFTER_MS,
  cooldownDurationMs: 24 * 60 * 60 * 1000,
  highPriorityMaxSourceRank: 3,
  contextSchemaVersion: "v1",
} as const;

export type ShadowRuntimeConfig = typeof SHADOW_RUNTIME_CONFIG;
