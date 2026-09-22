import type {
  BehaviorProfileSampleQuality,
  BehaviorProfileVersion,
} from "@/config/behavior-profile.config";
import type { SecurityId } from "@/types/security-identity";

/** Evidence-only historical behavior summary for one security. Not a prediction. */
export interface SecurityBehaviorProfile {
  version: BehaviorProfileVersion;
  securityId: SecurityId;
  observedSymbol: string | null;
  computedAt: string;

  coverage: BehaviorProfileCoverage;
  episodeDistribution: BehaviorProfileEpisodeDistribution;
  moveBehavior: BehaviorProfileMoveBehavior;
  volumeBehavior: BehaviorProfileVolumeBehavior;
  recurrence: BehaviorProfileRecurrence;
  closeBehavior: BehaviorProfileCloseBehavior;
  continuation: BehaviorProfileContinuation;
  /** Observed post-episode outcomes from persisted forward_outcomes (evidence only). */
  forwardOutcomes: BehaviorProfileForwardOutcomes;
  freshness: BehaviorProfileFreshness;
}

/** Aggregated forward-session evidence. Not predictive. */
export interface BehaviorProfileForwardOutcomes {
  episodesWithD1Outcome: number;
  episodesWithD5Outcome: number;
  forwardOutcomeCoveragePctD1: number | null;
  forwardOutcomeCoveragePctD5: number | null;
  medianD1ReturnPct: number | null;
  positiveD1Count: number;
  negativeD1Count: number;
  zeroD1Count: number;
  positiveD1Pct: number | null;
  negativeD1Pct: number | null;
  medianD5ReturnPct: number | null;
  positiveD5Count: number;
  negativeD5Count: number;
  zeroD5Count: number;
  positiveD5Pct: number | null;
  negativeD5Pct: number | null;
  medianD1MaxGainPct: number | null;
  medianD1MaxDrawdownPct: number | null;
  medianD5MaxGainPct: number | null;
  medianD5MaxDrawdownPct: number | null;
  observedNextSessionSampleSize: number;
  observedNextSessionPositivePct: number | null;
  observedNextSessionNegativePct: number | null;
}

/** Source coverage used for this computation (not a prediction). */
export interface BehaviorProfileFreshness {
  latestSourceHistoryDate: string | null;
  latestEpisodeDateUsed: string | null;
  sourceDailyRowCount: number;
  sourceEpisodeCount: number;
  /** D1 forward-outcome rows used when profile was computed (staleness signal). */
  forwardOutcomeD1Count: number;
  forwardOutcomeD5Count: number;
}

export interface BehaviorProfileCoverage {
  historyStartDate: string | null;
  historyEndDate: string | null;
  sessionsObserved: number;
  episodeCount: number;
  sampleSizeQuality: BehaviorProfileSampleQuality;
}

export interface BehaviorProfileEpisodeDistribution {
  notableCount: number;
  significantCount: number;
  extremeCount: number;
  positiveEpisodeCount: number;
  negativeEpisodeCount: number;
  mixedEpisodeCount: number;
  positiveEpisodePct: number | null;
  negativeEpisodePct: number | null;
}

export interface BehaviorProfileMoveBehavior {
  medianEpisodeMovePct: number | null;
  averageEpisodeMovePct: number | null;
  maxPositiveEpisodeMovePct: number | null;
  maxNegativeEpisodeMovePct: number | null;
  medianAbsoluteMovePct: number | null;
}

export interface BehaviorProfileVolumeBehavior {
  medianEpisodeVolume: number | null;
  medianEpisodeRvol: number | null;
  maxEpisodeRvol: number | null;
  medianEpisodeDollarVolume: number | null;
}

export interface BehaviorProfileRecurrence {
  episodesPer30Sessions: number | null;
  episodesPer90Sessions: number | null;
  medianDaysBetweenEpisodes: number | null;
  mostRecentEpisodeDate: string | null;
  priorComparableEpisodeCount: number;
}

export interface BehaviorProfileCloseBehavior {
  positiveEpisodesClosingUpperQuartilePct: number | null;
  positiveEpisodesClosingNearHighPct: number | null;
  negativeEpisodesClosingNearLowPct: number | null;
}

export interface BehaviorProfileContinuation {
  nextSessionPositiveContinuationCount: number;
  nextSessionNegativeContinuationCount: number;
  continuationSampleSize: number;
  nextSessionPositiveContinuationRate: number | null;
  nextSessionNegativeContinuationRate: number | null;
}

/** Persisted row shape (typed columns). */
export type StoredSecurityBehaviorProfile = SecurityBehaviorProfile;
