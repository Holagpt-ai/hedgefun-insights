import type { CorporateEventType } from "@/config/security-intelligence.config";
import type { CorporateEvent, EventReactionLink } from "@/types/security-intelligence";

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function corporateEventFromRow(row: Record<string, unknown>): CorporateEvent {
  const publishedAt = readString(row.published_at) ?? readString(row.publishedAt);
  return {
    eventId: String(row.event_id),
    securityId: String(row.security_id),
    observedSymbol: readString(row.observed_symbol),
    eventType: String(row.event_type) as CorporateEventType,
    eventAt: String(row.event_at),
    publishedAt,
    title: String(row.title),
    summary: readString(row.summary),
    source: readString(row.source),
    sourceUrl: readString(row.source_url),
    providerEventId: readString(row.provider_event_id),
    accessionId: readString(row.accession_id),
    metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? row.metadata as Record<string, unknown>
      : null,
    sourceAsOf: readString(row.source_as_of),
    fetchedAt: readString(row.fetched_at),
    computedAt: readString(row.computed_at),
    quality: row.quality as CorporateEvent["quality"],
    freshness: row.freshness as CorporateEvent["freshness"],
    provenance: row.provenance as CorporateEvent["provenance"],
    createdAt: String(row.created_at),
  };
}

export function eventReactionLinkFromRow(row: Record<string, unknown>): EventReactionLink {
  const evidenceRaw = readString(row.evidence);
  let evidenceFlags: string[] | null = null;
  if (evidenceRaw) {
    try {
      const parsed = JSON.parse(evidenceRaw) as unknown;
      if (Array.isArray(parsed)) evidenceFlags = parsed.map(String);
    } catch {
      evidenceFlags = null;
    }
  }
  return {
    linkId: String(row.link_id),
    eventId: String(row.event_id),
    episodeId: String(row.episode_id),
    securityId: String(row.security_id),
    relationType: row.relation_type as EventReactionLink["relationType"],
    timeDeltaSeconds: row.time_delta_seconds == null ? null : Number(row.time_delta_seconds),
    timeDeltaMinutes: row.time_delta_minutes == null ? null : Number(row.time_delta_minutes),
    confidence: null,
    evidence: evidenceRaw,
    provenance: row.provenance as EventReactionLink["provenance"],
    source: readString(row.source),
    sourceAsOf: readString(row.source_as_of),
    createdAt: String(row.created_at),
    ...(evidenceFlags ? { evidenceFlags } : {}),
  } as EventReactionLink & { evidenceFlags?: string[] };
}

export function corporateEventToRow(event: CorporateEvent): Record<string, unknown> {
  return {
    event_id: event.eventId,
    security_id: event.securityId,
    observed_symbol: event.observedSymbol,
    event_type: event.eventType,
    event_at: event.eventAt,
    published_at: event.publishedAt ?? event.eventAt,
    title: event.title,
    summary: event.summary,
    source: event.source,
    source_url: event.sourceUrl,
    provider_event_id: event.providerEventId,
    accession_id: event.accessionId,
    source_as_of: event.sourceAsOf,
    fetched_at: event.fetchedAt,
    computed_at: event.computedAt,
    quality: event.quality,
    freshness: event.freshness,
    provenance: event.provenance,
    metadata: event.metadata,
    created_at: event.createdAt,
  };
}
