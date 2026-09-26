import {
  mapPersistedRowToRepeatMoverEvidence,
  type RepeatMoverIntradayEvidence,
} from "./repeat-mover-evidence.ts";

export function intradayReconstructionByEpisodeId(
  rows: readonly Record<string, unknown>[],
): Map<string, RepeatMoverIntradayEvidence> {
  const map = new Map<string, RepeatMoverIntradayEvidence>();
  for (const row of rows) {
    const episodeId = typeof row.episode_id === "string" ? row.episode_id : null;
    if (!episodeId) continue;
    const evidence = mapPersistedRowToRepeatMoverEvidence(row);
    if (!evidence) continue;
    map.set(episodeId, evidence);
  }
  return map;
}

export function attachIntradayReconstructionToComparables<T extends { episodeId: string }>(
  episodes: readonly T[],
  persistedRows: readonly Record<string, unknown>[],
): Array<T & { observedIntradayReconstruction?: RepeatMoverIntradayEvidence }> {
  const byEpisode = intradayReconstructionByEpisodeId(persistedRows);
  return episodes.map((episode) => {
    const observedIntradayReconstruction = byEpisode.get(episode.episodeId);
    if (!observedIntradayReconstruction) return episode;
    return { ...episode, observedIntradayReconstruction };
  });
}
