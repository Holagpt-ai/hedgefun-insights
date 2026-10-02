import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { newsPrAdapter } from "./adapters/news-pr.ts";
import { attributeCandidate } from "./attribution.ts";
import { buildAttributionIndex } from "./attribution-index.ts";
import { buildCompanyUniverse } from "./company-universe.ts";
import {
  ATTRIBUTION_CORRECTION_RECHECK_FAILED,
  runAttributionCorrection,
} from "./attribution-correction.ts";
import { createMemoryStore } from "./persistence.ts";
import { ingestCandidate } from "./pipeline.ts";
import { runCollectorBot } from "./run-bot.ts";
import type { RunObservability } from "./run-observability.ts";
import type { NormalizedEventCandidate, SourceRecord } from "./types.ts";

const NOW = new Date("2026-10-01T18:00:00.000Z");

function source(partial: Partial<SourceRecord> & Pick<SourceRecord, "sourceType" | "url" | "evidenceTier">): SourceRecord {
  const url = new URL(partial.url);
  return {
    id: partial.id ?? crypto.randomUUID(),
    sourceKey: partial.sourceKey ?? "globenewswire-earnings",
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
    authorityKey: partial.authorityKey ?? "globenewswire",
    lastSuccessAt: partial.lastSuccessAt ?? null,
    lastContentHash: partial.lastContentHash ?? null,
    lastEtag: partial.lastEtag ?? null,
    lastModified: partial.lastModified ?? null,
    failureCount: partial.failureCount ?? 0,
    backoffUntil: partial.backoffUntil ?? null,
    lastErrorCategory: partial.lastErrorCategory ?? null,
    metadata: partial.metadata ?? {},
  };
}

function newsCandidate(title: string, summary: string | null): NormalizedEventCandidate {
  return {
    raw: {
      sourceId: "news-src",
      sourceType: "NEWS_PR",
      externalId: crypto.randomUUID(),
      canonicalUrl: "https://www.globenewswire.com/news-release/test",
      publishedAt: NOW.toISOString(),
      discoveredAt: NOW.toISOString(),
      title,
      summary,
      contentHash: crypto.randomUUID(),
      metadata: {},
    },
    title,
    summary,
    suggestedType: null,
    subtype: null,
    scheduledStart: null,
    scheduledEnd: null,
    scheduledDate: null,
    isAnnouncement: true,
    evidenceTier: "TIER_2_STRONG_SECONDARY",
    metadata: {},
  };
}

const NEWS_UNIVERSE = buildCompanyUniverse([
  { ticker: "MMM", name: "3M Company" },
  { ticker: "NBTX", name: "Nanobiotix SA" },
  { ticker: "NAMM", name: "Namib Minerals" },
  { ticker: "AYI", name: "Acuity Brands, Inc." },
  { ticker: "SYK", name: "Stryker Corporation" },
  { ticker: "APX", name: "Apex Holdings" },
  { ticker: "APEX", name: "Apex Inc." },
  { ticker: "FOR", name: "Forestar Group Inc." },
  { ticker: "ALL", name: "Allstate Corporation" },
  { ticker: "ARE", name: "Alexandria Real Estate Equities, Inc." },
  { ticker: "NOW", name: "ServiceNow, Inc." },
]);

const NEWS_CTX = {
  sourceTicker: null,
  sourceCompanyName: null,
  sourceCik: null,
  sourceType: "NEWS_PR",
  companies: NEWS_UNIVERSE,
  attributionIndex: buildAttributionIndex(NEWS_UNIVERSE),
};

Deno.test("NEWS Ashton Woods never attributes to MMM when summary says company", () => {
  const title = "ASHTON WOODS USA L.L.C. ANNOUNCES QUARTERLY RESULTS CONFERENCE CALL";
  const decision = attributeCandidate(
    newsCandidate(title, "The company will host a conference call."),
    NEWS_CTX,
  );
  assertEquals(decision.status, "unresolved");
  assert(decision.ticker !== "MMM");
});

