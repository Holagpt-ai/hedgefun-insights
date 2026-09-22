import {
  episodeEventLinkageConfig,
  eventRelationToTemporalRelationship,
  type EpisodeTemporalRelationship,
} from "@/config/episode-event-linkage.config";
import type { CorporateEventType } from "@/config/security-intelligence.config";
import type { CorporateEvent, EventReactionLink } from "@/types/security-intelligence";

export interface EpisodeLinkedEventEvidence {
  eventType: CorporateEventType;
  title: string;
  publishedAt: string | null;
  temporalRelationship: EpisodeTemporalRelationship;
  source: string | null;
}

const RELATION_RANK: Record<EpisodeTemporalRelationship, number> = {
  EVENT_SAME_SESSION: 0,
  EVENT_PRECEDES_EPISODE: 1,
  TEMPORALLY_ASSOCIATED: 2,
  EVENT_FOLLOWS_EPISODE: 3,
};

export function selectEpisodeLinkedEvents(input: {
  links: readonly EventReactionLink[];
  eventsById: ReadonlyMap<string, CorporateEvent>;
  maxEvents?: number;
}): EpisodeLinkedEventEvidence[] {
  const maxEvents = input.maxEvents ?? episodeEventLinkageConfig().maxEventsPerComparable;
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
