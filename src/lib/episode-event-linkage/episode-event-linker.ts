import { classifyEventEpisodeRelationship } from "@/lib/episode-event-linkage/classify-event-episode-relationship";
import { buildEpisodeSessionContext } from "@/lib/episode-event-linkage/episode-session-context";
import { eventReactionLinkId } from "@/lib/episode-event-linkage/deterministic-ids";
import { linkCorporateEventsToEpisode } from "@/lib/episode-event-linkage/link-events-to-episodes";
import type { CorporateEvent, MarketBehaviorEpisode } from "@/types/security-intelligence";
import type { SecurityId } from "@/types/security-identity";

export interface EpisodeLinkerAudit {
  links: ReturnType<typeof linkCorporateEventsToEpisode>;
  outsideWindowRejects: number;
  wrongSecurityRejects: number;
  timestampRejects: number;
  otherRejects: number;
}

export function linkEpisodesForSecurityWithAudit(input: {
  securityId: SecurityId;
  episodes: readonly MarketBehaviorEpisode[];
  events: readonly CorporateEvent[];
  tradingSessionDates: readonly string[];
  linkedAt: string;
}): {
  links: Array<{
    link_id: string;
    event_id: string;
    episode_id: string;
    security_id: string;
    relation_type: string;
    time_delta_seconds: number | null;
    time_delta_minutes: number | null;
    evidence: string;
    provenance: string;
    source: string;
    created_at: string;
  }>;
  audit: EpisodeLinkerAudit;
} {
  const audit: EpisodeLinkerAudit = {
    links: [],
    outsideWindowRejects: 0,
    wrongSecurityRejects: 0,
    timestampRejects: 0,
    otherRejects: 0,
  };

  const proposed = [];
  for (const episode of input.episodes) {
    if (episode.securityId !== input.securityId) {
      audit.wrongSecurityRejects += 1;
      continue;
    }
    const session = buildEpisodeSessionContext(episode);
    if (!session) continue;

    for (const event of input.events) {
      const decision = classifyEventEpisodeRelationship({
        episodeSecurityId: input.securityId,
        event,
        episode: session,
        tradingSessionDates: input.tradingSessionDates,
      });
      if (decision.eligible) {
        continue;
      }
      switch (decision.rejectReason) {
        case "wrong_security":
          audit.wrongSecurityRejects += 1;
          break;
        case "missing_event_timestamp":
          audit.timestampRejects += 1;
          break;
        case "outside_linkage_window":
          audit.outsideWindowRejects += 1;
          break;
        default:
          audit.otherRejects += 1;
      }
    }

    proposed.push(...linkCorporateEventsToEpisode({
      episode,
      events: input.events,
      tradingSessionDates: input.tradingSessionDates,
    }));
  }

  audit.links = proposed;

  const links = proposed.map((link) => ({
    link_id: eventReactionLinkId(link.episodeId, link.eventId),
    event_id: link.eventId,
    episode_id: link.episodeId,
    security_id: link.securityId,
    relation_type: link.relationType,
    time_delta_seconds: link.timeDeltaSeconds,
    time_delta_minutes: link.timeDeltaMinutes,
    evidence: link.evidence,
    provenance: link.provenance,
    source: link.source,
    created_at: input.linkedAt,
  }));

  return { links, audit };
}
