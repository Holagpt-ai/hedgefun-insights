import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { newsPrAdapter } from "./adapters/news-pr.ts";
import { attributeCandidate } from "./attribution.ts";
import { buildAttributionIndex } from "./attribution-index.ts";
import { buildCompanyUniverse } from "./company-universe.ts";
import {
  ATTRIBUTION_CORRECTION_RECHECK_FAILED,
  runAttributionCorrection,
} from "./attribution-correction.ts";
import { ItemIngestError } from "./item-ingest-error.ts";
import { readNewsContinuation } from "./news-continuation.ts";
import { createMemoryStore } from "./persistence.ts";
import { ingestCandidate } from "./pipeline.ts";
import { runCollectorBot } from "./run-bot.ts";
import { runRecoveryToken, runStaleRunRecovery } from "./run-recovery.ts";
import { emptyRun } from "./telemetry.ts";
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
  { ticker: "JYNT", name: "The Joint Corp." },
  { ticker: "IART", name: "Integra LifeSciences Holdings Corporation" },
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
  assertEquals(apply.item?.proposedVerificationState, "INVALIDATED");
  const corrected = await store.getEvent(wrongEventId);
  assertEquals((await store.listTickers(wrongEventId)).some((row) => row.ticker === "MMM"), false);
  assertEquals(corrected?.lifecycle, "invalidated");
  assertEquals(corrected?.verificationState, "INVALIDATED");
  assertEquals(corrected?.priorityScore, 0);
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

const ASHTON_TITLE = "ASHTON WOODS USA L.L.C. ANNOUNCES QUARTERLY RESULTS CONFERENCE CALL";
const ORIGINAL_CORRECTION = {
  policy_version: "news-attribution-correction-v1",
  raw_item_id: "raw-placeholder",
  event_id: "event-placeholder",
  removed_ticker: "MMM",
  corrected_at: "2026-10-02T15:00:00.000Z",
  reason: "attribution_rules_no_longer_support_ticker",
  corrected_attribution_status: "unresolved",
  corrected_attribution_ticker: null,
  corrected_attribution_note: "no_attribution",
  corrected_unresolved_reason: "NO_ATTRIBUTION",
};

async function seedIncompleteAshton(store: ReturnType<typeof createMemoryStore>, verification: "REPORTED" | "INVALIDATED") {
  const src = source({
    sourceType: "NEWS_PR",
    url: "https://news.example.test/ashton-repair",
    evidenceTier: "TIER_2_STRONG_SECONDARY",
  });
  await store.saveSource(src);
  const rawId = crypto.randomUUID();
  const eventId = crypto.randomUUID();
  const provenance = { ...ORIGINAL_CORRECTION, raw_item_id: rawId, event_id: eventId };
  await store.insertRaw({
    id: rawId,
    sourceId: src.id,
    externalId: "ashton-repair",
    canonicalUrl: "https://www.globenewswire.com/news-release/ashton",
    contentHash: "ashton-repair-hash",
    publishedAt: NOW.toISOString(),
    discoveredAt: NOW.toISOString(),
    title: ASHTON_TITLE,
    bodyExcerpt: "The company will host a conference call.",
    metadata: {},
  });
  await store.insertEvent({
    id: eventId,
    canonicalKey: "ci:MMM:OTHER_MATERIAL_EVENT:ashton-repair",
    title: ASHTON_TITLE,
    summary: "The company will host a conference call.",
    announcementSummary: "The company will host a conference call.",
    eventType: "OTHER_MATERIAL_EVENT",
    eventSubtype: null,
    lifecycle: "invalidated",
    catalystState: "INFORMATIONAL",
    firstDiscoveredAt: NOW.toISOString(),
    sourcePublishedAt: NOW.toISOString(),
    scheduledStartAt: null,
    scheduledEndAt: null,
    scheduledDate: null,
    announcementAt: NOW.toISOString(),
    effectiveAt: null,
    timingBucket: "unknown",
    verificationState: verification,
    evidenceConfidence: verification === "REPORTED" ? 55 : 0,
    materiality: 50,
    timingUrgency: 40,
    reactionScore: null,
    priorityScore: 0,
    attributionConfidence: 0.72,
    distributionStatus: "observation",
    lifecycleLog: [{ from: "announced", to: "invalidated", at: NOW.toISOString(), reason: "attribution_correction" }],
    scoreComponents: { attribution_correction: provenance },
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
    canonicalUrl: "https://www.globenewswire.com/news-release/ashton",
    contentHash: "ashton-repair-hash",
    publishedAt: NOW.toISOString(),
    conflict: false,
  });
  return { src, rawId, eventId, provenance };
}

