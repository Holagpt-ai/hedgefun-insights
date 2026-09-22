/**
 * Historical Behavior Profile — deterministic thresholds only (current version v2).
 * Does not score, predict, or rank securities.
 */

export const BEHAVIOR_PROFILE_VERSION = "v2" as const;
export const BEHAVIOR_PROFILE_VERSIONS = ["v1", "v2"] as const;
export type BehaviorProfileVersion = (typeof BEHAVIOR_PROFILE_VERSIONS)[number];

export const BEHAVIOR_PROFILE_SAMPLE_QUALITIES = [
  "INSUFFICIENT",
  "LIMITED",
  "ADEQUATE",
  "ROBUST",
] as const;
export type BehaviorProfileSampleQuality = (typeof BEHAVIOR_PROFILE_SAMPLE_QUALITIES)[number];

export const BEHAVIOR_PROFILE_DEFAULTS = {
  /** Close position in [0,1] where 1 is at the session high. */
  closeUpperQuartileMin: 0.75,
  closeNearHighMin: 0.9,
  closeNearLowMax: 0.1,
  /** Minimum |next-day movePct| to count as directional continuation. */
  continuationMinMovePct: 0.5,
  /** |movePct| band when comparing episodes to the most recent episode. */
  comparableMovePctTolerance: 10,
  /** Episodes must share direction with the reference episode to count as comparable. */
  comparableRequireSameDirection: true,
  /** Minimum sessions with usable OHLC before profile is considered covered. */
  minSessionsForLimitedQuality: 20,
  minEpisodesForLimitedQuality: 1,
  minEpisodesForAdequateQuality: 5,
  minEpisodesForRobustQuality: 20,
  minSessionsForAdequateQuality: 252,
  minSessionsForRobustQuality: 756,
  recurrenceWindowSessions30: 30,
  recurrenceWindowSessions90: 90,
} as const;

export type BehaviorProfileConfig = {
  -readonly [K in keyof typeof BEHAVIOR_PROFILE_DEFAULTS]:
    (typeof BEHAVIOR_PROFILE_DEFAULTS)[K] extends boolean ? boolean : number;
};

export function behaviorProfileConfig(
  overrides: Partial<BehaviorProfileConfig> = {},
): BehaviorProfileConfig {
  return { ...BEHAVIOR_PROFILE_DEFAULTS, ...overrides };
}
