import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { companyEventsAdapter } from "./adapters/company-events.ts";
import { companyIrAdapter } from "./adapters/company-ir.ts";
import { priceBarsFromPolygonAggs } from "./event-bars.ts";
import { parseIcsEvents } from "./feeds.ts";
import {
  legacyProvenanceIfNeeded,
  readStoredProvenance,
  resolvePolygonReference,
} from "./reference-provenance.ts";
import { createMemoryStore } from "./persistence.ts";
import { ingestCandidate } from "./pipeline.ts";
import { runCollectorBot, runReactionBot } from "./run-bot.ts";
import type { RunObservability } from "./run-observability.ts";
import { runErrorsForPersistence } from "./telemetry.ts";
import type { NormalizedEventCandidate, SourceRecord } from "./types.ts";

const NOW = new Date("2026-10-01T18:00:00.000Z");
const BNS_EVENT_AT = "2026-10-01T17:37:12.000Z";

function source(partial: Partial<SourceRecord> & Pick<SourceRecord, "sourceType" | "url" | "evidenceTier">): SourceRecord {
  const url = new URL(partial.url);
  return {
    id: partial.id ?? crypto.randomUUID(),
    sourceKey: partial.sourceKey ?? partial.sourceType.toLowerCase(),
    companyName: partial.companyName ?? null,
    ticker: partial.ticker ?? null,
    cik: partial.cik ?? null,
    sourceType: partial.sourceType,
    url: partial.url,
    hostname: url.hostname,
    feedFormat: partial.feedFormat ?? "rss",
    pollIntervalSeconds: partial.pollIntervalSeconds ?? 0,
    enabled: partial.enabled ?? true,
    priority: partial.priority ?? 10,
    evidenceTier: partial.evidenceTier,
    authorityKey: partial.authorityKey ?? partial.sourceKey ?? partial.sourceType.toLowerCase(),
    lastSuccessAt: partial.lastSuccessAt ?? null,
    lastContentHash: null,
    lastEtag: null,
    lastModified: null,
    failureCount: 0,
    backoffUntil: null,
    lastErrorCategory: null,
    metadata: partial.metadata ?? {},
  };
}

function bnsCandidate(sourceId: string): NormalizedEventCandidate {
  return {
    raw: {
      sourceId,
      sourceType: "SEC_FILINGS",
      externalId: "bns-424b2",
      canonicalUrl: "https://www.sec.gov/Archives/edgar/data/bns/424b2",
      publishedAt: BNS_EVENT_AT,
      discoveredAt: BNS_EVENT_AT,
      title: "424B2 - Bank of Nova Scotia",
      summary: null,
      contentHash: "hash-bns",
      metadata: { cik: "0000009631", formType: "424B2" },
    },
    title: "424B2 - Bank of Nova Scotia",
    summary: null,
    suggestedType: null,
    subtype: "424B2",
    scheduledStart: null,
    scheduledEnd: null,
    scheduledDate: null,
    isAnnouncement: true,
    evidenceTier: "TIER_1_PRIMARY",
    metadata: { cik: "0000009631" },
  };
}

function reactionMetrics(run: { observability?: Record<string, unknown> }): RunObservability["reactions"] {
  const obs = run.observability as RunObservability | undefined;
  return obs?.reactions;
}

function ingestMetrics(run: { observability?: Record<string, unknown> }): RunObservability["ingestion"] {
  const obs = run.observability as RunObservability | undefined;
  return obs?.ingestion;
}

const HPE_EMPTY_SUMMARY_ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//HPE//Events//EN",
  "BEGIN:VEVENT",
  "UID:hpe-empty-summary@test",
  "DTSTART:20261008T150000Z",
  "DTEND:20261008T160000Z",
  "SUMMARY:",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

const VALID_ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:evt-1",
  "DTSTART:20261008T150000Z",
  "SUMMARY:Investor Conference",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:evt-2",
  "DTSTART:20261009T150000Z",
  "SUMMARY:Earnings Call",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

Deno.test("parser observability: HPE-style empty SUMMARY is encountered and rejected", async () => {
  assertEquals(parseIcsEvents(HPE_EMPTY_SUMMARY_ICS).length, 1);
  const store = createMemoryStore();
  const src = source({
    sourceType: "COMPANY_EVENTS",
    url: "https://example.com/events.ics",
    evidenceTier: "TIER_1_PRIMARY",
    feedFormat: "ics",
    ticker: "HPE",
    sourceKey: "hpe-events-calendar-ics",
  });
  await store.saveSource(src);
  const run = await runCollectorBot({
    bot: "events",
    adapter: companyEventsAdapter,
    store,
    now: NOW,
    userAgent: "test",
    batchLimit: 5,
    fetchImpl: async () => new Response(HPE_EMPTY_SUMMARY_ICS, { status: 200 }),
  });
  assertEquals(run.rawItemsSeen, 1);
  const ing = ingestMetrics(run)!;
  assertEquals(ing.items_encountered, 1);
  assertEquals(ing.items_qualifying, 0);
  assertEquals(ing.items_rejected, 1);
  assertEquals(ing.rejection_reasons.missing_title, 1);
  assertEquals(run.newItems, 0);
  assertEquals(run.eventsCreated, 0);
  assertEquals(store.rawItems().length, 0);
});