Deno.test("incomplete attribution correction repairs REPORTED verification without recreating MMM", async () => {
  const store = createMemoryStore();
  const seeded = await seedIncompleteAshton(store, "REPORTED");
  const rawBefore = JSON.stringify(await store.getRawItem(seeded.rawId));
  const evidenceBefore = JSON.stringify(await store.findEvidenceByRaw(seeded.rawId));
  const dry = await runAttributionCorrection(store, {
    scope: { rawItemId: seeded.rawId, eventId: seeded.eventId, wrongTicker: "MMM" },
    dryRun: true,
    apply: false,
    companies: NEWS_UNIVERSE,
    source: seeded.src,
    now: NOW,
  });
  assertEquals(dry.item?.correctionStatus, "WOULD_REPAIR");
  assertEquals(dry.item?.proposedVerificationState, "INVALIDATED");
  assertEquals(dry.item?.proposedLifecycle, "invalidated");
  assertEquals(dry.item?.removedTickers, []);
  assertEquals(dry.item?.recheck?.correctedStatus, "unresolved");
  assertEquals(dry.item?.recheck?.correctedTicker, null);
  assertEquals((await store.getEvent(seeded.eventId))?.verificationState, "REPORTED");
  assertEquals(JSON.stringify(await store.getRawItem(seeded.rawId)), rawBefore);

  const conflict = await runAttributionCorrection(store, {
    scope: { rawItemId: seeded.rawId, eventId: seeded.eventId, wrongTicker: "MMM" },
    dryRun: false,
    apply: true,
    concurrencyToken: "stale-token",
    companies: NEWS_UNIVERSE,
    source: seeded.src,
    now: NOW,
  });
  assertEquals(conflict.item?.correctionStatus, "CONFLICT");
  assertEquals((await store.getEvent(seeded.eventId))?.verificationState, "REPORTED");

  const apply = await runAttributionCorrection(store, {
    scope: { rawItemId: seeded.rawId, eventId: seeded.eventId, wrongTicker: "MMM" },
    dryRun: false,
    apply: true,
    concurrencyToken: dry.item?.concurrencyToken ?? null,
    companies: NEWS_UNIVERSE,
    source: seeded.src,
    now: NOW,
  });
  assertEquals(apply.item?.correctionStatus, "REPAIRED");
  const repaired = await store.getEvent(seeded.eventId);
  assertEquals(repaired?.verificationState, "INVALIDATED");
  assertEquals(repaired?.lifecycle, "invalidated");
  assertEquals(repaired?.priorityScore, 0);
  assertEquals(repaired?.distributionStatus, "observation");
  const provenance = repaired?.scoreComponents.attribution_correction as Record<string, unknown>;
  assertEquals(provenance.removed_ticker, "MMM");
  assertEquals(provenance.corrected_at, ORIGINAL_CORRECTION.corrected_at);
  assertEquals(provenance.corrected_attribution_status, "unresolved");
  const repair = provenance.verification_state_repair as Record<string, unknown>;
  assertEquals(repair.from, "REPORTED");
  assertEquals(repair.to, "INVALIDATED");
  assertEquals(repair.reason, "incomplete_attribution_correction");
  assert(repaired?.lifecycleLog.some((entry) => entry.reason === "verification_state_repair"));
  assertEquals((await store.listTickers(seeded.eventId)).length, 0);
  assertEquals(JSON.stringify(await store.getRawItem(seeded.rawId)), rawBefore);
  assertEquals(JSON.stringify(await store.findEvidenceByRaw(seeded.rawId)), evidenceBefore);

  const again = await runAttributionCorrection(store, {
    scope: { rawItemId: seeded.rawId, eventId: seeded.eventId, wrongTicker: "MMM" },
    dryRun: false,
    apply: true,
    concurrencyToken: apply.item?.concurrencyToken ?? null,
    companies: NEWS_UNIVERSE,
    source: seeded.src,
    now: NOW,
  });
  assertEquals(again.item?.correctionStatus, "NO_CHANGE");
});

Deno.test("fully corrected attribution event is NO_CHANGE", async () => {
  const store = createMemoryStore();
  const seeded = await seedIncompleteAshton(store, "INVALIDATED");
  const before = JSON.stringify(await store.getEvent(seeded.eventId));
  const result = await runAttributionCorrection(store, {
    scope: { rawItemId: seeded.rawId, eventId: seeded.eventId, wrongTicker: "MMM" },
    dryRun: true,
    apply: false,
    companies: NEWS_UNIVERSE,
    source: seeded.src,
    now: NOW,
  });
  assertEquals(result.item?.correctionStatus, "NO_CHANGE");
  assertEquals(JSON.stringify(await store.getEvent(seeded.eventId)), before);
  assertEquals((await store.listTickers(seeded.eventId)).length, 0);
});

