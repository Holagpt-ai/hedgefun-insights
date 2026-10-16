import type { BehaviorProfileSampleQuality } from "@/config/behavior-profile.config";
import type { RadarRepeatMoverDisplayFacts } from "@/lib/radar/radar-repeat-movers-types";
import type { RepeatMoverProfileSnapshot } from "@/types/repeat-mover";
import type { HistoricalMatchSummary } from "@/lib/historical-intelligence/historical-match-summary";
import { formatHistoricalOutcomeDetail } from "@/lib/historical-intelligence/radar-handoff";

function formatCountLabel(count: number, singular: string, plural: string): string {
  return count === 1 ? `1 ${singular}` : `${count.toLocaleString("en-US")} ${plural}`;
}

function formatSampleQualityLabel(quality: BehaviorProfileSampleQuality | null): string | null {
  if (!quality) return null;
  const title = quality.charAt(0) + quality.slice(1).toLowerCase();
  return `${title} History`;
}

function formatMostRecentLabel(sessionDate: string | null): string | null {
  if (!sessionDate) return null;
  return `Most Recent: ${sessionDate}`;
}

export function buildRepeatMoverDisplayFacts(input: {
  profile: RepeatMoverProfileSnapshot;
  comparableEpisodeCount: number;
  mostRecentComparableDate: string | null;
  historicalMatchSummary?: HistoricalMatchSummary | null;
}): RadarRepeatMoverDisplayFacts {
  const similarPriorMovesLabel = input.comparableEpisodeCount > 0
    ? formatCountLabel(input.comparableEpisodeCount, "Similar Prior Move", "Similar Prior Moves")
    : null;

  const episodeCount = input.profile.episodeCount;
  const historicalEpisodesLabel = episodeCount !== null && episodeCount > 0
    ? formatCountLabel(episodeCount, "Historical Episode", "Historical Episodes")
    : null;

  const sampleQualityLabel = input.profile.profileAvailable
    ? formatSampleQualityLabel(input.profile.sampleSizeQuality)
    : null;

  const mostRecentComparableLabel = formatMostRecentLabel(input.mostRecentComparableDate);

  const sessions = input.profile.sessionsObserved;
  const sessionsObservedLabel = sessions !== null && sessions > 0
    ? `${sessions.toLocaleString("en-US")} Sessions Observed`
    : null;

  const outcomeLines =
    input.historicalMatchSummary != null
      ? formatHistoricalOutcomeDetail(input.historicalMatchSummary).slice(0, 3)
      : [];

  const lines = [
    similarPriorMovesLabel,
    historicalEpisodesLabel,
    sampleQualityLabel,
    ...outcomeLines,
    mostRecentComparableLabel,
    sessionsObservedLabel,
  ].filter((line): line is string => Boolean(line));

  return {
    similarPriorMovesLabel,
    historicalEpisodesLabel,
    sampleQualityLabel,
    mostRecentComparableLabel,
    sessionsObservedLabel,
    lines,
  };
}
