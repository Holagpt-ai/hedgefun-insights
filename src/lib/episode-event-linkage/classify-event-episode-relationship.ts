import {
  episodeEventLinkageConfig,
  eventRelationToTemporalRelationship,
  type EpisodeEventLinkageConfig,
  type EpisodeTemporalRelationship,
} from "@/config/episode-event-linkage.config";
import type { EventRelationType } from "@/config/security-intelligence.config";
import type { EpisodeSessionContext } from "@/lib/episode-event-linkage/episode-session-context";
import { easternParts } from "@/lib/market-session";
import type { CorporateEvent } from "@/types/security-intelligence";
import type { SecurityId } from "@/types/security-identity";

function tradingSessionDateEt(ms: number): string | null {
  const parts = easternParts(ms);
  if (!parts) return null;
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${parts.year}-${month}-${day}`;
}

export const LINK_EVIDENCE_FLAGS = [
  "SAME_SECURITY",
  "VERIFIED_PROVIDER_SOURCE",
  "PUBLICATION_TIMESTAMP_KNOWN",
  "PUBLICATION_BEFORE_EPISODE_END",
  "SAME_TRADING_SESSION",
  "PRIOR_TRADING_SESSION",
  "WITHIN_PRIOR_SESSION_WINDOW",
  "OUTSIDE_LINKAGE_WINDOW",
  "PUBLISHED_AFTER_EPISODE",
] as const;
export type LinkEvidenceFlag = (typeof LINK_EVIDENCE_FLAGS)[number];

export interface EventEpisodeLinkDecision {
  eligible: boolean;
  rejectReason: string | null;
  relationType: EventRelationType | null;
  temporalRelationship: EpisodeTemporalRelationship | null;
  evidenceFlags: readonly LinkEvidenceFlag[];
  timeDeltaSeconds: number | null;
}

function indexOfSession(sessionDate: string, tradingSessionDates: readonly string[]): number {
  return tradingSessionDates.indexOf(sessionDate);
}

function isWithinPriorTradingSessions(
  eventSessionDate: string,
  episodeSessionDate: string,
  tradingSessionDates: readonly string[],
  maxPrior: number,
): boolean {
  const episodeIdx = indexOfSession(episodeSessionDate, tradingSessionDates);
  const eventIdx = indexOfSession(eventSessionDate, tradingSessionDates);
  if (episodeIdx < 0 || eventIdx < 0) return false;
  if (eventIdx > episodeIdx) return false;
  return episodeIdx - eventIdx <= maxPrior;
}

export function publicationTimestampMs(
  event: Pick<CorporateEvent, "eventAt" | "publishedAt" | "metadata">,
): number | null {
  const publishedRaw = event.publishedAt
    ?? (event.metadata && typeof event.metadata.publishedAt === "string" ? event.metadata.publishedAt : null);
  const candidate = publishedRaw ?? event.eventAt;
  const ms = Date.parse(candidate);
  return Number.isFinite(ms) ? ms : null;
}

export function classifyEventEpisodeRelationship(input: {
  episodeSecurityId: SecurityId;
  event: Pick<CorporateEvent, "securityId" | "eventAt" | "publishedAt" | "metadata" | "provenance" | "source">;
  episode: EpisodeSessionContext;
  tradingSessionDates: readonly string[];
  config?: Partial<EpisodeEventLinkageConfig>;
}): EventEpisodeLinkDecision {
  const config = episodeEventLinkageConfig(input.config);
  const evidenceFlags: LinkEvidenceFlag[] = [];

  if (input.event.securityId !== input.episodeSecurityId) {
    return {
      eligible: false,
      rejectReason: "wrong_security",
      relationType: null,
      temporalRelationship: null,
      evidenceFlags,
      timeDeltaSeconds: null,
    };
  }
  evidenceFlags.push("SAME_SECURITY");

  const publishedMs = publicationTimestampMs(input.event);
  if (publishedMs === null) {
    return {
      eligible: false,
      rejectReason: "missing_event_timestamp",
      relationType: null,
      temporalRelationship: null,
      evidenceFlags,
      timeDeltaSeconds: null,
    };
  }
  evidenceFlags.push("PUBLICATION_TIMESTAMP_KNOWN");

  if (input.event.provenance === "PROVIDER" || input.event.source) {
    evidenceFlags.push("VERIFIED_PROVIDER_SOURCE");
  }

  const eventSessionDate = tradingSessionDateEt(publishedMs);
  if (!eventSessionDate) {
    return {
      eligible: false,
      rejectReason: "missing_event_timestamp",
      relationType: null,
      temporalRelationship: null,
      evidenceFlags,
      timeDeltaSeconds: null,
    };
  }
  const episodeSessionDate = input.episode.sessionDate;
  const timeDeltaSeconds = Math.round((input.episode.episodeStartMs - publishedMs) / 1000);

  const withinPriorWindow = isWithinPriorTradingSessions(
    eventSessionDate,
    episodeSessionDate,
    input.tradingSessionDates,
    config.priorTradingSessionsLookback,
  );

  const publishedBeforeEpisodeEnd = publishedMs <= input.episode.episodeEndMs;
  if (publishedBeforeEpisodeEnd) {
    evidenceFlags.push("PUBLICATION_BEFORE_EPISODE_END");
  } else {
    evidenceFlags.push("PUBLISHED_AFTER_EPISODE");
  }

  const sameSession = eventSessionDate === episodeSessionDate;
  if (sameSession) {
    evidenceFlags.push("SAME_TRADING_SESSION");
  }

  const episodeIdx = indexOfSession(episodeSessionDate, input.tradingSessionDates);
  const eventIdx = indexOfSession(eventSessionDate, input.tradingSessionDates);
  if (episodeIdx >= 0 && eventIdx === episodeIdx - 1) {
    evidenceFlags.push("PRIOR_TRADING_SESSION");
  }

  if (!withinPriorWindow && !sameSession && publishedMs > input.episode.episodeEndMs) {
    const followsDays = eventIdx >= 0 && episodeIdx >= 0 ? eventIdx - episodeIdx : 999;
    if (followsDays > config.maxFollowsSessionDays) {
      evidenceFlags.push("OUTSIDE_LINKAGE_WINDOW");
      return {
        eligible: false,
        rejectReason: "outside_linkage_window",
        relationType: null,
        temporalRelationship: null,
        evidenceFlags,
        timeDeltaSeconds,
      };
    }
  }

  if (!withinPriorWindow && !sameSession && publishedMs < input.episode.sessionOpenMs) {
    evidenceFlags.push("OUTSIDE_LINKAGE_WINDOW");
    return {
      eligible: false,
      rejectReason: "outside_linkage_window",
      relationType: null,
      temporalRelationship: null,
      evidenceFlags,
      timeDeltaSeconds,
    };
  }

  if (withinPriorWindow || sameSession) {
    evidenceFlags.push("WITHIN_PRIOR_SESSION_WINDOW");
  }

  let relationType: EventRelationType;

  if (publishedMs > input.episode.episodeEndMs) {
    relationType = "FOLLOWS_EPISODE";
  } else if (sameSession && publishedMs >= input.episode.sessionOpenMs && publishedMs <= input.episode.sessionCloseMs) {
    relationType = "OVERLAPS_EPISODE";
  } else if (sameSession) {
    relationType = "SAME_WINDOW";
  } else if (publishedMs < input.episode.episodeStartMs && withinPriorWindow) {
    if (!publishedBeforeEpisodeEnd) {
      return {
        eligible: false,
        rejectReason: "publication_after_episode_not_pre_event",
        relationType: null,
        temporalRelationship: null,
        evidenceFlags,
        timeDeltaSeconds,
      };
    }
    relationType = "PRECEDES_EPISODE";
  } else {
    relationType = "UNKNOWN_RELATIONSHIP";
  }

  return {
    eligible: true,
    rejectReason: null,
    relationType,
    temporalRelationship: eventRelationToTemporalRelationship(relationType),
    evidenceFlags,
    timeDeltaSeconds,
  };
}
