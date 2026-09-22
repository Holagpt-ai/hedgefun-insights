/**
 * Radar Repeat Movers V2 — deterministic qualification and filters (not scores).
 */

export const RADAR_REPEAT_MOVERS_VERSION = "v2" as const;
export type RadarRepeatMoversVersion = typeof RADAR_REPEAT_MOVERS_VERSION;

/** Profile age beyond this is marked stale (no inline recompute on Radar path). */
export const RADAR_REPEAT_MOVERS_DEFAULTS = {
  staleProfileMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
} as const;

export type RadarRepeatMoversConfig = typeof RADAR_REPEAT_MOVERS_DEFAULTS;

export function radarRepeatMoversConfig(
  overrides: Partial<RadarRepeatMoversConfig> = {},
): RadarRepeatMoversConfig {
  return { ...RADAR_REPEAT_MOVERS_DEFAULTS, ...overrides };
}

export const RADAR_REPEAT_MOVER_FILTER_IDS = [
  "all",
  "recurring_movers",
  "similar_prior_episodes",
  "adequate_or_robust_history",
  "limited_history",
  "fresh_profile",
  "stale_profile",
] as const;

export type RadarRepeatMoverFilterId = (typeof RADAR_REPEAT_MOVER_FILTER_IDS)[number];

export const RADAR_REPEAT_MOVER_PRESENTATION_SORT_KEYS = [
  "discovery_rank",
  "comparable_episode_count",
  "most_recent_comparable_date",
] as const;

export type RadarRepeatMoverPresentationSortKey =
  (typeof RADAR_REPEAT_MOVER_PRESENTATION_SORT_KEYS)[number];
