export type RepeatMoverEvidenceLabel =
  | "NO_HISTORY"
  | "LIMITED_HISTORY"
  | "RECURRING_MOVER"
  | "RARE_EVENT"
  | "SIMILAR_PRIOR_EPISODES_FOUND";

export interface RepeatMoverCurrentContext {
  observedSymbol: string | null;
  sessionDate: string | null;
  movePct: number | null;
  volume: number | null;
  rvol: number | null;
  dollarVolume: number | null;
  direction: string | null;
  tier: string | null;
  recordedAt: string | null;
}

export type RepeatMoverContextInput = Partial<RepeatMoverCurrentContext> & {
  symbol?: string | null;
};

export interface RepeatMoverComparableEpisode {
  episodeId: string;
  sessionDate: string | null;
  tier: string;
  direction: string;
  movePct: number | null;
  volume: number | null;
  rvol: number | null;
  dollarVolume: number | null;
  closePosition: number | null;
  nextSessionMovePct: number | null;
  nextSessionContinuation: boolean | null;
  similarity: {
    sameDirection: boolean;
    sameTier: boolean;
    movePctDelta: number | null;
  };
}

export interface RepeatMoverProfileSnapshot {
  profileAvailable: boolean;
  sampleSizeQuality: string | null;
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
}

export interface RepeatMoverContext {
  version: string;
  securityId: string;
  currentSymbol: string | null;
  currentContext: RepeatMoverCurrentContext;
  profile: RepeatMoverProfileSnapshot;
  comparableHistory: {
    comparableEpisodeCount: number;
    closestComparableEpisodes: RepeatMoverComparableEpisode[];
    mostRecentComparableEpisode: RepeatMoverComparableEpisode | null;
  };
  evidenceLabels: RepeatMoverEvidenceLabel[];
  assembledAt: string;
}
