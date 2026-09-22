/** Radar Repeat Movers V1 — post-rank enrichment only (does not affect ranking). */

export const RADAR_HISTORICAL_CONTEXT_DEFAULTS = {
  /** Max board rows enriched per Radar refresh (active set only). */
  maxEnrichedSecurities: 20,
  /** Parallel repeat-mover lookups. */
  concurrency: 3,
  /** Per-security enrichment budget; fail soft when exceeded. */
  perSecurityTimeoutMs: 2_500,
  /** Whole-batch budget; fail soft and return partial/null context. */
  batchTimeoutMs: 8_000,
} as const;

export type RadarHistoricalContextConfig = typeof RADAR_HISTORICAL_CONTEXT_DEFAULTS;

export function radarHistoricalContextConfig(
  overrides: Partial<RadarHistoricalContextConfig> = {},
): RadarHistoricalContextConfig {
  return { ...RADAR_HISTORICAL_CONTEXT_DEFAULTS, ...overrides };
}
