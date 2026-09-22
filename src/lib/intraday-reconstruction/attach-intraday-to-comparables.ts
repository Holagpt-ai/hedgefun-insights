import { mapPersistedRowToRepeatMoverEvidence } from "@/lib/intraday-reconstruction/intraday-reconstruction-record";
import type { RepeatMoverIntradayEvidence } from "@/lib/intraday-reconstruction/intraday-reconstruction-types";
import type { RepeatMoverComparableEpisode } from "@/types/repeat-mover";

export function intradayReconstructionByEpisodeId(
  rows: readonly Record<string, unknown>[],
): Map<string, RepeatMoverIntradayEvidence> {
  const map = new Map<string, RepeatMoverIntradayEvidence>();
  for (const row of rows) {
    const episodeId = typeof row.episode_id === "string" ? row.episode_id : null;
    if (!episodeId) continue;
    map.set(episodeId, mapPersistedRowToRepeatMoverEvidence(row));
  }
  return map;
}

export function attachIntradayReconstructionToComparables(
  episodes: readonly RepeatMoverComparableEpisode[],
  persistedRows: readonly Record<string, unknown>[],
): RepeatMoverComparableEpisode[] {
  const byEpisode = intradayReconstructionByEpisodeId(persistedRows);
  return episodes.map((episode) => {
    const observedIntradayReconstruction = byEpisode.get(episode.episodeId);
    if (!observedIntradayReconstruction) return episode;
    return { ...episode, observedIntradayReconstruction };
  });
}