Deno.test("NEWS name lookup does not scan the full universe per item", () => {
  const rows = [
    { ticker: "SYK", name: "Stryker Corporation" },
    { ticker: "NBTX", name: "Nanobiotix SA" },
  ];
  for (let i = 0; i < 4_000; i++) rows.push({ ticker: `T${i.toString(36).toUpperCase()}`, name: `Harbor ${i} Holdings` });
  const universe = buildCompanyUniverse(rows);
  const index = buildAttributionIndex(universe);
  const decision = attributeCandidate(newsCandidate("Stryker Corporation reports results", null), {
    ...NEWS_CTX,
    companies: universe,
    attributionIndex: index,
  });
  assertEquals(decision.ticker, "SYK");
  assert(index.lastNewsCandidateCount < 10);
  const started = performance.now();
  for (let i = 0; i < 8; i++) {
    attributeCandidate(newsCandidate("Bonduelle announces quarterly results", "The company will host a call."), {
      ...NEWS_CTX,
      companies: universe,
      attributionIndex: index,
    });
  }
  assert(performance.now() - started < 250);
});

Deno.test("NEWS checkpoints continuation after the first item so a hard kill can resume", async () => {
  const base = createMemoryStore();
  let firstContinuation: number | null = null;
  const store = {
    ...base,
    async saveSource(row: Parameters<typeof base.saveSource>[0]) {
      const continuation = row.metadata.news_feed_continuation as { next_item_index?: number } | undefined;
      if (firstContinuation == null && continuation?.next_item_index != null) {
        firstContinuation = continuation.next_item_index;
      }
      return base.saveSource(row);
    },
    async saveRun(run: Parameters<typeof base.saveRun>[0]) {
      return base.saveRun(run);
    },
  };
  const src = source({
    sourceType: "NEWS_PR",
    url: "https://www.globenewswire.com/RssFeed/checkpoint",
    evidenceTier: "TIER_2_STRONG_SECONDARY",
    feedFormat: "rss",
  });
  await store.saveSource(src);
  const body = rssFeed(20);
  await runCollectorBot({
    bot: "news",
    adapter: newsPrAdapter,
    store,
    now: NOW,
    userAgent: "test",
    fetchImpl: () => Promise.resolve(new Response(body, { status: 200 })),
    batchLimit: 1,
    companies: NEWS_UNIVERSE,
    newsItemBudget: 1,
    newsWallTimeMs: 60_000,
  });
  assertEquals(firstContinuation, 1);
  const saved = (await store.listSources({}))[0];
  assertEquals(saved.lastContentHash, null);
  assertEquals((saved.metadata.news_feed_continuation as { next_item_index: number }).next_item_index, 1);

  const second = await runCollectorBot({
    bot: "news",
    adapter: newsPrAdapter,
    store,
    now: new Date(NOW.getTime() + 60_000),
    userAgent: "test",
    fetchImpl: () => Promise.resolve(new Response(body, { status: 200 })),
    batchLimit: 1,
    companies: NEWS_UNIVERSE,
    newsItemBudget: 20,
    newsWallTimeMs: 60_000,
  });
  assertEquals(second.rawItemsSeen, 19);
  const done = (await store.listSources({}))[0];
  assertEquals(done.metadata.news_feed_continuation, undefined);
  assert(done.lastContentHash != null);
  assertEquals(base.rawItems().length, 20);
});

Deno.test("stale running Catalyst run recovers without touching source failure count", async () => {
  const store = createMemoryStore();
  const src = source({
    sourceType: "NEWS_PR",
    url: "https://www.globenewswire.com/RssFeed/stale",
    evidenceTier: "TIER_2_STRONG_SECONDARY",
  });
  src.failureCount = 0;
  await store.saveSource(src);
  const started = new Date(NOW.getTime() - 60 * 60 * 1000);
  const run = emptyRun("news", "1759bb3f-e443-425f-a17f-73fdc3ab0a96", started.toISOString());
  run.rawItemsSeen = 1;
  run.newItems = 1;
  await store.saveRun(run);
  const fresh = emptyRun("news", crypto.randomUUID(), NOW.toISOString());
  await store.saveRun(fresh);
  const completed = emptyRun("news", crypto.randomUUID(), started.toISOString());
  completed.status = "completed";
  completed.completedAt = NOW.toISOString();
  await store.saveRun(completed);

  const dry = await runStaleRunRecovery(store, {
    runId: run.runId,
    dryRun: true,
    apply: false,
    now: NOW,
  });
  assertEquals(dry.recoveryStatus, "WOULD_RECOVER");
  assertEquals(dry.proposedStatus, "failed");
  assertEquals((await store.getRun(run.runId))?.status, "running");

  const applied = await runStaleRunRecovery(store, {
    runId: run.runId,
    dryRun: false,
    apply: true,
    concurrencyToken: dry.concurrencyToken,
    now: NOW,
  });
  assertEquals(applied.recoveryStatus, "RECOVERED");
  const saved = await store.getRun(run.runId);
  assertEquals(saved?.status, "failed");
  assertEquals(saved?.startedAt, started.toISOString());
  assertEquals(saved?.rawItemsSeen, 1);
  assert(saved?.errors.some((error) => error.category === "stale_run_recovery"));
  assertEquals((await store.listSources({}))[0].failureCount, 0);

  const again = await runStaleRunRecovery(store, {
    runId: run.runId,
    dryRun: false,
    apply: true,
    concurrencyToken: runRecoveryToken(saved!),
    now: NOW,
  });
  assertEquals(again.recoveryStatus, "NO_CHANGE");

  const notStale = await runStaleRunRecovery(store, {
    runId: fresh.runId,
    dryRun: true,
    apply: false,
    now: NOW,
  });
  assertEquals(notStale.recoveryStatus, "NOT_STALE");

  const done = await runStaleRunRecovery(store, {
    runId: completed.runId,
    dryRun: true,
    apply: false,
    now: NOW,
  });
  assertEquals(done.recoveryStatus, "NO_CHANGE");
});

