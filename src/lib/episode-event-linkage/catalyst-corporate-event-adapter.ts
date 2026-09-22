import { corporateEventIdFromDedupeKey } from "@/lib/episode-event-linkage/deterministic-ids";
import { catalystRowToCorporateEventDraft } from "@/lib/episode-event-linkage/map-catalyst-to-corporate-event";
import { resolveCatalystEventSecurityId } from "@/lib/episode-event-linkage/resolve-catalyst-security-id";
import { SecurityIdentityStore } from "@/lib/security-identity/security-identity";
import type { CorporateEvent } from "@/types/security-intelligence";
import type { CatalystEventType } from "@/types/catalyst";
import type { SecurityId } from "@/types/security-identity";

export interface CatalystFeedRow {
  dedupe_key: string;
  symbol: string;
  event_type: CatalystEventType;
  event_date: string | null;
  event_time: string | null;
  title: string | null;
  description: string | null;
  source_name: string;
  source_url: string | null;
  provider: string;
  provider_article_id: string | null;
  published_at: string | null;
  facts?: Record<string, unknown> | null;
}

export interface CatalystAdapterSkip {
  dedupeKey: string;
  reason: string;
}

export interface CatalystAdapterResult {
  examined: number;
  mapped: number;
  skips: CatalystAdapterSkip[];
  unresolved: CatalystAdapterSkip[];
  corporateEvents: CorporateEvent[];
  dedupeKeysSeen: Set<string>;
}

export function mapCatalystRowToCorporateEvent(input: {
  row: CatalystFeedRow;
  store: SecurityIdentityStore;
  ingestedAt: string;
}): { event: CorporateEvent | null; skip: CatalystAdapterSkip | null; unresolved: CatalystAdapterSkip | null } {
  const dedupeKey = input.row.dedupe_key.trim();
  if (!dedupeKey) {
    return { event: null, skip: { dedupeKey: "", reason: "missing_dedupe_key" }, unresolved: null };
  }

  const title = input.row.title?.trim() ?? "";
  if (!title) {
    return { event: null, skip: { dedupeKey, reason: "missing_title" }, unresolved: null };
  }

  const eventDate = input.row.event_date?.slice(0, 10) ?? null;
  const resolution = resolveCatalystEventSecurityId({
    store: input.store,
    symbol: input.row.symbol,
    eventDate,
    provider: input.row.provider,
    providerArticleId: input.row.provider_article_id,
    dedupeKey,
    facts: input.row.facts ?? null,
  });
  if (resolution.status === "unresolved") {
    return {
      event: null,
      skip: null,
      unresolved: { dedupeKey, reason: resolution.reason },
    };
  }

  if (!eventDate) {
    return { event: null, skip: { dedupeKey, reason: "missing_event_date" }, unresolved: null };
  }

  const draft = catalystRowToCorporateEventDraft({
    securityId: resolution.securityId,
    dedupeKey,
    symbol: input.row.symbol,
    eventType: input.row.event_type,
    eventDate,
    eventTime: input.row.event_time,
    title,
    description: input.row.description,
    sourceName: input.row.source_name,
    sourceUrl: input.row.source_url,
    provider: input.row.provider,
    publishedAt: input.row.published_at,
  });
  if (!draft) {
    return { event: null, skip: { dedupeKey, reason: "invalid_timestamps_or_title" }, unresolved: null };
  }

  const eventId = corporateEventIdFromDedupeKey(dedupeKey);
  const event: CorporateEvent = {
    eventId,
    securityId: draft.securityId as SecurityId,
    observedSymbol: draft.observedSymbol,
    eventType: draft.eventType,
    eventAt: draft.eventAt,
    publishedAt: draft.publishedAt,
    title: draft.title,
    summary: draft.summary,
    source: draft.source,
    sourceUrl: draft.sourceUrl,
    providerEventId: draft.providerEventId,
    accessionId: null,
    metadata: {
      catalystDedupeKey: dedupeKey,
      identityResolutionMethod: resolution.method,
      providerArticleId: input.row.provider_article_id,
    },
    sourceAsOf: draft.publishedAt,
    fetchedAt: input.ingestedAt,
    computedAt: input.ingestedAt,
    quality: "AUTHORITATIVE",
    freshness: "FRESH",
    provenance: "PROVIDER",
    createdAt: input.ingestedAt,
  };

  return { event, skip: null, unresolved: null };
}

export function adaptCatalystRowsToCorporateEvents(input: {
  rows: readonly CatalystFeedRow[];
  store: SecurityIdentityStore;
  ingestedAt: string;
}): CatalystAdapterResult {
  const skips: CatalystAdapterSkip[] = [];
  const unresolved: CatalystAdapterSkip[] = [];
  const corporateEvents: CorporateEvent[] = [];
  const dedupeKeysSeen = new Set<string>();

  for (const row of input.rows) {
    const dedupeKey = row.dedupe_key?.trim() ?? "";
    if (dedupeKey && dedupeKeysSeen.has(dedupeKey)) {
      skips.push({ dedupeKey, reason: "duplicate_in_batch" });
      continue;
    }
    if (dedupeKey) dedupeKeysSeen.add(dedupeKey);

    const outcome = mapCatalystRowToCorporateEvent({ row, store: input.store, ingestedAt: input.ingestedAt });
    if (outcome.unresolved) unresolved.push(outcome.unresolved);
    else if (outcome.skip) skips.push(outcome.skip);
    else if (outcome.event) corporateEvents.push(outcome.event);
  }

  return {
    examined: input.rows.length,
    mapped: corporateEvents.length,
    skips,
    unresolved,
    corporateEvents,
    dedupeKeysSeen,
  };
}
