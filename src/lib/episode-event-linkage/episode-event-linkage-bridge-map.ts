import { corporateEventFromRow, eventReactionLinkFromRow } from "@/lib/episode-event-linkage/corporate-event-record";
import type { CorporateEvent, EventReactionLink } from "@/types/security-intelligence";

export function eventReactionLinkWithEventFromBridgeRow(
  row: Record<string, unknown>,
): EventReactionLink & { corporateEvent: CorporateEvent | null } {
  const link = eventReactionLinkFromRow(row);
  const hasEvent = typeof row.event_type === "string" && typeof row.title === "string";
  if (!hasEvent) {
    return { ...link, corporateEvent: null };
  }
  const corporateEvent = corporateEventFromRow({
    event_id: row.event_id,
    security_id: row.security_id,
    event_type: row.event_type,
    event_at: row.event_at,
    published_at: row.published_at,
    title: row.title,
    source: row.event_source ?? row.source,
    source_url: row.source_url,
    provider_event_id: row.provider_event_id,
    quality: "DERIVED",
    freshness: "UNKNOWN",
    provenance: "PROVIDER",
    created_at: row.created_at,
  });
  return { ...link, corporateEvent };
}
