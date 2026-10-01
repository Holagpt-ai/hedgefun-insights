import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractExplicitScheduledDates } from "./announcement-dates.ts";
import { companyIrAdapter } from "./adapters/company-ir.ts";
import { classifyText, isExecutiveAppearance } from "./classification.ts";
import { timingUrgency } from "./impact.ts";
import { ingestCandidate } from "./pipeline.ts";
import { createMemoryStore } from "./persistence.ts";
import { runReactionBot } from "./run-bot.ts";
import { normalizeTiming } from "./timing.ts";
import { catalystPriority } from "./scoring.ts";
import type { SourceRecord } from "./types.ts";

const DISCOVERY = new Date("2026-10-01T15:00:00.000Z");
const JULY_PUB = "2026-07-15T13:00:00.000Z";

function source(): SourceRecord {
  return {
    id: crypto.randomUUID(),
    sourceKey: "intu-press-releases-rss",
    companyName: "Intuit Inc.",
    ticker: "INTU",
    cik: null,
    sourceType: "COMPANY_IR",
    url: "https://investors.intuit.com/news-events/press-releases/rss",
    hostname: "investors.intuit.com",
    feedFormat: "rss",
    pollIntervalSeconds: 600,
    enabled: true,
    priority: 50,
    evidenceTier: "TIER_1_PRIMARY",
    authorityKey: "intuit",
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

Deno.test("Intuit A: CFO conference appearance is not executive change", () => {
  const title = "Intuit CFO Sandeep Aujla to Present at the Goldman Sachs Communacopia + Technology Conference";
  assert(isExecutiveAppearance(title));
  assertEquals(classifyText(title).eventType, "CONFERENCE");
});

Deno.test("Intuit B: Investor Day announcement is investor event not product strategy", () => {
  const title = "Intuit Hosts Investor Day; Reaffirms First Quarter and Fiscal 2027 Guidance";
  assertEquals(classifyText(title).eventType, "INVESTOR_EVENT");
});

Deno.test("Intuit C: quarterly/fiscal results classify as earnings not guidance", () => {
  const q4 = "Intuit Announces Fourth Quarter and Full Year Fiscal 2026 Results";
  const guidanceHeavy = "Intuit Reports Fourth Quarter Results and Raises Full-Year Guidance Outlook";
  assertEquals(classifyText(q4).eventType, "EARNINGS");
  assertEquals(classifyText(guidanceHeavy).eventType, "EARNINGS");
});

Deno.test("Intuit D: results-date announcement extracts scheduled date", async () => {
  const title = "Intuit Announces Date for Fourth Quarter and Fiscal 2026 Results on August 25, 2026";
  assertEquals(classifyText(title).eventType, "EARNINGS");
  const extracted = extractExplicitScheduledDates(title, "2026-07-20T12:00:00.000Z");
  assertEquals(extracted.scheduledDate, "2026-08-25");
  const src = source();
  const normalized = await companyIrAdapter.normalize!({
    sourceId: src.id,
    sourceType: "COMPANY_IR",
    externalId: "intu-date",
    canonicalUrl: "https://investors.intuit.com/example",
    publishedAt: "2026-07-20T12:00:00.000Z",
    discoveredAt: DISCOVERY.toISOString(),
    title,
    summary: null,
    contentHash: "hash-date",
    metadata: {},
  }, { now: DISCOVERY, source: src, userAgent: "test", fetchImpl: fetch, itemLimit: 10, allowFixtures: false, fetchState: { unchanged: false, etag: null, lastModified: null, contentHash: null, checkpoint: null } });
  assert(normalized);
  assertEquals(normalized.scheduledDate, "2026-08-25");
  assertEquals(normalized.isAnnouncement, true);
});

Deno.test("Intuit E: July publication discovered in October is not immediate urgency", () => {
  const title = "Intuit Launches Business Credit Card That Brings Spend Management Together in QuickBooks";
  const candidate = {
    raw: {
      sourceId: "s",
      sourceType: "COMPANY_IR" as const,
      externalId: "july",
      canonicalUrl: "https://investors.intuit.com/july",
      publishedAt: JULY_PUB,
      discoveredAt: DISCOVERY.toISOString(),
      title,
      summary: null,
      contentHash: "july-hash",
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
    evidenceTier: "TIER_1_PRIMARY" as const,
    metadata: {},
  };
  const timing = normalizeTiming(candidate, DISCOVERY);
  const urgency = timingUrgency({
    bucket: timing.bucket,
    lifecycle: "announced",
    scheduledStart: timing.scheduledStart,
    scheduledDate: timing.scheduledDate,
    publishedAt: timing.publishedAt,
    now: DISCOVERY,
  });
  assert(urgency < 50, `expected stale urgency, got ${urgency}`);
  const state = catalystPriority({
    evidenceConfidence: 95,
    materiality: 58,
    timingUrgency: urgency,
    attributionConfidence: 0.97,
    reactionScore: null,
    verification: "VERIFIED_PRIMARY",
    lifecycle: "announced",
  }).state;
  assertEquals(state, "WATCH");
});

Deno.test("Intuit F: guidance reaffirmation without results stays guidance", () => {
  const title = "Intuit Reaffirms Fiscal 2027 Guidance and Outlook";
  assertEquals(classifyText(title).eventType, "GUIDANCE");
});

Deno.test("executive change positives still classify", () => {
  assertEquals(
    classifyText("Example Co appoints Jane Doe as Chief Financial Officer").eventType,
    "EXECUTIVE_CHANGE",
  );
  assertEquals(
    classifyText("Chief Executive Officer resigns effective immediately").eventType,
    "EXECUTIVE_CHANGE",
  );
});

Deno.test("independent INTU IR releases stay separate canonical events", async () => {
  const store = createMemoryStore();
  const src = source();
  await store.saveSource(src);
  const titles = [
    "Intuit CFO Sandeep Aujla to Present at the Goldman Sachs Communacopia + Technology Conference",
    "Intuit Hosts Investor Day; Reaffirms First Quarter and Fiscal 2027 Guidance",
    "Intuit Announces Fourth Quarter and Full Year Fiscal 2026 Results",
  ];
  for (let i = 0; i < titles.length; i++) {
    const title = titles[i];
    await ingestCandidate(store, {
      raw: {
        sourceId: src.id,
        sourceType: "COMPANY_IR",
        externalId: `intu-${i}`,
        canonicalUrl: `https://investors.intuit.com/detail/${i}`,
        publishedAt: DISCOVERY.toISOString(),
        discoveredAt: DISCOVERY.toISOString(),
        title,
        summary: null,
        contentHash: `hash-${i}`,
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
    }, { now: DISCOVERY, allowFixtures: false, source: src });
  }
  assertEquals(store.events().length, 3);
  const types = store.events().map((event) => event.eventType).sort();
  assertEquals(types, ["CONFERENCE", "EARNINGS", "INVESTOR_EVENT"].sort());
});

Deno.test("announced IR item with future scheduled date skips reaction until event time", async () => {
  const store = createMemoryStore();
  const src = source();
  const title = "Intuit Hosts Investor Day on November 12, 2026";
  await ingestCandidate(store, {
    raw: {
      sourceId: src.id,
      sourceType: "COMPANY_IR",
      externalId: "future-id",
      canonicalUrl: "https://investors.intuit.com/future",
      publishedAt: "2026-09-01T12:00:00.000Z",
      discoveredAt: DISCOVERY.toISOString(),
      title,
      summary: null,
      contentHash: "future-hash",
      metadata: {},
    },
    title,
    summary: null,
    suggestedType: null,
    subtype: null,
    scheduledStart: null,
    scheduledDate: "2026-11-12",
    scheduledEnd: null,
    isAnnouncement: true,
    evidenceTier: "TIER_1_PRIMARY",
    metadata: {},
  }, { now: DISCOVERY, allowFixtures: false, source: src });
  const event = store.events()[0];
  assertEquals(event.scheduledDate, "2026-11-12");
  assertEquals(event.verificationState, "VERIFIED_PRIMARY");
  let polygonCalls = 0;
  await runReactionBot({
    store,
    now: DISCOVERY,
    batchLimit: 5,
    loadObservation: async () => null,
    loadReferenceBars: async () => {
      polygonCalls += 1;
      return [];
    },
  });
  assertEquals(polygonCalls, 0);
  assertEquals(store.reactions().length, 0);
});
