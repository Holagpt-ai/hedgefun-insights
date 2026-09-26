import {
  attachLinkedEventsToComparableEpisode,
  selectEpisodeLinkedEvents,
  type CorporateEvent,
  type EventReactionLink,
} from "./episode-linked-event-evidence.ts";

export function attachHistoricalEventsFromStore<T extends { episodeId: string }>(
  episodes: readonly T[],
  links: readonly EventReactionLink[],
  eventsById: ReadonlyMap<string, CorporateEvent>,
): Array<T & { historicalEvents?: import("./episode-linked-event-evidence.ts").EpisodeLinkedEventEvidence[] }> {
  if (episodes.length === 0 || links.length === 0 || eventsById.size === 0) {
    return [...episodes];
  }

  const linksByEpisode = new Map<string, EventReactionLink[]>();
  for (const link of links) {
    const bucket = linksByEpisode.get(link.episodeId) ?? [];
    bucket.push(link);
    linksByEpisode.set(link.episodeId, bucket);
  }

  return episodes.map((episode) => {
    const episodeLinks = linksByEpisode.get(episode.episodeId) ?? [];
    const historicalEvents = selectEpisodeLinkedEvents({
      links: episodeLinks,
      eventsById,
    });
    return attachLinkedEventsToComparableEpisode(episode, historicalEvents);
  });
}
