import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { LIVE_REACTION_MAX_AGE_MS } from "./config.ts";
import { priceBarsFromPolygonAggs } from "./event-bars.ts";
import { handleCatalystIntelRequest } from "./http.ts";
import { ingestCandidate } from "./pipeline.ts";
import { createMemoryStore } from "./persistence.ts";
import {
  isLiveReactionEligible,
  parseHistoricalBackfillScope,
  reactionReferenceAgeMs,
} from "./reaction-eligibility.ts";
import { runReactionBot } from "./run-bot.ts";
import type { CanonicalEvent, NormalizedEventCandidate, SourceRecord } from "./types.ts";

const RUN_NOW = new Date("2026-10-01T18:00:00.000Z");
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

function intuCandidate(sourceId: string, externalId: string, title: string, publishedAt: string): NormalizedEventCandidate {
  return {
    raw: {
      sourceId,
      sourceType: "COMPANY_IR",
      externalId,
      canonicalUrl: `https://investors.intuit.com/${externalId}`,
      publishedAt,
      discoveredAt: RUN_NOW.toISOString(),
      title,
      summary: null,
      contentHash: `hash-${externalId}`,
      metadata: {},
    },
    title,
    summary: null,
    suggestedType: null,
    subtype: null,
    scheduledStart: null,
    scheduledEnd: null,
    scheduledDate: null,
    isAnnouncement: true,
    evidenceTier: "TIER_1_PRIMARY",
    metadata: {},
  };
}

async function seedIntuPortfolio(store: ReturnType<typeof createMemoryStore>) {
  const src = source({
    sourceType: "COMPANY_IR",
    url: "https://investors.intuit.com/rss",
    evidenceTier: "TIER_1_PRIMARY",
    ticker: "INTU",
    sourceKey: "intu-press-releases-rss",
  });
  await store.saveSource(src);
  const rows: { id: string; pub: string; title: string }[] = [
    { id: "july-1", pub: "2026-07-15T13:00:00.000Z", title: "Intuit July release 1" },
    { id: "july-2", pub: "2026-07-20T12:00:00.000Z", title: "Intuit July release 2" },
    { id: "aug-1", pub: "2026-08-05T12:00:00.000Z", title: "Intuit August release 1" },
    { id: "aug-2", pub: "2026-08-12T12:00:00.000Z", title: "Intuit August release 2" },
    { id: "aug-3", pub: "2026-08-20T12:00:00.000Z", title: "Intuit Q4 results" },
    { id: "aug-4", pub: "2026-08-25T12:00:00.000Z", title: "Intuit August release 4" },
    { id: "sep-1", pub: "2026-09-05T12:00:00.000Z", title: "Intuit Investor Day" },
    { id: "sep-2", pub: "2026-09-10T12:00:00.000Z", title: "Intuit CFO conference" },
    { id: "sep-29", pub: "2026-09-29T12:00:00.000Z", title: "Intuit Sept 29 release" },
    { id: "sep-30", pub: "2026-09-30T12:00:00.000Z", title: "Intuit Sept 30 release" },
  ];
  for (const row of rows) {
    await ingestCandidate(store, intuCandidate(src.id, row.id, row.title, row.pub), {
      now: RUN_NOW,
      allowFixtures: false,
      source: src,
    });
  }
}

function rx(run: { observability?: Record<string, unknown> }) {
  const obs = run.observability as { reactions?: Record<string, number> } | undefined;
  return obs?.reactions as Record<string, number> | undefined;
}

Deno.test("live eligibility uses event reference age not discovery time", () => {
  const event = {
    announcementAt: "2026-07-15T13:00:00.000Z",
    effectiveAt: "2026-07-15T13:00:00.000Z",
    scheduledStartAt: null,
    scheduledDate: null,
    firstDiscoveredAt: RUN_NOW.toISOString(),
    lifecycle: "announced",
  } as CanonicalEvent;
  const age = reactionReferenceAgeMs(event, RUN_NOW)!;
  assert(age > LIVE_REACTION_MAX_AGE_MS);
  assertEquals(isLiveReactionEligible(event, RUN_NOW), false);
});

Deno.test("live recent event within 72h is eligible", () => {
  const event = {
    announcementAt: "2026-09-30T12:00:00.000Z",
    effectiveAt: "2026-09-30T12:00:00.000Z",
    scheduledStartAt: null,
    scheduledDate: null,
    firstDiscoveredAt: RUN_NOW.toISOString(),
    lifecycle: "announced",
  } as CanonicalEvent;
  assertEquals(isLiveReactionEligible(event, RUN_NOW), true);
});

Deno.test("live historical INTU portfolio skips stale and processes recent only", async () => {
  const store = createMemoryStore();
  await seedIntuPortfolio(store);
  const total = store.events().length;
  const recentEligible = store.events().filter((event) => isLiveReactionEligible(event, RUN_NOW)).length;
  assert(recentEligible >= 1 && recentEligible <= 2, `expected 1-2 recent INTU fixtures, got ${recentEligible}`);
  assert(total >= 9, "expected ~10 distinct INTU canonical events");
  let polygonCalls = 0;
  const run = await runReactionBot({
    store,
    now: RUN_NOW,
    batchLimit: 25,
    loadObservation: async () => null,
    loadReferenceBars: async () => {
      polygonCalls += 1;
      return [];
    },
    mode: "live",
  });
  assertEquals(run.observability && (run.observability as { reactions?: { mode: string } }).reactions?.mode, "live");
  const metrics = rx(run)!;
  assertEquals(metrics.events_evaluated, total);
  assertEquals(metrics.events_skipped_historical, total - recentEligible);
  assertEquals(metrics.events_processed, recentEligible);
  assertEquals(polygonCalls, recentEligible);
});

