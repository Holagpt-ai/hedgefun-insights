import { REPEAT_MOVER_VERSION, repeatMoverConfig } from "@/config/repeat-mover.config";
import { getComparableHistoricalEpisodes } from "@/lib/behavior-profile/comparable-historical-episodes";
import { deriveRepeatMoverEvidenceLabels } from "@/lib/repeat-movers/derive-repeat-mover-evidence-labels";
import {
  normalizeRepeatMoverCurrentContext,
  type RepeatMoverContextInput,
} from "@/lib/repeat-movers/normalize-repeat-mover-context";
import type { SecurityBehaviorProfile } from "@/types/behavior-profile";
import type {
  RepeatMoverComparableEpisode,
  RepeatMoverContext,
  RepeatMoverProfileSnapshot,
} from "@/types/repeat-mover";
import type { MarketBehaviorEpisode, SecurityDailyHistory } from "@/types/security-intelligence";
import type { SecurityId } from "@/types/security-identity";

export interface RepeatMoverDataAccess {
  getBehaviorProfile(securityId: SecurityId): Promise<SecurityBehaviorProfile | null>;
  listDailyHistory(securityId: SecurityId): Promise<readonly SecurityDailyHistory[]>;
  listEpisodes(securityId: SecurityId): Promise<readonly MarketBehaviorEpisode[]>;
}

export function unavailableRepeatMoverProfileSnapshot(): RepeatMoverProfileSnapshot {
  return {
    profileAvailable: false,
    sampleSizeQuality: null,
    sessionsObserved: null,
    episodeCount: null,
    notableCount: null,
    significantCount: null,
    extremeCount: null,
    positiveEpisodeCount: null,
    negativeEpisodeCount: null,
    mixedEpisodeCount: null,
    positiveEpisodePct: null,
    negativeEpisodePct: null,
    episodesPer30Sessions: null,
    episodesPer90Sessions: null,
    medianDaysBetweenEpisodes: null,
    positiveCloseUpperQuartilePct: null,
    positiveCloseNearHighPct: null,
    negativeCloseNearLowPct: null,
    nextSessionPositiveContinuationRate: null,
    nextSessionNegativeContinuationRate: null,
    historyStartDate: null,
    historyEndDate: null,
    computedAt: null,
    latestSourceHistoryDate: null,
    latestEpisodeDateUsed: null,
    sourceDailyRowCount: null,
    sourceEpisodeCount: null,
  };
}

export function repeatMoverProfileSnapshotFromBehaviorProfile(
  profile: SecurityBehaviorProfile,
): RepeatMoverProfileSnapshot {
  return {
    profileAvailable: true,
    sampleSizeQuality: profile.coverage.sampleSizeQuality,
    sessionsObserved: profile.coverage.sessionsObserved,
    episodeCount: profile.coverage.episodeCount,
    notableCount: profile.episodeDistribution.notableCount,
    significantCount: profile.episodeDistribution.significantCount,
    extremeCount: profile.episodeDistribution.extremeCount,
    positiveEpisodeCount: profile.episodeDistribution.positiveEpisodeCount,
    negativeEpisodeCount: profile.episodeDistribution.negativeEpisodeCount,
    mixedEpisodeCount: profile.episodeDistribution.mixedEpisodeCount,
    positiveEpisodePct: profile.episodeDistribution.positiveEpisodePct,
    negativeEpisodePct: profile.episodeDistribution.negativeEpisodePct,
    episodesPer30Sessions: profile.recurrence.episodesPer30Sessions,
    episodesPer90Sessions: profile.recurrence.episodesPer90Sessions,
    medianDaysBetweenEpisodes: profile.recurrence.medianDaysBetweenEpisodes,
    positiveCloseUpperQuartilePct: profile.closeBehavior.positiveEpisodesClosingUpperQuartilePct,
    positiveCloseNearHighPct: profile.closeBehavior.positiveEpisodesClosingNearHighPct,
    negativeCloseNearLowPct: profile.closeBehavior.negativeEpisodesClosingNearLowPct,
    nextSessionPositiveContinuationRate: profile.continuation.nextSessionPositiveContinuationRate,
    nextSessionNegativeContinuationRate: profile.continuation.nextSessionNegativeContinuationRate,
    historyStartDate: profile.coverage.historyStartDate,
    historyEndDate: profile.coverage.historyEndDate,
    computedAt: profile.computedAt,
    latestSourceHistoryDate: profile.freshness.latestSourceHistoryDate,
    latestEpisodeDateUsed: profile.freshness.latestEpisodeDateUsed,
    sourceDailyRowCount: profile.freshness.sourceDailyRowCount,
    sourceEpisodeCount: profile.freshness.sourceEpisodeCount,
  };
}