Deno.test("parser observability: valid ICS encountered equals qualifying", async () => {
  const store = createMemoryStore();
  const src = source({
    sourceType: "COMPANY_EVENTS",
    url: "https://example.com/events.ics",
    evidenceTier: "TIER_1_PRIMARY",
    feedFormat: "ics",
    ticker: "HPE",
  });
  await store.saveSource(src);
  const run = await runCollectorBot({
    bot: "events",
    adapter: companyEventsAdapter,
    store,
    now: NOW,
    userAgent: "test",
    batchLimit: 5,
    fetchImpl: async () => new Response(VALID_ICS, { status: 200 }),
  });
  const ing = ingestMetrics(run)!;
  assertEquals(ing.items_encountered, 2);
  assertEquals(ing.items_qualifying, 2);
  assertEquals(ing.items_rejected, 0);
  assertEquals(run.rawItemsSeen, 2);
});

Deno.test("reaction counters: Polygon resolve reports truthful reaction metrics", async () => {
  const store = createMemoryStore();
  const src = source({
    sourceType: "SEC_FILINGS",
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&output=atom",
    evidenceTier: "TIER_1_PRIMARY",
  });
  await ingestCandidate(store, bnsCandidate(src.id), {
    now: NOW,
    allowFixtures: false,
    source: src,
    cikMap: new Map([["0000009631", ["BNS"]]]),
  });
  let polygonCalls = 0;
  const run = await runReactionBot({
    store,
    now: NOW,
    batchLimit: 5,
    loadObservation: async () => null,
    loadReferenceBars: async () => {
      polygonCalls += 1;
      const eventMs = Date.parse(BNS_EVENT_AT);
      return priceBarsFromPolygonAggs([
        { t: eventMs - 60_000, c: 90.175 },
        { t: eventMs, c: 91.0 },
      ]);
    },
  });
  const rx = reactionMetrics(run)!;
  assertEquals(rx.events_evaluated, 1);
  assertEquals(rx.events_processed, 1);
  assertEquals(rx.polygon_lookups_attempted, 1);
  assertEquals(rx.polygon_reference_resolved, 1);
  assertEquals(polygonCalls, 1);
  assert(rx.reaction_rows_inserted + rx.reaction_rows_updated >= 1);
  const persisted = runErrorsForPersistence(run).find((e) => e.category === "metrics");
  assert(persisted?.details?.reactions);
});

Deno.test("reaction provenance: Polygon resolution persists provider and bar timestamps", async () => {
  const store = createMemoryStore();
  const src = source({
    sourceType: "SEC_FILINGS",
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&output=atom",
    evidenceTier: "TIER_1_PRIMARY",
  });
  await ingestCandidate(store, bnsCandidate(src.id), {
    now: NOW,
    allowFixtures: false,
    source: src,
    cikMap: new Map([["0000009631", ["BNS"]]]),
  });
  const event = store.events()[0];
  const eventMs = Date.parse(BNS_EVENT_AT);
  const bars = priceBarsFromPolygonAggs([{ t: eventMs - 60_000, c: 90.175 }]);
  const resolved = resolvePolygonReference({
    bars,
    eventAtIso: BNS_EVENT_AT,
    ticker: "BNS",
    event,
    resolvedAt: NOW,
  });
  assertEquals(resolved.price, 90.175);
  assertEquals(resolved.provenance?.provider, "polygon");
  assertEquals(resolved.provenance?.event_reference_field, "announcement_at");
  await runReactionBot({
    store,
    now: NOW,
    batchLimit: 5,
    loadObservation: async () => null,
    loadReferenceBars: async () => bars,
  });
  const reaction = store.reactions()[0];
  const prov = readStoredProvenance(reaction.payload);
  assert(prov && prov.provider === "polygon");
  if (prov.provider === "polygon") {
    assertEquals(prov.reference_price, 90.175);
    assertEquals(prov.bar_resolution, "1m");
  }
});

Deno.test("reaction provenance: reuse preserves original Polygon provenance", async () => {
  const store = createMemoryStore();
  const src = source({
    sourceType: "SEC_FILINGS",
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&output=atom",
    evidenceTier: "TIER_1_PRIMARY",
  });
  await ingestCandidate(store, bnsCandidate(src.id), {
    now: NOW,
    allowFixtures: false,
    source: src,
    cikMap: new Map([["0000009631", ["BNS"]]]),
  });
  const eventMs = Date.parse(BNS_EVENT_AT);
  const bars = priceBarsFromPolygonAggs([{ t: eventMs - 60_000, c: 90.175 }]);
  await runReactionBot({
    store,
    now: NOW,
    batchLimit: 5,
    loadObservation: async () => null,
    loadReferenceBars: async () => bars,
  });
  const firstProv = readStoredProvenance(store.reactions()[0].payload);
  let polygonCalls = 0;
  const run = await runReactionBot({
    store,
    now: NOW,
    batchLimit: 5,
    loadObservation: async () => null,
    loadReferenceBars: async () => {
      polygonCalls += 1;
      return bars;
    },
  });
  assertEquals(polygonCalls, 0);
  assertEquals(reactionMetrics(run)?.reference_prices_reused, 1);
  const secondProv = readStoredProvenance(store.reactions()[0].payload);
  assertEquals(secondProv, firstProv);
  assertEquals(store.reactions()[0].payload.reference_price_reused, true);
});