function gnwFeed(titles: string[]): string {
  const items = titles.map((title, index) => `<item>
<title>${title}</title>
<link>https://www.globenewswire.com/news-release/${index}</link>
<guid isPermaLink="false">gnw-${index}</guid>
<pubDate>Wed, 01 Oct 2026 12:00:00 GMT</pubDate>
<description>The company will host a call.</description>
</item>`).join("\n");
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>GNW</title>${items}</channel></rss>`;
}

function gnwSource(): SourceRecord {
  return source({
    id: "src-gnw",
    sourceKey: "globenewswire-earnings-rss",
    sourceType: "NEWS_PR",
    url: "https://www.globenewswire.com/RssFeed/earnings",
    evidenceTier: "TIER_2_STRONG_SECONDARY",
    feedFormat: "rss",
  });
}

function immutableStore() {
  const base = createMemoryStore();
  const store = {
    ...base,
    async mergeRawMetadata(): Promise<void> {
      throw new Error("database");
    },
  };
  return { base, store };
}

async function seedFeedItem(store: ReturnType<typeof createMemoryStore>, src: SourceRecord, body: string) {
  const item = (await newsPrAdapter.discover({
    now: NOW,
    source: src,
    userAgent: "test",
    fetchImpl: () => Promise.resolve(new Response(body, { status: 200 })),
    itemLimit: 20,
    allowFixtures: false,
    fetchState: { unchanged: false, etag: null, lastModified: null, contentHash: null, checkpoint: null },
  }))[0];
  const rawId = "3ec9eddd-0000-4000-8000-000000000001";
  await store.insertRaw({
    id: rawId,
    sourceId: item.sourceId,
    externalId: item.externalId,
    canonicalUrl: item.canonicalUrl,
    contentHash: item.contentHash,
    publishedAt: item.publishedAt,
    discoveredAt: item.discoveredAt,
    title: item.title,
    bodyExcerpt: item.summary,
    metadata: { seeded: "existing-unresolved" },
  });
  return { item, rawId };
}

Deno.test("NEWS existing unresolved raw is handled and left unchanged", async () => {
  const { base, store } = immutableStore();
  const src = gnwSource();
  await store.saveSource(src);
  const body = gnwFeed(["Bonduelle announces quarterly results"]);
  const { item, rawId } = await seedFeedItem(base, src, body);
  const before = JSON.stringify(await base.getRawItem(rawId));
  const candidate = await newsPrAdapter.normalize(item, {
    now: NOW,
    source: src,
    userAgent: "test",
    fetchImpl: fetch,
    itemLimit: 1,
    allowFixtures: false,
    fetchState: { unchanged: false, etag: null, lastModified: null, contentHash: null, checkpoint: null },
  });
  assert(candidate);
  const outcome = await ingestCandidate(store, candidate, {
    now: NOW,
    allowFixtures: false,
    source: src,
    companies: NEWS_UNIVERSE,
    attributionIndex: NEWS_CTX.attributionIndex,
  });
  assertEquals(outcome.status, "unresolved");
  assertEquals(outcome.eventId, null);
  assertEquals(outcome.rawDisposition, "existing_resumed");
  assertEquals(base.rawItems().length, 1);
  assertEquals(base.events().length, 0);
  assertEquals(JSON.stringify(await base.getRawItem(rawId)), before);
});

Deno.test("NEWS existing raw linked to an event is an idempotent duplicate", async () => {
  const store = createMemoryStore();
  const src = gnwSource();
  const candidate = newsCandidate("Stryker Corporation reports results", null);
  candidate.raw.sourceId = src.id;
  const ctx = {
    now: NOW,
    allowFixtures: false,
    source: src,
    companies: NEWS_UNIVERSE,
    attributionIndex: NEWS_CTX.attributionIndex,
  };
  const first = await ingestCandidate(store, candidate, ctx);
  assertEquals(first.status, "created");
  const second = await ingestCandidate(store, candidate, ctx);
  assertEquals(second.status, "duplicate");
  assertEquals(second.rawDisposition, "existing_linked");
  assertEquals(second.eventId, first.eventId);
  assertEquals(store.rawItems().length, 1);
  assertEquals(store.events().length, 1);
});

Deno.test("NEWS existing unresolved raw is idempotent across repeats", async () => {
  const { base, store } = immutableStore();
  const src = gnwSource();
  const body = gnwFeed(["Bonduelle announces quarterly results"]);
  const { item, rawId } = await seedFeedItem(base, src, body);
  const candidate = await newsPrAdapter.normalize(item, {
    now: NOW,
    source: src,
    userAgent: "test",
    fetchImpl: fetch,
    itemLimit: 1,
    allowFixtures: false,
    fetchState: { unchanged: false, etag: null, lastModified: null, contentHash: null, checkpoint: null },
  });
  assert(candidate);
  const ctx = {
    now: NOW,
    allowFixtures: false,
    source: src,
    companies: NEWS_UNIVERSE,
    attributionIndex: NEWS_CTX.attributionIndex,
  };
  const first = await ingestCandidate(store, candidate, ctx);
  const snapshot = JSON.stringify(await base.getRawItem(rawId));
  const second = await ingestCandidate(store, candidate, ctx);
  assertEquals(first.status, "unresolved");
  assertEquals(second.status, "unresolved");
  assertEquals(first.rawDisposition, "existing_resumed");
  assertEquals(second.rawDisposition, "existing_resumed");
  assertEquals(base.rawItems().length, 1);
  assertEquals(base.events().length, 0);
  assertEquals(JSON.stringify(await base.getRawItem(rawId)), snapshot);
});

Deno.test("NEWS inconsistent evidence fails with an explicit diagnostic", async () => {
  const store = createMemoryStore();
  const src = gnwSource();
  const body = gnwFeed(["Bonduelle announces quarterly results"]);
  const { item, rawId } = await seedFeedItem(store, src, body);
  await store.insertEvidence({
    id: crypto.randomUUID(),
    eventId: "missing-event",
    rawItemId: rawId,
    sourceId: src.id,
    authorityKey: "globenewswire",
    evidenceTier: "TIER_2_STRONG_SECONDARY",
    evidenceRole: "secondary",
    canonicalUrl: item.canonicalUrl,
    contentHash: item.contentHash,
    publishedAt: item.publishedAt,
    conflict: false,
  });
  const candidate = await newsPrAdapter.normalize(item, {
    now: NOW,
    source: src,
    userAgent: "test",
    fetchImpl: fetch,
    itemLimit: 1,
    allowFixtures: false,
    fetchState: { unchanged: false, etag: null, lastModified: null, contentHash: null, checkpoint: null },
  });
  assert(candidate);
  const error = await assertRejects(
    () => ingestCandidate(store, candidate, {
      now: NOW,
      allowFixtures: false,
      source: src,
      companies: NEWS_UNIVERSE,
      attributionIndex: NEWS_CTX.attributionIndex,
    }),
    ItemIngestError,
  );
  assertEquals(error.stage, "inconsistent_linkage");
  assertEquals(error.errorCode, "EVIDENCE_WITHOUT_EVENT");
  assertEquals(store.events().length, 0);
  assertEquals(store.rawItems().length, 1);
});

Deno.test("NEWS item ingest failure records diagnostics and does not advance the cursor", async () => {
  const base = createMemoryStore();
  const src = gnwSource();
  await base.saveSource(src);
  const store = {
    ...base,
    async insertRaw(): Promise<void> {
      throw new ItemIngestError(
        "attribution",
        "FORCED_ITEM_FAILURE",
        "failed SYNC_SECRET=abc Bearer tok.eyJaaaaaaaa.bbbbbbbb.cccccccc",
      );
    },
  };
  const body = gnwFeed(["Bonduelle announces quarterly results", "Second issuer announces quarterly results"]);
  const run = await runCollectorBot({
    bot: "news",
    adapter: newsPrAdapter,
    store,
    now: NOW,
    userAgent: "test",
    fetchImpl: () => Promise.resolve(new Response(body, { status: 200 })),
    batchLimit: 1,
    companies: NEWS_UNIVERSE,
    newsItemBudget: 8,
  });
  assertEquals(run.status, "completed");
  assertEquals(run.sourcesFailed, 1);
  assertEquals(run.sourcesSuccessful, 0);
  const failure = run.errors.find((error) => error.category === "item_ingest_error");
  assert(failure);
  assertEquals(failure.details?.stage, "attribution");
  assertEquals(failure.details?.error_code, "FORCED_ITEM_FAILURE");
  assertEquals(failure.details?.item_index, 0);
  assertEquals(failure.details?.source_key, "globenewswire-earnings-rss");
  assertEquals(failure.details?.item_identity, "gnw-0");
  const message = String(failure.details?.message ?? "");
  assert(message.includes("failed"));
  assert(!message.includes("SYNC_SECRET=abc"));
  assert(!message.includes("Bearer tok"));
  assert(!message.includes("eyJaaaaaaaa"));
  const saved = (await base.listSources({}))[0];
  assertEquals(readNewsContinuation(saved.metadata)?.next_item_index, 0);
  assertEquals(saved.lastErrorCategory, "item_ingest_error");
});

Deno.test("NEWS fetch failure stays distinct from item ingest failure", async () => {
  const store = createMemoryStore();
  const src = gnwSource();
  await store.saveSource(src);
  const run = await runCollectorBot({
    bot: "news",
    adapter: newsPrAdapter,
    store,
    now: NOW,
    userAgent: "test",
    fetchImpl: () => Promise.resolve(new Response("nope", { status: 500 })),
    batchLimit: 1,
    companies: NEWS_UNIVERSE,
  });
  assertEquals(run.sourcesFailed, 1);
  assertEquals(run.errors[0]?.category, "upstream");
  assert(!run.errors.some((error) => error.category === "item_ingest_error"));
  assertEquals(readNewsContinuation((await store.listSources({}))[0].metadata), null);
});

Deno.test("NEWS Bonduelle duplicate reaches the next item", async () => {
  const { base, store } = immutableStore();
  const src = gnwSource();
  await store.saveSource(src);
  const body = gnwFeed([
    "Bonduelle announces quarterly results",
    "Second issuer announces quarterly results",
  ]);
  const { rawId } = await seedFeedItem(base, src, body);
  const before = JSON.stringify(await base.getRawItem(rawId));
  const run = await runCollectorBot({
    bot: "news",
    adapter: newsPrAdapter,
    store,
    now: NOW,
    userAgent: "test",
    fetchImpl: () => Promise.resolve(new Response(body, { status: 200 })),
    batchLimit: 1,
    companies: NEWS_UNIVERSE,
    newsItemBudget: 8,
  });
  assertEquals(run.sourcesFailed, 0);
  assertEquals(run.sourcesSuccessful, 1);
  assertEquals(run.duplicates, 1);
  assertEquals(run.newItems, 1);
  assertEquals(run.eventsCreated, 0);
  assert(base.rawItems().some((row) => row.externalId === "gnw-1"));
  assertEquals(JSON.stringify(await base.getRawItem(rawId)), before);
  assertEquals(base.events().length, 0);
});

Deno.test("NEWS 20-item feed continues past a pre-existing unresolved raw", async () => {
  const { base, store } = immutableStore();
  const src = gnwSource();
  await store.saveSource(src);
  const titles = ["Bonduelle announces quarterly results"];
  for (let index = 1; index < 20; index += 1) titles.push(`Issuer ${index} USA L.L.C. announces quarterly results`);
  const body = gnwFeed(titles);
  await seedFeedItem(base, src, body);
  const run = await runCollectorBot({
    bot: "news",
    adapter: newsPrAdapter,
    store,
    now: NOW,
    userAgent: "test",
    fetchImpl: () => Promise.resolve(new Response(body, { status: 200 })),
    batchLimit: 1,
    companies: NEWS_UNIVERSE,
  });
  assertEquals(run.sourcesFailed, 0);
  assertEquals(run.sourcesSuccessful, 1);
  assertEquals(run.duplicates, 1);
  assertEquals(run.newItems, 7);
  assertEquals(run.eventsCreated, 0);
  assertEquals(base.rawItems().length, 8);
  assert(base.rawItems().some((row) => row.externalId === "gnw-1"));
  const saved = (await base.listSources({}))[0];
  const continuation = readNewsContinuation(saved.metadata);
  assertEquals(continuation?.next_item_index, 8);
  assertEquals(continuation?.feed_item_count, 20);
  assert(continuation?.feed_content_hash);
  assertEquals(saved.lastContentHash, null);
  assertEquals(saved.failureCount, 0);
  const obs = run.observability as RunObservability | undefined;
  assertEquals(obs?.ingestion?.continuation_remaining_items, 12);
  assertEquals(obs?.ingestion?.resource_stop_reason, "news_item_budget");
});

const DUTCH_FORFARMERS = "ForFarmers N.V.: Joint venture ForFarmers en KPS Food Group in Polen afgerond";

Deno.test("NEWS Joint venture headline never attributes The Joint Corp", () => {
  const decision = attributeCandidate(newsCandidate(DUTCH_FORFARMERS, "The company will host a call."), NEWS_CTX);
  assertEquals(decision.status, "unresolved");
  assertEquals(decision.ticker, null);
  assertEquals(decision.unresolvedReason ?? "NO_ATTRIBUTION", "NO_ATTRIBUTION");
  assert(decision.ticker !== "JYNT");
});

Deno.test("NEWS full The Joint Corp identity phrase resolves JYNT", () => {
  const decision = attributeCandidate(
    newsCandidate("The Joint Corp. Announces Quarterly Results", null),
    NEWS_CTX,
  );
  assertEquals(decision.ticker, "JYNT");
  assertEquals(decision.note, "news_name_match");
  assertEquals(decision.trace?.matchedPhrase, "the joint corp");
});

Deno.test("NEWS single-token company later in a headline stays unresolved", () => {
  const decision = attributeCandidate(
    newsCandidate("Quarterly results improve after Stryker commentary", null),
    NEWS_CTX,
  );
  assertEquals(decision.status, "unresolved");
  assert(decision.ticker !== "SYK");
});

Deno.test("NEWS multiple company names in one headline fail closed", () => {
  const decision = attributeCandidate(
    newsCandidate("Acuity Brands and Stryker Corporation announce a partnership", null),
    NEWS_CTX,
  );
  assertEquals(decision.status, "unresolved");
  assertEquals(decision.unresolvedReason, "AMBIGUOUS_COMPANY_ALIAS");
});

Deno.test("NEWS Stryker subject headline records the accepted phrase", () => {
  const decision = attributeCandidate(newsCandidate("Stryker Corporation reports results", null), NEWS_CTX);
  assertEquals(decision.ticker, "SYK");
  assertEquals(decision.trace?.method, "news_name_match");
  assertEquals(decision.trace?.matchBasis, "company_phrase");
  assert(decision.trace?.matchedPhrase?.includes("stryker"));
});

function providerRss(title: string, categories: string): string {
  return `<?xml version="1.0"?><rss version="2.0"><channel><item>
<title>${title}</title>
<link>https://www.globenewswire.com/news-release/provider</link>
<guid>gnw-provider</guid>
${categories}
<description>Issuer update without a company-name subject.</description>
</item></channel></rss>`;
}

async function providerDecision(title: string, categories: string, hostname = "www.globenewswire.com") {
  const src = source({
    sourceType: "NEWS_PR",
    url: `https://${hostname}/RssFeed/earnings`,
    evidenceTier: "TIER_2_STRONG_SECONDARY",
    hostname,
  });
  const body = providerRss(title, categories);
  const item = (await newsPrAdapter.discover({
    now: NOW,
    source: src,
    userAgent: "test",
    fetchImpl: () => Promise.resolve(new Response(body, { status: 200 })),
    itemLimit: 1,
    allowFixtures: false,
    fetchState: { unchanged: false, etag: null, lastModified: null, contentHash: null, checkpoint: null },
  }))[0];
  const candidate = await newsPrAdapter.normalize(item, {
    now: NOW,
    source: src,
    userAgent: "test",
    fetchImpl: fetch,
    itemLimit: 1,
    allowFixtures: false,
    companies: NEWS_UNIVERSE,
    fetchState: { unchanged: false, etag: null, lastModified: null, contentHash: null, checkpoint: null },
  });
  assert(candidate);
  return attributeCandidate(candidate, { ...NEWS_CTX, sourceType: "NEWS_PR" });
}

