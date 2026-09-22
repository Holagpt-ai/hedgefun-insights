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
  freshness: BehaviorProfileFreshness;
}

/** Source coverage used for this computation (not a prediction). */
export interface BehaviorProfileFreshness {
  latestSourceHistoryDate: string | null;
  latestEpisodeDateUsed: string | null;
  sourceDailyRowCount: number;
  sourceEpisodeCount: number;
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