Deno.test("reaction provenance: legacy stored price is not labelled Polygon", () => {
  const legacy = legacyProvenanceIfNeeded(90.175, {});
  assertEquals(legacy?.provider, "legacy_unavailable");
  assertEquals(readStoredProvenance({ reference_provenance: legacy }), legacy);
});

Deno.test("reaction counters: future event skipped without Polygon", async () => {
  const store = createMemoryStore();
  const src = source({
    sourceType: "COMPANY_IR",
    url: "https://investors.example.com/rss",
    evidenceTier: "TIER_1_PRIMARY",
    ticker: "INTU",
  });
  await store.saveSource(src);
  const future = "2026-12-01T15:00:00.000Z";
  await ingestCandidate(store, {
    raw: {
      sourceId: src.id,
      sourceType: "COMPANY_IR",
      externalId: "future",
      canonicalUrl: "https://investors.example.com/future",
      publishedAt: NOW.toISOString(),
      discoveredAt: NOW.toISOString(),
      title: "Intuit Announces Date for Results on December 15, 2026",
      summary: null,
      contentHash: "future-hash",
      metadata: {},
    },
    title: "Intuit Announces Date for Results on December 15, 2026",
    summary: null,
    suggestedType: null,
    subtype: null,
    scheduledStart: future,
    scheduledEnd: null,
    scheduledDate: "2026-12-15",
    isAnnouncement: true,
    evidenceTier: "TIER_1_PRIMARY",
    metadata: {},
  }, { now: NOW, allowFixtures: false, source: src });
  const event = store.events()[0];
  event.scheduledStartAt = future;
  event.lifecycle = "scheduled";
  await store.updateEvent(event);
  let polygonCalls = 0;
  const run = await runReactionBot({
    store,
    now: NOW,
    batchLimit: 5,
    loadObservation: async () => null,
    loadReferenceBars: async () => {
      polygonCalls += 1;
      return [];
    },
  });
  const rx = reactionMetrics(run)!;
  assertEquals(rx.events_skipped_future, 1);
  assertEquals(rx.polygon_lookups_attempted, 0);
  assertEquals(polygonCalls, 0);
  assertEquals(store.reactions().length, 0);
});

Deno.test("reaction counters: Polygon no eligible bar reports unavailable", async () => {
  const store = createMemoryStore();
  const src = source({
    sourceType: "SEC_FILINGS",
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&output=atom",
    evidenceTier: "TIER_1_PRIMARY",
  });
  await ingestCandidate(store, bnsCandidate(src.id), {
    now: NOW,
    allowFixtures: false,
    source: src,
    cikMap: new Map([["0000009631", ["BNS"]]]),
  });
  const run = await runReactionBot({
    store,
    now: NOW,
    batchLimit: 5,
    loadObservation: async () => null,
    loadReferenceBars: async () => [],
  });
  const rx = reactionMetrics(run)!;
  assertEquals(rx.polygon_lookups_attempted, 1);
  assertEquals(rx.polygon_reference_unavailable, 1);
  assertEquals(rx.polygon_reference_resolved, 0);
});

Deno.test("IR ingestion: ten qualifying Intuit items without parser rejection", async () => {
  const store = createMemoryStore();
  const src = source({
    sourceType: "COMPANY_IR",
    url: "https://investors.intuit.com/rss",
    evidenceTier: "TIER_1_PRIMARY",
    ticker: "INTU",
    sourceKey: "intu-press-releases-rss",
    feedFormat: "rss",
  });
  await store.saveSource(src);
  const titles = Array.from({ length: 10 }, (_, i) => `Intuit IR release ${i + 1}`);
  const rss = titles.map((title, i) => `
    <item>
      <title>${title}</title>
      <link>https://investors.intuit.com/${i}</link>
      <pubDate>Wed, 01 Oct 2026 12:00:00 GMT</pubDate>
      <guid>guid-${i}</guid>
    </item>`).join("");
  const body = `<?xml version="1.0"?><rss version="2.0"><channel>${rss}</channel></rss>`;
  const run = await runCollectorBot({
    bot: "ir",
    adapter: companyIrAdapter,
    store,
    now: NOW,
    userAgent: "test",
    batchLimit: 5,
    fetchImpl: async () => new Response(body, { status: 200 }),
  });
  const ing = ingestMetrics(run)!;
  assertEquals(ing.items_encountered, 10);
  assertEquals(ing.items_qualifying, 10);
  assertEquals(ing.items_rejected, 0);
  assertEquals(run.rawItemsSeen, 10);
  assertEquals(run.newItems, 10);
});
