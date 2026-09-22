import {
  attachLinkedEventsToComparableEpisode,
  selectEpisodeLinkedEvents,
} from "@/lib/episode-event-linkage/episode-linked-event-evidence";
import type { CorporateEvent, EventReactionLink } from "@/types/security-intelligence";
import type { RepeatMoverComparableEpisode } from "@/types/repeat-mover";

export function attachHistoricalEventsFromStore(
  episodes: readonly RepeatMoverComparableEpisode[],
  links: readonly EventReactionLink[],
  events: readonly CorporateEvent[],
): RepeatMoverComparableEpisode[] {
  if (episodes.length === 0 || links.length === 0 || events.length === 0) {
    return [...episodes];
  }

  const eventsById = new Map(events.map((event) => [event.eventId, event]));
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