function mapComparable(episode: ReturnType<typeof getComparableHistoricalEpisodes>[number]): RepeatMoverComparableEpisode {
  return {
    episodeId: episode.episodeId,
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
    similarity: episode.similarity,
  };
}

export async function getRepeatMoverContext(input: {
  securityId: SecurityId;
  currentContext: RepeatMoverContextInput;
  data: RepeatMoverDataAccess;
  assembledAt?: string;
  comparableLimit?: number;
}): Promise<RepeatMoverContext> {
  const assembledAt = input.assembledAt ?? new Date().toISOString();
  const currentContext = normalizeRepeatMoverCurrentContext(input.currentContext);
  const limit = input.comparableLimit ?? repeatMoverConfig().defaultComparableLimit;

  const storedProfile = await input.data.getBehaviorProfile(input.securityId);
  if (!storedProfile) {
    const profile = unavailableRepeatMoverProfileSnapshot();
    const comparableHistory = {
      comparableEpisodeCount: 0,
      closestComparableEpisodes: [],
      mostRecentComparableEpisode: null,
    };
    return {
      version: REPEAT_MOVER_VERSION,
      securityId: input.securityId,
      currentSymbol: currentContext.observedSymbol,
      currentContext,
      profile,
      comparableHistory,
      evidenceLabels: deriveRepeatMoverEvidenceLabels({ profile, comparableHistory }),
      assembledAt,
    };
  }

  const [dailyHistory, episodes] = await Promise.all([
    input.data.listDailyHistory(input.securityId),
    input.data.listEpisodes(input.securityId),
  ]);

  const rmConfig = repeatMoverConfig();
  let comparables = getComparableHistoricalEpisodes({
    securityId: input.securityId,
    dailyHistory,
    episodes,
    currentContext: {
      direction: currentContext.direction ?? undefined,
      movePct: currentContext.movePct,
      tier: currentContext.tier ?? undefined,
      sessionDate: currentContext.sessionDate,
    },
    config: { comparableMovePctTolerance: rmConfig.comparableMovePctTolerance },
    limit,
  }).map(mapComparable);

  if (rmConfig.comparableExcludeIdenticalAbsMovePct) {
    comparables = comparables.filter(
      (episode) => episode.similarity.movePctDelta !== 0,
    );
  }

  const mostRecentComparableEpisode = comparables.length === 0
    ? null
    : [...comparables].sort(
      (left, right) => (right.sessionDate ?? "").localeCompare(left.sessionDate ?? ""),
    )[0] ?? null;

  const comparableHistory = {
    comparableEpisodeCount: comparables.length,
    closestComparableEpisodes: comparables,
    mostRecentComparableEpisode,
  };

  const profile = repeatMoverProfileSnapshotFromBehaviorProfile(storedProfile);

  return {
    version: REPEAT_MOVER_VERSION,
    securityId: input.securityId,
    currentSymbol: currentContext.observedSymbol ?? storedProfile.observedSymbol,
    currentContext,
    profile,
    comparableHistory,
    evidenceLabels: deriveRepeatMoverEvidenceLabels({ profile, comparableHistory }),
    assembledAt,
  };
}

/** Guard: ensure result never exposes prediction-style fields. */
export function assertRepeatMoverContextIsEvidenceOnly(context: RepeatMoverContext): void {
  const forbidden = [
    "prediction",
    "probability",
    "confidence",
    "winRate",
    "expectedMove",
    "buy",
    "sell",
  ];
  const json = JSON.stringify(context).toLowerCase();
  for (const key of forbidden) {
    if (json.includes(`"${key.toLowerCase()}"`)) {
      throw new Error(`repeat mover context must not include ${key}`);
    }
  }
}