Deno.test("NEWS GlobeNewswire stock category resolves a unique universe ticker", async () => {
  const decision = await providerDecision(
    "Quarterly results update",
    `<category domain="https://www.globenewswire.com/rss/stock">Nasdaq:SYK</category>`,
  );
  assertEquals(decision.ticker, "SYK");
  assertEquals(decision.note, "provider_structured_ticker");
  assertEquals(decision.trace?.provider, "globenewswire_stock_category");
  assertEquals(decision.trace?.tickerPattern, "exchange_qualified");
});

Deno.test("NEWS malformed GlobeNewswire stock category stays unresolved", async () => {
  const decision = await providerDecision(
    "Quarterly results update",
    `<category domain="https://www.globenewswire.com/rss/stock">Nasdaq:NOT A SYMBOL</category>`,
  );
  assertEquals(decision.status, "unresolved");
  assertEquals(decision.ticker, null);
});

Deno.test("NEWS conflicting GlobeNewswire symbols fail closed", async () => {
  const decision = await providerDecision(
    "Stryker Corporation reports results",
    `<category domain="https://www.globenewswire.com/rss/stock">Nasdaq:SYK</category>
     <category domain="https://www.globenewswire.com/rss/stock">NYSE:MMM</category>`,
  );
  assertEquals(decision.status, "unresolved");
  assertEquals(decision.unresolvedReason, "PROVIDER_TICKER_CONFLICT");
  assertEquals(decision.ticker, null);
});

