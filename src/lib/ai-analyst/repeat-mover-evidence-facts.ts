import type { RepeatMoverContext } from "@/types/repeat-mover";

/** Structured, deterministic facts for AI Analyst (no generated claims). */
export interface RepeatMoverAnalystEvidenceFacts {
  securityId: string;
  symbol: string | null;
  profileAvailable: boolean;
  evidenceLabels: readonly string[];
  sampleSizeQuality: string | null;
  sessionsObserved: number | null;
  episodeCount: number | null;
  episodesPer30Sessions: number | null;
  comparableEpisodeCount: number;
  closestComparableSessionDates: readonly (string | null)[];
  mostRecentComparableSessionDate: string | null;
  profileComputedAt: string | null;
  latestSourceHistoryDate: string | null;
}

export function repeatMoverContextToAnalystFacts(
  context: RepeatMoverContext | null | undefined,
): RepeatMoverAnalystEvidenceFacts | null {
  if (!context) return null;
  return {
    securityId: context.securityId,
    symbol: context.currentSymbol,
    profileAvailable: context.profile.profileAvailable,
    evidenceLabels: context.evidenceLabels,
    sampleSizeQuality: context.profile.sampleSizeQuality,
    sessionsObserved: context.profile.sessionsObserved,
    episodeCount: context.profile.episodeCount,
    episodesPer30Sessions: context.profile.episodesPer30Sessions,
    comparableEpisodeCount: context.comparableHistory.comparableEpisodeCount,
    closestComparableSessionDates: context.comparableHistory.closestComparableEpisodes
      .slice(0, 5)
      .map((episode) => episode.sessionDate),
    mostRecentComparableSessionDate:
      context.comparableHistory.mostRecentComparableEpisode?.sessionDate ?? null,
    profileComputedAt: context.profile.computedAt,
    latestSourceHistoryDate: context.profile.latestSourceHistoryDate,
  };
}