Deno.test("NEWS ForFarmers joint venture stays unresolved", () => {
  const decision = attributeCandidate(
    newsCandidate("ForFarmers N.V. announces joint venture update", "The partnership continues."),
    NEWS_CTX,
  );
  assertEquals(decision.status, "unresolved");
});

Deno.test("NEWS legitimate issuers still resolve on strong title evidence", () => {
  assertEquals(attributeCandidate(newsCandidate("Nanobiotix reports clinical progress", null), NEWS_CTX).ticker, "NBTX");
  assertEquals(attributeCandidate(newsCandidate("Namib Minerals updates production", null), NEWS_CTX).ticker, "NAMM");
  assertEquals(attributeCandidate(newsCandidate("Acuity Brands announces dividend", null), NEWS_CTX).ticker, "AYI");
  assertEquals(attributeCandidate(newsCandidate("Stryker Corporation reports results", null), NEWS_CTX).ticker, "SYK");
});

Deno.test("NEWS ambiguous Apex names stay unresolved", () => {
  assertEquals(
    attributeCandidate(newsCandidate("Apex announces a vague partnership", null), NEWS_CTX).status,
    "unresolved",
  );
});

Deno.test("NEWS bare prose words do not attribute tickers FOR ALL ARE NOW", () => {
  for (const word of ["for", "all", "are", "now"] as const) {
    const decision = attributeCandidate(
      newsCandidate("Issuer update", `Results are strong ${word} the quarter ahead.`),
      NEWS_CTX,
    );
    assertEquals(decision.status, "unresolved");
    assert(decision.ticker !== word.toUpperCase());
  }
});

Deno.test("NEWS explicit ticker syntax resolves SYK and MMM", () => {
  assertEquals(
    attributeCandidate(newsCandidate("Clinical update", "Shares of $SYK moved on the release."), NEWS_CTX).ticker,
    "SYK",
  );
  assertEquals(
    attributeCandidate(newsCandidate("Update (SYK)", null), NEWS_CTX).ticker,
    "SYK",
  );
  assertEquals(
    attributeCandidate(newsCandidate("Update", "NYSE: MMM noted in the wire copy."), NEWS_CTX).ticker,
    "MMM",
  );
});