Deno.test("NEWS arbitrary RSS categories are not trusted as tickers", async () => {
  const decision = await providerDecision(
    "Quarterly results update",
    `<category domain="https://www.globenewswire.com/rss/industry">NASDAQ:SYK</category>
     <category>SYK</category>`,
  );
  assertEquals(decision.status, "unresolved");
  assertEquals(decision.ticker, null);
});

Deno.test("NEWS non-GlobeNewswire host ignores stock categories", async () => {
  const decision = await providerDecision(
    "Quarterly results update",
    `<category domain="https://www.globenewswire.com/rss/stock">Nasdaq:SYK</category>`,
    "news.example.test",
  );
  assertEquals(decision.status, "unresolved");
  assertEquals(decision.ticker, null);
});

Deno.test("NEWS JYNT correction re-check leaves the event unresolved", async () => {
  const store = createMemoryStore();
  const src = gnwSource();
  const eventId = crypto.randomUUID();
  const rawId = crypto.randomUUID();
  await store.insertEvent({
    id: eventId,
    canonicalKey: "ci:jynt:false",
    title: DUTCH_FORFARMERS,
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
    verificationState: "REPORTED",
    evidenceConfidence: 50,
    materiality: 50,
    timingUrgency: 40,
    reactionScore: null,
    priorityScore: 40,
    attributionConfidence: 0.85,
    distributionStatus: "observation",
    lifecycleLog: [],
    scoreComponents: {},
    updatedAt: NOW.toISOString(),
  });
  await store.insertRaw({
    id: rawId,
    sourceId: src.id,
    externalId: "forfarmers-dutch",
    canonicalUrl: "https://www.globenewswire.com/news-release/forfarmers-dutch",
    contentHash: "forfarmers-dutch",
    publishedAt: NOW.toISOString(),
    discoveredAt: NOW.toISOString(),
    title: DUTCH_FORFARMERS,
    bodyExcerpt: "The company will host a call.",
    metadata: { seeded: true },
  });
  await store.insertEvidence({
    id: crypto.randomUUID(),
    eventId,
    rawItemId: rawId,
    sourceId: src.id,
    authorityKey: "globenewswire",
    evidenceTier: "TIER_2_STRONG_SECONDARY",
    evidenceRole: "secondary",
    canonicalUrl: "https://www.globenewswire.com/news-release/forfarmers-dutch",
    contentHash: "forfarmers-dutch",
    publishedAt: NOW.toISOString(),
    conflict: false,
  });
  await store.upsertTicker({
    id: crypto.randomUUID(),
    eventId,
    ticker: "JYNT",
    relation: "PRIMARY",
    confidence: 0.85,
    isPrimary: true,
    evidenceNote: "news_name_match",
  });
  const rawBefore = JSON.stringify(await store.getRawItem(rawId));
  const evidenceBefore = JSON.stringify(await store.findEvidenceByRaw(rawId));
  const dry = await runAttributionCorrection(store, {
    scope: { rawItemId: rawId, eventId, wrongTicker: "JYNT" },
    dryRun: true,
    apply: false,
    companies: NEWS_UNIVERSE,
    source: src,
    now: NOW,
  });
  assertEquals(dry.item?.correctionStatus, "WOULD_CORRECT");
  assertEquals(dry.item?.recheck?.previousTicker, "JYNT");
  assertEquals(dry.item?.recheck?.correctedStatus, "unresolved");
  assertEquals(dry.item?.recheck?.correctedTicker, null);
  assertEquals(dry.item?.recheck?.correctedUnresolvedReason, "NO_ATTRIBUTION");
  assertEquals(dry.item?.proposedVerificationState, "INVALIDATED");
  assertEquals(dry.item?.removedTickers, ["JYNT"]);
  const apply = await runAttributionCorrection(store, {
    scope: { rawItemId: rawId, eventId, wrongTicker: "JYNT" },
    dryRun: false,
    apply: true,
    concurrencyToken: dry.item?.concurrencyToken ?? null,
    companies: NEWS_UNIVERSE,
    source: src,
    now: NOW,
  });
  assertEquals(apply.item?.correctionStatus, "CORRECTED");
  const corrected = await store.getEvent(eventId);
  assertEquals(corrected?.lifecycle, "invalidated");
  assertEquals(corrected?.verificationState, "INVALIDATED");
  assertEquals(corrected?.priorityScore, 0);
  assertEquals((await store.listTickers(eventId)).length, 0);
  assertEquals(JSON.stringify(await store.getRawItem(rawId)), rawBefore);
  assertEquals(JSON.stringify(await store.findEvidenceByRaw(rawId)), evidenceBefore);
});
