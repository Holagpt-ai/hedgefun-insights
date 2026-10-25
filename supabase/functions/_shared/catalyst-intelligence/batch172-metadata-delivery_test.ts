import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { companyIrAdapter } from "./adapters/company-ir.ts";
import { companyEventsAdapter } from "./adapters/company-events.ts";
import { ingestCandidate } from "./pipeline.ts";
import { createMemoryStore } from "./persistence.ts";
import { projectIntelCatalystEventFacts } from "../catalyst/intel-catalyst-event-facts-projection.ts";
import type { RawSourceItem, SourceRecord } from "./types.ts";

const NOW = new Date("2026-10-25T14:00:00.000Z");

function irSource(): SourceRecord {
  return {
    id: "ir-src-1",
    sourceKey: "aapl-ir",
    companyName: "Apple Inc.",
    ticker: "AAPL",
    cik: null,
    sourceType: "COMPANY_IR",
    url: "https://investor.example.com/rss",
    hostname: "investor.example.com",
    feedFormat: "rss",
    pollIntervalSeconds: 3600,
    enabled: true,
    priority: 10,
    evidenceTier: "TIER_1_PRIMARY",
    authorityKey: "aapl-ir",
    lastSuccessAt: null,
    lastContentHash: null,
    lastEtag: null,
    lastModified: null,
    failureCount: 0,
    backoffUntil: null,
    lastErrorCategory: null,
    metadata: {},
  };
}

function eventsSource(): SourceRecord {
  return {
    ...irSource(),
    id: "events-src-1",
    sourceKey: "aapl-events",
    sourceType: "COMPANY_EVENTS",
    url: "https://investor.example.com/calendar.ics",
    authorityKey: "aapl-events",
    feedFormat: "ics",
  };
}

async function rawItem(
  partial: Pick<RawSourceItem, "title" | "summary"> & { publishedAt?: string | null },
): Promise<RawSourceItem> {
  const publishedAt = partial.publishedAt === undefined ? NOW.toISOString() : partial.publishedAt;
  return {
    sourceId: "ir-src-1",
    sourceType: "COMPANY_IR",
    externalId: "ir-item-1",
    canonicalUrl: "https://investor.example.com/news/1",
    publishedAt,
    discoveredAt: NOW.toISOString(),
    title: partial.title,
    summary: partial.summary ?? null,
    contentHash: "hash-ir-batch172-01",
    metadata: {},
  };
}

Deno.test("Batch 172 IR normalize + ingest persists source metadata on raw and distribution facts", async () => {
  const store = createMemoryStore();
  const source = irSource();
  const item = await rawItem({
    title: "Apple Announces Date for Fourth Quarter Results on November 1, 2026",
    summary: "Conference call details to follow.",
    publishedAt: null,
  });
  const ctx = {
    now: NOW,
    source,
    userAgent: "test",
    fetchImpl: fetch,
    itemLimit: 1,
    allowFixtures: false,
    fetchState: {
      unchanged: false,
      etag: null,
      lastModified: null,
      contentHash: null,
      checkpoint: null,
    },
  };
  const candidate = await companyIrAdapter.normalize!(item, ctx);
  assert(candidate);
  assertEquals(candidate.metadata.earnings_disposition, "schedule_announced");
  assertEquals(candidate.metadata.source_identity, "investor.example.com");
  assertEquals(candidate.metadata.published_at_unavailable, true);

  const outcome = await ingestCandidate(store, candidate, {
    now: NOW,
    allowFixtures: false,
    source,
  });
  assertEquals(outcome.status, "created");
  assert(outcome.rawItemId);
  const raw = await store.findRawByHash(item.sourceId, item.contentHash);
  assert(raw);
  assertEquals(raw.metadata.earnings_disposition, "schedule_announced");
  assertEquals(raw.metadata.source_identity, "investor.example.com");
  assertEquals(raw.metadata.published_at_unavailable, true);

  assert(outcome.eventId);
  const event = await store.getEvent(outcome.eventId);
  assert(event);
  const projected = event.scoreComponents.distribution_catalyst_facts as Record<string, unknown>;
  assertEquals(projected.earnings_disposition, "schedule_announced");
  assertEquals(projected.source_identity, "investor.example.com");
  assertEquals(projected.published_at_unavailable, true);
  assertEquals(projected.intel_lifecycle, event.lifecycle);
});

Deno.test("Batch 172 calendar events normalize carries calendar_only through ingest projection", async () => {
  const store = createMemoryStore();
  const source = eventsSource();
  const item: RawSourceItem = {
    sourceId: source.id,
    sourceType: "COMPANY_EVENTS",
    externalId: "evt-1",
    canonicalUrl: "https://investor.example.com/events/1",
    publishedAt: null,
    discoveredAt: NOW.toISOString(),
    title: "Q4 2026 Earnings Conference Call",
    summary: "Scheduled webcast.",
    contentHash: "hash-events-batch172-01",
    metadata: {
      scheduledStart: "2026-11-01T21:00:00.000Z",
      scheduledDate: "2026-11-01",
    },
  };
  const ctx = {
    now: NOW,
    source,
    userAgent: "test",
    fetchImpl: fetch,
    itemLimit: 1,
    allowFixtures: false,
    fetchState: {
      unchanged: false,
      etag: null,
      lastModified: null,
      contentHash: null,
      checkpoint: null,
    },
  };
  const candidate = await companyEventsAdapter.normalize!(item, ctx);
  assert(candidate);
  assertEquals(candidate.metadata.calendar_only, true);
  assertEquals(candidate.metadata.published_at_unavailable, true);

  const outcome = await ingestCandidate(store, candidate, {
    now: NOW,
    allowFixtures: false,
    source,
  });
  assertEquals(outcome.status, "created");
  const raw = await store.findRawByHash(item.sourceId, item.contentHash);
  assertEquals(raw?.metadata.calendar_only, true);

  const event = await store.getEvent(outcome.eventId!);
  const facts = event!.scoreComponents.distribution_catalyst_facts as Record<string, unknown>;
  assertEquals(facts.calendar_only, true);
  assertEquals(facts.published_at_unavailable, true);

  const clientFacts = projectIntelCatalystEventFacts({
    metadata: raw!.metadata,
    lifecycle: event!.lifecycle,
    verificationState: event!.verificationState,
    materiality: event!.materiality,
    ingestedAt: item.discoveredAt,
  });
  assertEquals(clientFacts.calendar_only, true);
  assertEquals(clientFacts.source_identity, "investor.example.com");
});