function rssFeed(count: number): string {
  const items = Array.from({ length: count }, (_, index) => `<item>
<title>Issuer ${index} USA L.L.C. announces quarterly results</title>
<link>https://www.globenewswire.com/news-release/${index}</link>
<guid isPermaLink="false">gnw-${index}</guid>
<pubDate>Wed, 01 Oct 2026 12:00:00 GMT</pubDate>
<description>The company will host a call.</description>
</item>`).join("\n");
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>GNW</title>${items}</channel></rss>`;
}

Deno.test("NEWS 20-item feed completes with bounded budget and continuation", async () => {
  const store = createMemoryStore();
  const src = source({
    sourceType: "NEWS_PR",
    url: "https://www.globenewswire.com/RssFeed/test",
    evidenceTier: "TIER_2_STRONG_SECONDARY",
    feedFormat: "rss",
  });
  await store.saveSource(src);
  const body = rssFeed(20);
  const universe = buildCompanyUniverse([{ ticker: "MMM", name: "3M Company" }]);
  const fetchImpl = () => Promise.resolve(new Response(body, { status: 200 }));
  const first = await runCollectorBot({
    bot: "news",
    adapter: newsPrAdapter,
    store,
    now: NOW,
    userAgent: "test",
    fetchImpl,
    batchLimit: 1,
    companies: universe,
    newsItemBudget: 5,
    newsWallTimeMs: 60_000,
  });
  const obs1 = first.observability as RunObservability | undefined;
  assert((obs1?.ingestion?.continuation_remaining_items ?? 0) > 0);
  const saved = (await store.listSources({}))[0];
  assert(saved.metadata.news_feed_continuation != null);
  assertEquals(saved.lastContentHash, null);

  const second = await runCollectorBot({
    bot: "news",
    adapter: newsPrAdapter,
    store,
    now: new Date(NOW.getTime() + 60_000),
    userAgent: "test",
    fetchImpl,
    batchLimit: 1,
    companies: universe,
    newsItemBudget: 20,
    newsWallTimeMs: 60_000,
  });
  const obs2 = second.observability as RunObservability | undefined;
  assertEquals(obs2?.ingestion?.continuation_remaining_items ?? 0, 0);
  const saved2 = (await store.listSources({}))[0];
  assertEquals(saved2.metadata.news_feed_continuation, undefined);
  assert(saved2.lastContentHash != null);
  assertEquals(first.rawItemsSeen + second.rawItemsSeen, 20);
});

Deno.test("NEWS run record is saved before item processing", async () => {
  let runWrites = 0;
  const base = createMemoryStore();
  const store = {
    ...base,
    async saveRun(run: Parameters<typeof base.saveRun>[0]) {
      runWrites += 1;
      return base.saveRun(run);
    },
  };
  const src = source({
    sourceType: "NEWS_PR",
    url: "https://www.globenewswire.com/RssFeed/early-run",
    evidenceTier: "TIER_2_STRONG_SECONDARY",
    feedFormat: "rss",
  });
  await store.saveSource(src);
  await runCollectorBot({
    bot: "news",
    adapter: newsPrAdapter,
    store,
    now: NOW,
    userAgent: "test",
    fetchImpl: () => Promise.resolve(new Response(rssFeed(2), { status: 200 })),
    batchLimit: 1,
    companies: buildCompanyUniverse([{ ticker: "MMM", name: "3M Company" }]),
    newsItemBudget: 10,
  });
  assert(runWrites >= 2);
});

Deno.test("attribution correction dry-run and apply remove wrong ticker without mutating raw body", async () => {
  const store = createMemoryStore();
  const src = source({
    id: "news-src-id",
    sourceType: "NEWS_PR",
    url: "https://news.example.test/ashton",
    evidenceTier: "TIER_2_STRONG_SECONDARY",
  });
  await store.saveSource(src);
  const title = "ASHTON WOODS USA L.L.C. ANNOUNCES QUARTERLY RESULTS CONFERENCE CALL";
  const candidate = newsCandidate(title, "The company will host a conference call.");
  candidate.raw.sourceId = src.id;
  const legacy = await ingestCandidate(store, candidate, {
    now: NOW,
    allowFixtures: false,
    source: src,
    companies: NEWS_UNIVERSE,
    attributionIndex: buildAttributionIndex(NEWS_UNIVERSE),
  });
  assertEquals(legacy.status, "unresolved");

  const wrongEventId = crypto.randomUUID();
  await store.insertEvent({
    id: wrongEventId,
    canonicalKey: "ci:MMM:OTHER_MATERIAL_EVENT:test-ashton",
    title,
    summary: candidate.summary,
    announcementSummary: candidate.summary,
    eventType: "OTHER_MATERIAL_EVENT",
    eventSubtype: null,
    lifecycle: "announced",
    catalystState: "WATCH",
    firstDiscoveredAt: NOW.toISOString(),
    sourcePublishedAt: NOW.toISOString(),
    scheduledStartAt: null,
    scheduledEndAt: null,
    scheduledDate: null,
    announcementAt: NOW.toISOString(),
    effectiveAt: null,
    timingBucket: "unknown",
    verificationState: "UNVERIFIED",
    evidenceConfidence: 50,
    materiality: 50,
    timingUrgency: 40,
    reactionScore: null,
    priorityScore: 40,
    attributionConfidence: 0.72,
    distributionStatus: "observation",
    lifecycleLog: [],
    scoreComponents: {},
    updatedAt: NOW.toISOString(),
  });
  const rawId = crypto.randomUUID();
  await store.insertRaw({
    id: rawId,
    sourceId: src.id,
    externalId: "ashton-woods",
    canonicalUrl: candidate.raw.canonicalUrl,
    contentHash: "ashton-hash",
    publishedAt: NOW.toISOString(),
    discoveredAt: NOW.toISOString(),
    title,
    bodyExcerpt: candidate.summary,
    metadata: {},
  });
  await store.insertEvidence({
    id: crypto.randomUUID(),
    eventId: wrongEventId,
    rawItemId: rawId,
    sourceId: src.id,
    authorityKey: "globenewswire",
    evidenceTier: "TIER_2_STRONG_SECONDARY",
    evidenceRole: "secondary",
    canonicalUrl: candidate.raw.canonicalUrl,
    contentHash: "ashton-hash",
    publishedAt: NOW.toISOString(),
    conflict: false,
  });
  await store.upsertTicker({
    id: crypto.randomUUID(),
    eventId: wrongEventId,
    ticker: "MMM",
    relation: "PRIMARY",
    confidence: 0.72,
    isPrimary: true,
    evidenceNote: "alias_match",
  });

  const dry = await runAttributionCorrection(store, {
    scope: { rawItemId: rawId, eventId: wrongEventId, wrongTicker: "MMM" },
    dryRun: true,
    apply: false,
    companies: NEWS_UNIVERSE,
    source: src,
    now: NOW,
  });
  assertEquals(dry.item?.correctionStatus, "WOULD_CORRECT");
  assertEquals(dry.item?.recheck?.previousTicker, "MMM");
  assertEquals(dry.item?.recheck?.correctedStatus, "unresolved");
  assertEquals(dry.item?.recheck?.correctedTicker, null);
  assert((await store.listTickers(wrongEventId)).some((row) => row.ticker === "MMM"));
  const rawBeforeApply = JSON.stringify(await store.getRawItem(rawId));
  const evidenceBeforeApply = JSON.stringify(await store.findEvidenceByRaw(rawId));

  const apply = await runAttributionCorrection(store, {
    scope: { rawItemId: rawId, eventId: wrongEventId, wrongTicker: "MMM" },
    dryRun: false,
    apply: true,
    concurrencyToken: dry.item?.concurrencyToken ?? null,
    companies: NEWS_UNIVERSE,
    source: src,
    now: NOW,
  });
  assertEquals(apply.item?.correctionStatus, "CORRECTED");
  assertEquals((await store.listTickers(wrongEventId)).some((row) => row.ticker === "MMM"), false);
  assertEquals((await store.getEvent(wrongEventId))?.lifecycle, "invalidated");
  assertEquals(JSON.stringify(await store.getRawItem(rawId)), rawBeforeApply);
  assertEquals(JSON.stringify(await store.findEvidenceByRaw(rawId)), evidenceBeforeApply);

  const again = await runAttributionCorrection(store, {
    scope: { rawItemId: rawId, eventId: wrongEventId, wrongTicker: "MMM" },
    dryRun: false,
    apply: true,
    concurrencyToken: apply.item?.concurrencyToken ?? null,
    companies: NEWS_UNIVERSE,
    source: src,
    now: NOW,
  });
  assertEquals(again.item?.correctionStatus, "NO_CHANGE");
});

Deno.test("attribution correction requires company universe for re-check", async () => {
  const store = createMemoryStore();
  const rawId = crypto.randomUUID();
  const eventId = crypto.randomUUID();
  await store.insertRaw({
    id: rawId,
    sourceId: "s",
    externalId: "x",
    canonicalUrl: null,
    contentHash: "h",
    publishedAt: NOW.toISOString(),
    discoveredAt: NOW.toISOString(),
    title: "Test",
    bodyExcerpt: null,
    metadata: {},
  });
  await store.insertEvent({
    id: eventId,
    canonicalKey: "ci:MMM:OTHER_MATERIAL_EVENT:test",
    title: "Test",
    summary: null,
    announcementSummary: null,
    eventType: "OTHER_MATERIAL_EVENT",
    eventSubtype: null,
    lifecycle: "announced",
    catalystState: "WATCH",
    firstDiscoveredAt: NOW.toISOString(),
    sourcePublishedAt: NOW.toISOString(),
    scheduledStartAt: null,
    scheduledEndAt: null,
    scheduledDate: null,
    announcementAt: NOW.toISOString(),
    effectiveAt: null,
    timingBucket: "unknown",
    verificationState: "UNVERIFIED",
    evidenceConfidence: 50,
    materiality: 50,
    timingUrgency: 40,
    reactionScore: null,
    priorityScore: 40,
    attributionConfidence: 0.72,
    distributionStatus: "observation",
    lifecycleLog: [],
    scoreComponents: {},
    updatedAt: NOW.toISOString(),
  });
  await store.insertEvidence({
    id: crypto.randomUUID(),
    eventId,
    rawItemId: rawId,
    sourceId: "s",
    authorityKey: "globenewswire",
    evidenceTier: "TIER_2_STRONG_SECONDARY",
    evidenceRole: "secondary",
    canonicalUrl: null,
    contentHash: "h",
    publishedAt: NOW.toISOString(),
    conflict: false,
  });
  await store.upsertTicker({
    id: crypto.randomUUID(),
    eventId,
    ticker: "MMM",
    relation: "PRIMARY",
    confidence: 0.72,
    isPrimary: true,
    evidenceNote: "alias_match",
  });
  const result = await runAttributionCorrection(store, {
    scope: { rawItemId: rawId, eventId, wrongTicker: "MMM" },
    dryRun: true,
    apply: false,
    now: NOW,
  });
  assertEquals(result.status, "VALIDATION_ERROR");
  assertEquals(result.item?.error, "MISSING_COMPANY_UNIVERSE");
});

Deno.test("attribution correction apply refused when re-check still resolves wrong ticker", async () => {
  const store = createMemoryStore();
  const src = source({
    sourceType: "NEWS_PR",
    url: "https://news.example.test/mmm-explicit",
    evidenceTier: "TIER_2_STRONG_SECONDARY",
  });
  await store.saveSource(src);
  const title = "Wire copy";
  const summary = "NYSE: MMM";
  const rawId = crypto.randomUUID();
  const eventId = crypto.randomUUID();
  await store.insertRaw({
    id: rawId,
    sourceId: src.id,
    externalId: "mmm-explicit",
    canonicalUrl: null,
    contentHash: "mmm-explicit",
    publishedAt: NOW.toISOString(),
    discoveredAt: NOW.toISOString(),
    title,
    bodyExcerpt: summary,
    metadata: {},
  });
  await store.insertEvent({
    id: eventId,
    canonicalKey: "ci:MMM:OTHER_MATERIAL_EVENT:explicit",
    title,
    summary,
    announcementSummary: summary,
    eventType: "OTHER_MATERIAL_EVENT",
    eventSubtype: null,
    lifecycle: "announced",
    catalystState: "WATCH",
    firstDiscoveredAt: NOW.toISOString(),
    sourcePublishedAt: NOW.toISOString(),
    scheduledStartAt: null,
    scheduledEndAt: null,
    scheduledDate: null,
    announcementAt: NOW.toISOString(),
    effectiveAt: null,
    timingBucket: "unknown",
    verificationState: "UNVERIFIED",
    evidenceConfidence: 50,
    materiality: 50,
    timingUrgency: 40,
    reactionScore: null,
    priorityScore: 40,
    attributionConfidence: 0.72,
    distributionStatus: "observation",
    lifecycleLog: [],
    scoreComponents: {},
    updatedAt: NOW.toISOString(),
  });
  await store.insertEvidence({
    id: crypto.randomUUID(),
    eventId,
    rawItemId: rawId,
    sourceId: src.id,
    authorityKey: "globenewswire",
    evidenceTier: "TIER_2_STRONG_SECONDARY",
    evidenceRole: "secondary",
    canonicalUrl: null,
    contentHash: "mmm-explicit",
    publishedAt: NOW.toISOString(),
    conflict: false,
  });
  await store.upsertTicker({
    id: crypto.randomUUID(),
    eventId,
    ticker: "MMM",
    relation: "PRIMARY",
    confidence: 0.72,
    isPrimary: true,
    evidenceNote: "news_explicit_ticker",
  });
  const dry = await runAttributionCorrection(store, {
    scope: { rawItemId: rawId, eventId, wrongTicker: "MMM" },
    dryRun: true,
    apply: false,
    companies: NEWS_UNIVERSE,
    source: src,
    now: NOW,
  });
  assertEquals(dry.item?.error, ATTRIBUTION_CORRECTION_RECHECK_FAILED);
  assert((await store.listTickers(eventId)).some((row) => row.ticker === "MMM"));
});
