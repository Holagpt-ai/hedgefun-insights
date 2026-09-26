import type { CorporateEvent, EventReactionLink } from "./episode-linked-event-evidence.ts";

function readNum(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)) {
    return null;
  }
  return trimmed;
}

/** Parses joined rows from event_reaction_link_list_for_episodes_v1. Skips malformed rows. */
export function parseEventReactionLinkRows(rawRows: readonly Record<string, unknown>[]): {
  links: EventReactionLink[];
  eventsById: Map<string, CorporateEvent>;
} {
  const links: EventReactionLink[] = [];
  const eventsById = new Map<string, CorporateEvent>();

  for (const row of rawRows) {
    const linkId = readUuid(row.link_id);
    const eventId = readUuid(row.event_id);
    const episodeId = readUuid(row.episode_id);
    if (!linkId || !eventId || !episodeId) continue;
    if (typeof row.relation_type !== "string") continue;

    links.push({
      linkId,
      eventId,
      episodeId,
      relationType: row.relation_type,
      timeDeltaSeconds: readNum(row.time_delta_seconds),
    });

    if (typeof row.event_type !== "string" || typeof row.title !== "string" || !row.title.trim()) {
      continue;
    }
    if (!eventsById.has(eventId)) {
      eventsById.set(eventId, {
        eventId,
        eventType: row.event_type,
        title: row.title.trim(),
        publishedAt: typeof row.published_at === "string" ? row.published_at : null,
        eventAt: typeof row.event_at === "string" ? row.event_at : null,
        source: typeof row.event_source === "string"
          ? row.event_source
          : typeof row.source === "string"
            ? row.source
            : null,
      });
    }
  }

  return { links, eventsById };
}
