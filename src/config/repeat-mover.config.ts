/**
 * Repeat Movers V1 — deterministic evidence labels only (not predictions).
 */

export const REPEAT_MOVER_VERSION = "v1" as const;
export type RepeatMoverVersion = typeof REPEAT_MOVER_VERSION;

export const REPEAT_MOVER_EVIDENCE_LABELS = [
  "NO_HISTORY",
  "LIMITED_HISTORY",
  "RECURRING_MOVER",
  "RARE_EVENT",
  "SIMILAR_PRIOR_EPISODES_FOUND",
] as const;
export type RepeatMoverEvidenceLabel = (typeof REPEAT_MOVER_EVIDENCE_LABELS)[number];

export const REPEAT_MOVER_DEFAULTS = {
  /** Episodes per 30 sessions at or above this suggests recurring activity. */
  recurringEpisodesPer30SessionsMin: 1,
  /** Total episodes at or above this also supports RECURRING_MOVER. */
  recurringEpisodeCountMin: 5,
  /** Episode count at or below this with INSUFFICIENT/LIMITED quality suggests RARE_EVENT. */
  rareEventMaxEpisodeCount: 2,
  defaultComparableLimit: 10,
  /** Same-security prior episodes within this |movePct| band (behavior-profile comparable logic). */
  comparableMovePctTolerance: 3,
  /** Omit prior episodes whose |movePct| exactly matches the current context (delta 0). */
  comparableExcludeIdenticalAbsMovePct: true,
} as const;

export type RepeatMoverConfig = typeof REPEAT_MOVER_DEFAULTS;

export function repeatMoverConfig(overrides: Partial<RepeatMoverConfig> = {}): RepeatMoverConfig {
  return { ...REPEAT_MOVER_DEFAULTS, ...overrides };
}
