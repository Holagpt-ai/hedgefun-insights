import type { RepeatMoverEvidenceLabel, RepeatMoverVersion } from "@/config/repeat-mover.config";
import type { RepeatMoverForwardOutcomeEvidence } from "@/lib/forward-outcomes/forward-outcome-types";
import type { BehaviorProfileSampleQuality } from "@/config/behavior-profile.config";
import type { EpisodeDirection, EpisodeTier } from "@/config/security-intelligence.config";
import type { SecurityId } from "@/types/security-identity";

/** Verified live context for one security. Not a prediction input score. */
export interface RepeatMoverCurrentContext {
  observedSymbol: string | null;
  sessionDate: string | null;
  movePct: number | null;
  volume: number | null;
  rvol: number | null;
  dollarVolume: number | null;
  direction: EpisodeDirection | null;
  tier: EpisodeTier | null;
  recordedAt: string | null;
}

export interface RepeatMoverComparableSimilarity {
  sameDirection: boolean;
  sameTier: boolean;
  movePctDelta: number | null;
}

export interface RepeatMoverComparableEpisode {
  episodeId: string;
  sessionDate: string | null;
  tier: EpisodeTier;
  direction: EpisodeDirection;
  movePct: number | null;
  volume: number | null;
  rvol: number | null;
  dollarVolume: number | null;
  closePosition: number | null;
  nextSessionMovePct: number | null;
  nextSessionContinuation: boolean | null;
  /** Persisted forward-outcome facts when loaded (does not affect qualification). */
  observedForwardOutcomes?: RepeatMoverForwardOutcomeEvidence;
  similarity: RepeatMoverComparableSimilarity;
}

export interface RepeatMoverProfileSnapshot {
  profileAvailable: boolean;
  sampleSizeQuality: BehaviorProfileSampleQuality | null;
  sessionsObserved: number | null;
  episodeCount: number | null;
  notableCount: number | null;
  significantCount: number | null;
  extremeCount: number | null;
  positiveEpisodeCount: number | null;
  negativeEpisodeCount: number | null;
  mixedEpisodeCount: number | null;
  positiveEpisodePct: number | null;
  negativeEpisodePct: number | null;
  episodesPer30Sessions: number | null;
  episodesPer90Sessions: number | null;
  medianDaysBetweenEpisodes: number | null;
  positiveCloseUpperQuartilePct: number | null;
  positiveCloseNearHighPct: number | null;
  negativeCloseNearLowPct: number | null;
  nextSessionPositiveContinuationRate: number | null;
  nextSessionNegativeContinuationRate: number | null;
  historyStartDate: string | null;
  historyEndDate: string | null;
  computedAt: string | null;
  latestSourceHistoryDate: string | null;
  latestEpisodeDateUsed: string | null;
  sourceDailyRowCount: number | null;
  sourceEpisodeCount: number | null;
  /** Observed forward-outcome aggregates (v2 profile evidence). */
  episodesWithD1Outcome: number | null;
  episodesWithD5Outcome: number | null;
  forwardOutcomeCoveragePctD1: number | null;
  medianD1ReturnPct: number | null;
  medianD5ReturnPct: number | null;
  positiveD1Pct: number | null;
  negativeD1Pct: number | null;
  observedNextSessionSampleSize: number | null;
  observedNextSessionPositivePct: number | null;
  observedNextSessionNegativePct: number | null;
}

export interface RepeatMoverComparableHistory {
  comparableEpisodeCount: number;
  closestComparableEpisodes: RepeatMoverComparableEpisode[];
  mostRecentComparableEpisode: RepeatMoverComparableEpisode | null;
}

/** Same-security historical memory. Evidence only — no prediction fields. */
export interface RepeatMoverContext {
  version: RepeatMoverVersion;
  securityId: SecurityId;
  currentSymbol: string | null;
  currentContext: RepeatMoverCurrentContext;
  profile: RepeatMoverProfileSnapshot;
  comparableHistory: RepeatMoverComparableHistory;
  evidenceLabels: RepeatMoverEvidenceLabel[];
  assembledAt: string;
}
