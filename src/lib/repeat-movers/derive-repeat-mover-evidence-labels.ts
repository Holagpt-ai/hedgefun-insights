import { repeatMoverConfig, type RepeatMoverEvidenceLabel } from "@/config/repeat-mover.config";
import type { RepeatMoverComparableHistory, RepeatMoverProfileSnapshot } from "@/types/repeat-mover";

export function deriveRepeatMoverEvidenceLabels(input: {
  profile: RepeatMoverProfileSnapshot;
  comparableHistory: RepeatMoverComparableHistory;
  config?: Partial<ReturnType<typeof repeatMoverConfig>>;
}): RepeatMoverEvidenceLabel[] {
  const config = repeatMoverConfig(input.config);
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
  const recurring = (episodesPer30 !== null && episodesPer30 >= config.recurringEpisodesPer30SessionsMin)
    || episodeCount >= config.recurringEpisodeCountMin;
  if (recurring) {
    labels.push("RECURRING_MOVER");
  }

  if (
    episodeCount <= config.rareEventMaxEpisodeCount
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
