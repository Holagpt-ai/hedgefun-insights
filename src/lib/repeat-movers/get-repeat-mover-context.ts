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
import { attachHistoricalEventsFromStore } from "@/lib/episode-event-linkage/attach-events-to-comparables";
import { attachForwardOutcomesFromStore } from "@/lib/forward-outcomes/attach-forward-outcomes-to-comparables";
import { attachIntradayReconstructionToComparables } from "@/lib/intraday-reconstruction/attach-intraday-to-comparables";
import type { CorporateEvent, EventReactionLink } from "@/types/security-intelligence";
import type { PersistedForwardOutcomeRow } from "@/lib/forward-outcomes/forward-outcome-types";
import type { MarketBehaviorEpisode, SecurityDailyHistory } from "@/types/security-intelligence";
import type { SecurityId } from "@/types/security-identity";

export interface RepeatMoverDataAccess {
  getBehaviorProfile(securityId: SecurityId): Promise<SecurityBehaviorProfile | null>;
  listDailyHistory(securityId: SecurityId): Promise<readonly SecurityDailyHistory[]>;
  listEpisodes(securityId: SecurityId): Promise<readonly MarketBehaviorEpisode[]>;
  listForwardOutcomesForEpisodes?(
    episodeIds: readonly string[],
  ): Promise<readonly PersistedForwardOutcomeRow[]>;
  listEventReactionLinksForEpisodes?(
    episodeIds: readonly string[],
  ): Promise<readonly (EventReactionLink & { corporateEvent?: CorporateEvent | null })[]>;
  listIntradayReconstructionForEpisodes?(
    episodeIds: readonly string[],
  ): Promise<readonly Record<string, unknown>[]>;
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
    episodesWithD1Outcome: profile.forwardOutcomes.episodesWithD1Outcome,
    episodesWithD5Outcome: profile.forwardOutcomes.episodesWithD5Outcome,
    forwardOutcomeCoveragePctD1: profile.forwardOutcomes.forwardOutcomeCoveragePctD1,
    medianD1ReturnPct: profile.forwardOutcomes.medianD1ReturnPct,
    medianD5ReturnPct: profile.forwardOutcomes.medianD5ReturnPct,
    positiveD1Pct: profile.forwardOutcomes.positiveD1Pct,
    negativeD1Pct: profile.forwardOutcomes.negativeD1Pct,
    observedNextSessionSampleSize: profile.forwardOutcomes.observedNextSessionSampleSize,
    observedNextSessionPositivePct: profile.forwardOutcomes.observedNextSessionPositivePct,
    observedNextSessionNegativePct: profile.forwardOutcomes.observedNextSessionNegativePct,
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

  if (comparables.length > 0) {
    const episodeIds = comparables.map((episode) => episode.episodeId);
    if (input.data.listForwardOutcomesForEpisodes) {
      const persisted = await input.data.listForwardOutcomesForEpisodes(episodeIds);
      comparables = attachForwardOutcomesFromStore(comparables, persisted);
    }
    if (input.data.listIntradayReconstructionForEpisodes) {
      const intradayRows = await input.data.listIntradayReconstructionForEpisodes(episodeIds);
      comparables = attachIntradayReconstructionToComparables(comparables, intradayRows);
    }
    if (input.data.listEventReactionLinksForEpisodes) {
      const linkRows = await input.data.listEventReactionLinksForEpisodes(episodeIds);
      const links: EventReactionLink[] = linkRows.map((row) => ({
        linkId: row.linkId,
        eventId: row.eventId,
        episodeId: row.episodeId,
        securityId: row.securityId,
        relationType: row.relationType,
        timeDeltaSeconds: row.timeDeltaSeconds,
        timeDeltaMinutes: row.timeDeltaMinutes,
        confidence: null,
        evidence: row.evidence,
        provenance: row.provenance,
        source: row.source,
        sourceAsOf: row.sourceAsOf,
        createdAt: row.createdAt,
      }));
      const events: CorporateEvent[] = linkRows
        .map((row) => row.corporateEvent)
        .filter((event): event is CorporateEvent => event != null);
      comparables = attachHistoricalEventsFromStore(comparables, links, events);
    }
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
