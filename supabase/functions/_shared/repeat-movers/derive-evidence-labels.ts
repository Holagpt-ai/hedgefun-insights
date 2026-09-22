import type { RepeatMoverEvidenceLabel, RepeatMoverProfileSnapshot } from "./types.ts";

const RECURRING_EPISODES_PER_30_MIN = 1;
const RECURRING_EPISODE_COUNT_MIN = 5;
const RARE_EVENT_MAX_EPISODE_COUNT = 2;

export function deriveRepeatMoverEvidenceLabels(input: {
  profile: RepeatMoverProfileSnapshot;
  comparableHistory: { comparableEpisodeCount: number };
}): RepeatMoverEvidenceLabel[] {
  const labels: RepeatMoverEvidenceLabel[] = [];
  if (!input.profile.profileAvailable) {
    labels.push("NO_HISTORY");
    return labels;
  }
  const quality = input.profile.sampleSizeQuality;
  if (quality === "INSUFFICIENT" || quality === "LIMITED") {
    labels.push("LIMITED_HISTORY");
  }
  const episodeCount = input.profile.episodeCount ?? 0;
  const episodesPer30 = input.profile.episodesPer30Sessions;
  const recurring = (episodesPer30 !== null && episodesPer30 >= RECURRING_EPISODES_PER_30_MIN)
    || episodeCount >= RECURRING_EPISODE_COUNT_MIN;
  if (recurring) labels.push("RECURRING_MOVER");
  if (
    episodeCount <= RARE_EVENT_MAX_EPISODE_COUNT
    && (quality === "INSUFFICIENT" || quality === "LIMITED")
    && episodeCount > 0
  ) {
    labels.push("RARE_EVENT");
  }
  if (input.comparableHistory.comparableEpisodeCount > 0) {
    labels.push("SIMILAR_PRIOR_EPISODES_FOUND");
  }
  return labels;
}
