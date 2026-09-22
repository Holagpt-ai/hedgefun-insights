import type { RepeatMoverContext } from "@/types/repeat-mover";

export interface HistoricalMemoryComparableEpisode {
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
  movePctDelta: number | null;
}

/** Deterministic same-security historical evidence for AI Analyst. */
export interface HistoricalMemoryFacts {
  /** False when fetch failed or identity unresolved; AI must not invent history. */
  contextLoaded: boolean;
  profileAvailable: boolean;
  securityId: string | null;
  symbol: string | null;
  evidenceLabels: readonly string[];
  sampleSizeQuality: string | null;
  sessionsObserved: number | null;
  historyStartDate: string | null;
  historyEndDate: string | null;
  episodeCount: number | null;
  notableCount: number | null;
  significantCount: number | null;
  extremeCount: number | null;
  positiveEpisodeCount: number | null;
  negativeEpisodeCount: number | null;
  mixedEpisodeCount: number | null;
  episodesPer30Sessions: number | null;
  episodesPer90Sessions: number | null;
  medianDaysBetweenEpisodes: number | null;
  /** Not in RepeatMover profile snapshot — null unless supplied elsewhere. */
  medianHistoricalMovePct: number | null;
  medianHistoricalRvol: number | null;
  positiveCloseUpperQuartilePct: number | null;
  positiveCloseNearHighPct: number | null;
  negativeCloseNearLowPct: number | null;
  nextSessionPositiveContinuationRate: number | null;
  nextSessionNegativeContinuationRate: number | null;
  comparableEpisodeCount: number;
  closestComparableEpisodes: HistoricalMemoryComparableEpisode[];
  mostRecentComparableEpisode: HistoricalMemoryComparableEpisode | null;
  profileComputedAt: string | null;
  latestSourceHistoryDate: string | null;
  latestEpisodeDateUsed: string | null;
  sourceDailyRowCount: number | null;
  sourceEpisodeCount: number | null;
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
  assembledAt: string | null;
}

export function unavailableHistoricalMemory(symbol: string | null): HistoricalMemoryFacts {
  return {
    contextLoaded: false,
    profileAvailable: false,
    securityId: null,
    symbol,
    evidenceLabels: [],
    sampleSizeQuality: null,
    sessionsObserved: null,
    historyStartDate: null,
    historyEndDate: null,
    episodeCount: null,
    notableCount: null,
    significantCount: null,
    extremeCount: null,
    positiveEpisodeCount: null,
    negativeEpisodeCount: null,
    mixedEpisodeCount: null,
    episodesPer30Sessions: null,
    episodesPer90Sessions: null,
    medianDaysBetweenEpisodes: null,
    medianHistoricalMovePct: null,
    medianHistoricalRvol: null,
    positiveCloseUpperQuartilePct: null,
    positiveCloseNearHighPct: null,
    negativeCloseNearLowPct: null,
    nextSessionPositiveContinuationRate: null,
    nextSessionNegativeContinuationRate: null,
    comparableEpisodeCount: 0,
    closestComparableEpisodes: [],
    mostRecentComparableEpisode: null,
    profileComputedAt: null,
    latestSourceHistoryDate: null,
    latestEpisodeDateUsed: null,
    sourceDailyRowCount: null,
    sourceEpisodeCount: null,
    episodesWithD1Outcome: null,
    episodesWithD5Outcome: null,
    forwardOutcomeCoveragePctD1: null,
    medianD1ReturnPct: null,
    medianD5ReturnPct: null,
    positiveD1Pct: null,
    negativeD1Pct: null,
    observedNextSessionSampleSize: null,
    observedNextSessionPositivePct: null,
    observedNextSessionNegativePct: null,
    assembledAt: null,
  };
}

function mapComparable(
  episode: RepeatMoverContext["comparableHistory"]["closestComparableEpisodes"][number],
): HistoricalMemoryComparableEpisode {
  return {
    sessionDate: episode.sessionDate,
    tier: episode.tier,
    direction: episode.direction,
    movePct: episode.movePct,
    volume: episode.volume,
    rvol: episode.rvol,
    dollarVolume: episode.dollarVolume,
    closePosition: episode.closePosition,
    nextSessionMovePct: episode.nextSessionMovePct,
    nextSessionContinuation: episode.nextSessionContinuation,
    movePctDelta: episode.similarity.movePctDelta,
  };
}

