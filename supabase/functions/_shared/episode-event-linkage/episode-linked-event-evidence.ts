import {
  eventRelationToTemporalRelationship,
  type EpisodeTemporalRelationship,
} from "./temporal-relationship.ts";

export type EpisodeLinkedEventEvidence = {
  eventType: string;
  title: string;
  publishedAt: string | null;
  temporalRelationship: EpisodeTemporalRelationship;
  source: string | null;
};

export type EventReactionLink = {
  linkId: string;
  eventId: string;
  episodeId: string;
  relationType: string;
  timeDeltaSeconds: number | null;
};

export type CorporateEvent = {
  eventId: string;
  eventType: string;
  title: string;
  publishedAt: string | null;
  eventAt: string | null;
  source: string | null;
};

const RELATION_RANK: Record<EpisodeTemporalRelationship, number> = {
  EVENT_SAME_SESSION: 0,
  EVENT_PRECEDES_EPISODE: 1,
  TEMPORALLY_ASSOCIATED: 2,
  EVENT_FOLLOWS_EPISODE: 3,
};

/** Matches src/config/episode-event-linkage.config.ts default. */
export const MAX_EVENTS_PER_COMPARABLE = 3;

export function selectEpisodeLinkedEvents(input: {
  links: readonly EventReactionLink[];
  eventsById: ReadonlyMap<string, CorporateEvent>;
  maxEvents?: number;
}): EpisodeLinkedEventEvidence[] {
  const maxEvents = input.maxEvents ?? MAX_EVENTS_PER_COMPARABLE;
  const ranked: Array<{ evidence: EpisodeLinkedEventEvidence; rank: number; absDelta: number }> = [];

  for (const link of input.links) {
    const event = input.eventsById.get(link.eventId);
    if (!event) continue;
    const temporalRelationship = eventRelationToTemporalRelationship(link.relationType);
    ranked.push({
      evidence: {
        eventType: event.eventType,
        title: event.title,
        publishedAt: event.publishedAt ?? event.eventAt,
        temporalRelationship,
        source: event.source,
      },
      rank: RELATION_RANK[temporalRelationship],
      absDelta: Math.abs(link.timeDeltaSeconds ?? 0),
    });
  }

  ranked.sort((left, right) => {
    if (left.rank !== right.rank) return left.rank - right.rank;
    return left.absDelta - right.absDelta;
  });

  return ranked.slice(0, maxEvents).map((row) => row.evidence);
}

export function attachLinkedEventsToComparableEpisode<T extends { episodeId: string }>(
  episode: T,
  historicalEvents: EpisodeLinkedEventEvidence[] | undefined,
): T & { historicalEvents?: EpisodeLinkedEventEvidence[] } {
  if (!historicalEvents || historicalEvents.length === 0) return episode;
  return { ...episode, historicalEvents };
}