Deno.test("live skips old event even when reaction row already exists", async () => {
  const store = createMemoryStore();
  await seedIntuPortfolio(store);
  const old = store.events().find((e) => e.title.includes("July release 1"))!;
  await store.upsertReaction({
    id: crypto.randomUUID(),
    eventId: old.id,
    windowKind: "point",
    observedAt: null,
    availability: "unavailable",
    referencePrice: 650,
    currentPrice: null,
    percentMove: null,
    intradayHigh: null,
    intradayLow: null,
    volume: null,
    dollarVolume: null,
    rvol5m: null,
    timeAdjustedRvol: null,
    volumeVelocity: null,
    volumeAcceleration: null,
    vwap: null,
    vwapSide: null,
    hodDistancePct: null,
    lodDistancePct: null,
    floatTurnover: null,
    payload: { reference_provenance: { provider: "legacy_unavailable" } },
  });
  let polygonCalls = 0;
  const run = await runReactionBot({
    store,
    now: RUN_NOW,
    batchLimit: 25,
    loadObservation: async () => null,
    loadReferenceBars: async () => {
      polygonCalls += 1;
      return [];
    },
    mode: "live",
  });
  const total = store.events().length;
  const recentEligible = store.events().filter((event) => isLiveReactionEligible(event, RUN_NOW)).length;
  assertEquals(rx(run)!.events_skipped_historical, total - recentEligible);
  assertEquals(polygonCalls, recentEligible);
  const oldReaction = store.reactions().find((row) => row.eventId === old.id);
  assertEquals(oldReaction?.referencePrice, 650);
  assertEquals(store.reactions().filter((row) => row.eventId === old.id).length, 1);
});

Deno.test("historical backfill allows Polygon for old events with bounded event_ids", async () => {
  const store = createMemoryStore();
  await seedIntuPortfolio(store);
  const old = store.events().find((e) => e.title.includes("July release 1"))!;
  let polygonCalls = 0;
  const eventMs = Date.parse("2026-07-15T13:00:00.000Z");
  await runReactionBot({
    store,
    now: RUN_NOW,
    batchLimit: 5,
    mode: "historical_backfill",
    historicalBackfill: { eventIds: [old.id] },
    loadObservation: async () => null,
    loadReferenceBars: async () => {
      polygonCalls += 1;
      return priceBarsFromPolygonAggs([{ t: eventMs - 60_000, c: 700.1 }]);
    },
  });
  assertEquals(polygonCalls, 1);
  assertEquals(store.reactions().length, 1);
});

Deno.test("historical backfill reuse skips Polygon", async () => {
  const store = createMemoryStore();
  await seedIntuPortfolio(store);
  const old = store.events().find((e) => e.title.includes("July release 1"))!;
  await store.upsertReaction({
    id: crypto.randomUUID(),
    eventId: old.id,
    windowKind: "point",
    observedAt: null,
    availability: "unavailable",
    referencePrice: 701,
    currentPrice: null,
    percentMove: null,
    intradayHigh: null,
    intradayLow: null,
    volume: null,
    dollarVolume: null,
    rvol5m: null,
    timeAdjustedRvol: null,
    volumeVelocity: null,
    volumeAcceleration: null,
    vwap: null,
    vwapSide: null,
    hodDistancePct: null,
    lodDistancePct: null,
    floatTurnover: null,
    payload: {},
  });
  let polygonCalls = 0;
  const run = await runReactionBot({
    store,
    now: RUN_NOW,
    batchLimit: 5,
    mode: "historical_backfill",
    historicalBackfill: { eventIds: [old.id] },
    loadObservation: async () => null,
    loadReferenceBars: async () => {
      polygonCalls += 1;
      return [];
    },
  });
  assertEquals(polygonCalls, 0);
  assertEquals(rx(run)!.reference_prices_reused, 1);
});

Deno.test("unbounded historical backfill scope is rejected", () => {
  assertEquals(parseHistoricalBackfillScope({ mode: "historical_backfill", ticker: "INTU" }), null);
  assertEquals(parseHistoricalBackfillScope({ event_ids: [] }), null);
  assert(parseHistoricalBackfillScope({ event_ids: [crypto.randomUUID()] }));
});

Deno.test("http reactions default to live mode", async () => {
  const store = createMemoryStore();
  const src = source({
    sourceType: "SEC_FILINGS",
    url: "https://www.sec.gov/",
    evidenceTier: "TIER_1_PRIMARY",
  });
  await ingestCandidate(store, {
    raw: {
      sourceId: src.id,
      sourceType: "SEC_FILINGS",
      externalId: "bns",
      canonicalUrl: "https://www.sec.gov/bns",
      publishedAt: BNS_EVENT_AT,
      discoveredAt: BNS_EVENT_AT,
      title: "424B2 BNS",
      summary: null,
      contentHash: "bns",
      metadata: { cik: "0000009631" },
    },
    title: "424B2 BNS",
    summary: null,
    suggestedType: null,
    subtype: "424B2",
    scheduledStart: null,
    scheduledEnd: null,
    scheduledDate: null,
    isAnnouncement: true,
    evidenceTier: "TIER_1_PRIMARY",
    metadata: { cik: "0000009631" },
  }, { now: RUN_NOW, allowFixtures: false, source: src, cikMap: new Map([["0000009631", ["BNS"]]]) });
  const secret = "test-secret";
  const res = await handleCatalystIntelRequest(new Request("https://x", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
    body: JSON.stringify({ batch_limit: 5 }),
  }), {
    bot: "reactions",
    env: (key) => (key === "SYNC_SECRET" ? secret : key === "CATALYST_INTEL_REACTIONS_ENABLED" ? "true" : undefined),
    store,
    now: () => RUN_NOW,
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.run.observability.reactions.mode, "live");
});