export function buildHistoricalMemoryFromRepeatMoverContext(
  context: RepeatMoverContext | null | undefined,
  symbolFallback?: string | null,
): HistoricalMemoryFacts {
  if (!context) {
    return unavailableHistoricalMemory(symbolFallback ?? null);
  }

  const profile = context.profile;
  const comparables = context.comparableHistory.closestComparableEpisodes.map(mapComparable);
  const mostRecent = context.comparableHistory.mostRecentComparableEpisode
    ? mapComparable(context.comparableHistory.mostRecentComparableEpisode)
    : null;

  return {
    contextLoaded: true,
    profileAvailable: profile.profileAvailable,
    securityId: context.securityId,
    symbol: context.currentSymbol ?? symbolFallback ?? null,
    evidenceLabels: context.evidenceLabels,
    sampleSizeQuality: profile.sampleSizeQuality,
    sessionsObserved: profile.sessionsObserved,
    historyStartDate: profile.historyStartDate,
    historyEndDate: profile.historyEndDate,
    episodeCount: profile.episodeCount,
    notableCount: profile.notableCount,
    significantCount: profile.significantCount,
    extremeCount: profile.extremeCount,
    positiveEpisodeCount: profile.positiveEpisodeCount,
    negativeEpisodeCount: profile.negativeEpisodeCount,
    mixedEpisodeCount: profile.mixedEpisodeCount,
    episodesPer30Sessions: profile.episodesPer30Sessions,
    episodesPer90Sessions: profile.episodesPer90Sessions,
    medianDaysBetweenEpisodes: profile.medianDaysBetweenEpisodes,
    medianHistoricalMovePct: null,
    medianHistoricalRvol: null,
    positiveCloseUpperQuartilePct: profile.positiveCloseUpperQuartilePct,
    positiveCloseNearHighPct: profile.positiveCloseNearHighPct,
    negativeCloseNearLowPct: profile.negativeCloseNearLowPct,
    nextSessionPositiveContinuationRate: profile.nextSessionPositiveContinuationRate,
    nextSessionNegativeContinuationRate: profile.nextSessionNegativeContinuationRate,
    comparableEpisodeCount: context.comparableHistory.comparableEpisodeCount,
    closestComparableEpisodes: comparables,
    mostRecentComparableEpisode: mostRecent,
    profileComputedAt: profile.computedAt,
    latestSourceHistoryDate: profile.latestSourceHistoryDate,
    latestEpisodeDateUsed: profile.latestEpisodeDateUsed,
    sourceDailyRowCount: profile.sourceDailyRowCount,
    sourceEpisodeCount: profile.sourceEpisodeCount,
    episodesWithD1Outcome: profile.episodesWithD1Outcome,
    episodesWithD5Outcome: profile.episodesWithD5Outcome,
    forwardOutcomeCoveragePctD1: profile.forwardOutcomeCoveragePctD1,
    medianD1ReturnPct: profile.medianD1ReturnPct,
    medianD5ReturnPct: profile.medianD5ReturnPct,
    positiveD1Pct: profile.positiveD1Pct,
    negativeD1Pct: profile.negativeD1Pct,
    observedNextSessionSampleSize: profile.observedNextSessionSampleSize,
    observedNextSessionPositivePct: profile.observedNextSessionPositivePct,
    observedNextSessionNegativePct: profile.observedNextSessionNegativePct,
    assembledAt: context.assembledAt,
  };
}

export function serializeHistoricalMemoryForPrompt(
  memory: HistoricalMemoryFacts,
): string {
  return JSON.stringify({ historicalMemory: memory });
}

const FORBIDDEN_PREDICTION_KEYS = [
  "probability",
  "confidence",
  "winRate",
  "expectedMove",
  "prediction",
];

export function assertHistoricalMemoryIsEvidenceOnly(memory: HistoricalMemoryFacts): void {
  const json = JSON.stringify(memory).toLowerCase();
  for (const key of FORBIDDEN_PREDICTION_KEYS) {
    if (json.includes(`"${key.toLowerCase()}"`)) {
      throw new Error(`historical memory must not include ${key}`);
    }
  }
}
