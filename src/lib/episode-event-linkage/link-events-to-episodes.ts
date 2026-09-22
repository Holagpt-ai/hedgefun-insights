import type { EpisodeEventLinkageConfig } from "@/config/episode-event-linkage.config";
import {
  classifyEventEpisodeRelationship,
  type EventEpisodeLinkDecision,
} from "@/lib/episode-event-linkage/classify-event-episode-relationship";
import { buildEpisodeSessionContext } from "@/lib/episode-event-linkage/episode-session-context";
import type { CorporateEvent, EventReactionLink, MarketBehaviorEpisode } from "@/types/security-intelligence";
import type { SecurityId } from "@/types/security-identity";

export interface ProposedEventReactionLink {
  eventId: string;
  episodeId: string;
  securityId: SecurityId;
  relationType: NonNullable<EventEpisodeLinkDecision["relationType"]>;
  timeDeltaSeconds: number | null;
  timeDeltaMinutes: number | null;
  evidence: string;
  provenance: EventReactionLink["provenance"];
  source: string | null;
}

export function linkCorporateEventsToEpisode(input: {
  episode: MarketBehaviorEpisode;
  events: readonly CorporateEvent[];
  tradingSessionDates: readonly string[];
  config?: Partial<EpisodeEventLinkageConfig>;
}): ProposedEventReactionLink[] {
  const session = buildEpisodeSessionContext(input.episode);
  if (!session) return [];

  const links: ProposedEventReactionLink[] = [];
  const seenEventIds = new Set<string>();

  for (const event of input.events) {
    if (seenEventIds.has(event.eventId)) continue;
    const decision = classifyEventEpisodeRelationship({
      episodeSecurityId: input.episode.securityId,
      event: {
        securityId: event.securityId,
        eventAt: event.eventAt,
        publishedAt: event.publishedAt,
        metadata: event.metadata,
        provenance: event.provenance,
        source: event.source,
      },
      episode: session,
      tradingSessionDates: input.tradingSessionDates,
      config: input.config,
    });
    if (!decision.eligible || !decision.relationType) continue;
    seenEventIds.add(event.eventId);
    links.push({
      eventId: event.eventId,
      episodeId: input.episode.episodeId,
      securityId: input.episode.securityId,
      relationType: decision.relationType,
      timeDeltaSeconds: decision.timeDeltaSeconds,
      timeDeltaMinutes: decision.timeDeltaSeconds == null
        ? null
        : Math.round(decision.timeDeltaSeconds / 60),
      evidence: JSON.stringify(decision.evidenceFlags),
      provenance: "DERIVED",
      source: "episode_event_linkage_v1",
    });
  }

  return links;
}
