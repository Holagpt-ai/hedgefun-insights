import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createMemoryStore } from "./persistence.ts";
import {
  buildConcurrencyToken,
  deriveReconciledEvent,
  runEventReconciliation,
  type ReconciliationScope,
} from "./reconciliation.ts";
import type { CanonicalEvent, EvidenceRecord, RawItemRecord, SourceRecord, TickerLink } from "./types.ts";

const DISCOVERY = new Date("2026-10-01T15:00:00.000Z");
const JULY_PUB = "2026-07-15T13:00:00.000Z";
const SOURCE_KEY = "intu-press-releases-rss";

function intuSource(): SourceRecord {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    sourceKey: SOURCE_KEY,
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

interface FixtureRow {
  title: string;
  publishedAt: string;
  wrongType: CanonicalEvent["eventType"];
  externalId: string;
}

const FIXTURES: FixtureRow[] = [
  {
    title: "Intuit CFO Sandeep Aujla to Present at the Goldman Sachs Communacopia + Technology Conference",
    publishedAt: "2026-09-10T12:00:00.000Z",
    wrongType: "EXECUTIVE_CHANGE",
    externalId: "cfo-conf",
  },
  {
    title: "Intuit Hosts Investor Day; Reaffirms First Quarter and Fiscal 2027 Guidance",
    publishedAt: "2026-09-05T12:00:00.000Z",
    wrongType: "PRODUCT_STRATEGY_EVENT",
    externalId: "investor-day",
  },
  {
    title: "Intuit Announces Fourth Quarter and Full Year Fiscal 2026 Results",
    publishedAt: "2026-08-20T12:00:00.000Z",
    wrongType: "GUIDANCE",
    externalId: "q4-results",
  },
  {
    title: "Intuit Announces Date for Fourth Quarter and Fiscal 2026 Results on August 25, 2026",
    publishedAt: "2026-07-20T12:00:00.000Z",
    wrongType: "GUIDANCE",
    externalId: "results-date",
  },
  {
    title: "Intuit Launches Business Credit Card That Brings Spend Management Together in QuickBooks",
    publishedAt: JULY_PUB,
    wrongType: "PRODUCT_LAUNCH",
    externalId: "july-launch",
  },
  {
    title: "Intuit Reaffirms Fiscal 2027 Guidance and Outlook",
    publishedAt: "2026-09-01T12:00:00.000Z",
    wrongType: "GUIDANCE",
    externalId: "guidance-only",
  },
];

async function seedIntu(
  store: ReturnType<typeof createMemoryStore>,
  rows: FixtureRow[],
  source: SourceRecord,
) {
  await store.saveSource(source);
  for (const row of rows) {
    const rawId = crypto.randomUUID();
    const eventId = crypto.randomUUID();
    const raw: RawItemRecord = {
      id: rawId,
      sourceId: source.id,
      externalId: row.externalId,
      canonicalUrl: `https://investors.intuit.com/${row.externalId}`,
      contentHash: `hash-${row.externalId}`,
      publishedAt: row.publishedAt,
      discoveredAt: DISCOVERY.toISOString(),
      title: row.title,
      bodyExcerpt: null,
      metadata: {},
    };
    await store.insertRaw(raw);
    const event: CanonicalEvent = {
      id: eventId,
      canonicalKey: `ci:INTU:${row.wrongType}:${row.externalId}`,
      title: row.title,
      summary: null,
      announcementSummary: null,
      eventType: row.wrongType,
      eventSubtype: null,
      lifecycle: "announced",
      catalystState: "IMMEDIATE",
      firstDiscoveredAt: DISCOVERY.toISOString(),
      sourcePublishedAt: row.publishedAt,
      scheduledStartAt: null,
      scheduledEndAt: null,
      scheduledDate: null,
      announcementAt: row.publishedAt,
      effectiveAt: row.publishedAt,
      timingBucket: "immediate",
      verificationState: "VERIFIED_PRIMARY",
      evidenceConfidence: 95,
      materiality: 70,
      timingUrgency: 90,
      reactionScore: null,
      priorityScore: 88,
      attributionConfidence: 0.97,
      distributionStatus: "observation",
      lifecycleLog: [{ from: null, to: "announced", at: DISCOVERY.toISOString(), reason: "created" }],
      scoreComponents: {},
      updatedAt: "2026-10-01T15:00:01.000Z",
    };
    await store.insertEvent(event);
    const evidence: EvidenceRecord = {
      id: crypto.randomUUID(),
      eventId,
      rawItemId: rawId,
      sourceId: source.id,
      authorityKey: "intuit",
      evidenceTier: "TIER_1_PRIMARY",
      evidenceRole: "primary",
      canonicalUrl: raw.canonicalUrl,
      contentHash: raw.contentHash,
      publishedAt: row.publishedAt,
      conflict: false,
    };
    await store.insertEvidence(evidence);
    const link: TickerLink = {
      id: crypto.randomUUID(),
      eventId,
      ticker: "INTU",
      relation: "PRIMARY",
      confidence: 0.97,
      isPrimary: true,
      evidenceNote: null,
    };
    await store.upsertTicker(link);
  }
}

function scope(count: number): ReconciliationScope {
  return { ticker: "INTU", sourceKey: SOURCE_KEY, expectedCount: count };
}

Deno.test("reconciliation dry-run performs zero writes", async () => {
  const store = createMemoryStore();
  const source = intuSource();
  await seedIntu(store, FIXTURES, source);
  const before = store.events().map((e) => structuredClone(e));
  const result = await runEventReconciliation(store, {
    scope: scope(FIXTURES.length),
    dryRun: true,
    apply: false,
    now: DISCOVERY,
  });
  assertEquals(result.status, "OK");
  assertEquals(result.dryRun, true);
  assert(result.items.some((i) => i.status === "WOULD_UPDATE"));
  const after = store.events();
  assertEquals(after.length, before.length);
  for (let i = 0; i < before.length; i++) {
    assertEquals(after[i].eventType, before[i].eventType);
  }
});

Deno.test("reconciliation corrects Intuit classification fixtures", async () => {
  const store = createMemoryStore();
  const source = intuSource();
  await seedIntu(store, FIXTURES, source);
  const dry = await runEventReconciliation(store, {
    scope: scope(FIXTURES.length),
    dryRun: true,
    apply: false,
    now: DISCOVERY,
  });
  const byTitle = new Map(dry.items.map((i) => [i.title, i]));
  assertEquals(byTitle.get(FIXTURES[0].title)?.proposed.eventType, "CONFERENCE");
  assertEquals(byTitle.get(FIXTURES[1].title)?.proposed.eventType, "INVESTOR_EVENT");
  assertEquals(byTitle.get(FIXTURES[2].title)?.proposed.eventType, "EARNINGS");
  assertEquals(byTitle.get(FIXTURES[3].title)?.proposed.eventType, "EARNINGS");
  assertEquals(byTitle.get(FIXTURES[3].title)?.proposed.scheduledDate, "2026-08-25");
  assertEquals(byTitle.get(FIXTURES[5].title)?.proposed.eventType, "GUIDANCE");
  const july = byTitle.get(FIXTURES[4].title)!;
  assert(july.proposed.timingUrgency < 50);
  assertEquals(july.proposed.catalystState, "WATCH");
});

Deno.test("reconciliation apply updates and second apply is NO_CHANGE", async () => {
  const store = createMemoryStore();
  const source = intuSource();
  await seedIntu(store, FIXTURES, source);
  const dry = await runEventReconciliation(store, {
    scope: scope(FIXTURES.length),
    dryRun: true,
    apply: false,
    now: DISCOVERY,
  });
  const tokens = Object.fromEntries(dry.items.map((i) => [i.eventId, i.concurrencyToken]));
  const applied = await runEventReconciliation(store, {
    scope: scope(FIXTURES.length),
    dryRun: false,
    apply: true,
    concurrencyTokens: tokens,
    now: DISCOVERY,
  });
  assertEquals(applied.status, "OK");
  assert(applied.items.every((i) => i.status === "UPDATED" || i.status === "NO_CHANGE"));
  const cfo = store.events().find((e) => e.title.includes("CFO Sandeep"))!;
  assertEquals(cfo.eventType, "CONFERENCE");
  assertEquals(cfo.verificationState, "VERIFIED_PRIMARY");
  assertEquals(cfo.distributionStatus, "observation");
  assertEquals(cfo.firstDiscoveredAt, DISCOVERY.toISOString());

  const dry2 = await runEventReconciliation(store, {
    scope: scope(FIXTURES.length),
    dryRun: true,
    apply: false,
    now: DISCOVERY,
  });
  assert(dry2.items.every((i) => i.status === "NO_CHANGE"));
});

Deno.test("reconciliation scope mismatch fails closed", async () => {
  const store = createMemoryStore();
  const source = intuSource();
  await seedIntu(store, FIXTURES.slice(0, 3), source);
  const result = await runEventReconciliation(store, {
    scope: scope(10),
    dryRun: true,
    apply: false,
    now: DISCOVERY,
  });
  assertEquals(result.status, "RECONCILIATION_SCOPE_MISMATCH");
  assertEquals(result.actualCount, 3);
});

Deno.test("reconciliation wrong ticker source fails closed", async () => {
  const store = createMemoryStore();
  const source = { ...intuSource(), ticker: "HPE" };
  await seedIntu(store, FIXTURES.slice(0, 1), source);
  const result = await runEventReconciliation(store, {
    scope: scope(1),
    dryRun: true,
    apply: false,
    now: DISCOVERY,
  });
  assertEquals(result.status, "RECONCILIATION_SCOPE_MISMATCH");
});

Deno.test("reconciliation conflict when event changed after dry-run", async () => {
  const store = createMemoryStore();
  const source = intuSource();
  await seedIntu(store, FIXTURES.slice(0, 1), source);
  const dry = await runEventReconciliation(store, {
    scope: scope(1),
    dryRun: true,
    apply: false,
    now: DISCOVERY,
  });
  const event = store.events()[0];
  event.materiality = 999;
  await store.updateEvent(event);
  const tokens = { [dry.items[0].eventId]: dry.items[0].concurrencyToken };
  const applied = await runEventReconciliation(store, {
    scope: scope(1),
    dryRun: false,
    apply: true,
    concurrencyTokens: tokens,
    now: DISCOVERY,
  });
  assertEquals(applied.items[0].status, "CONFLICT");
});

Deno.test("reconciliation preserves protected ids and evidence", async () => {
  const store = createMemoryStore();
  const source = intuSource();
  await seedIntu(store, FIXTURES.slice(0, 1), source);
  const beforeEvent = store.events()[0];
  const beforeRaw = store.rawItems()[0];
  const dry = await runEventReconciliation(store, {
    scope: scope(1),
    dryRun: true,
    apply: false,
    now: DISCOVERY,
  });
  const tokens = { [dry.items[0].eventId]: dry.items[0].concurrencyToken };
  await runEventReconciliation(store, {
    scope: scope(1),
    dryRun: false,
    apply: true,
    concurrencyTokens: tokens,
    now: DISCOVERY,
  });
  assertEquals(store.events()[0].id, beforeEvent.id);
  assertEquals(store.rawItems()[0].id, beforeRaw.id);
  assertEquals(store.rawItems()[0].title, beforeRaw.title);
});

Deno.test("deriveReconciledEvent records reconciliation provenance in score_components", async () => {
  const store = createMemoryStore();
  const source = intuSource();
  await seedIntu(store, FIXTURES.slice(0, 1), source);
  const raw = store.rawItems()[0];
  const event = store.events()[0];
  const evidence = await store.findEvidenceByRaw(raw.id);
  assert(evidence);
  const next = await deriveReconciledEvent(store, { raw, event, evidence }, source, DISCOVERY);
  const rec = next.scoreComponents.reconciliation as Record<string, unknown>;
  assertEquals(rec.policy_version, "ir-semantics-v2");
  assertEquals(rec.raw_item_id, raw.id);
});

Deno.test("concurrency token changes when reconcilable fields change", async () => {
  const store = createMemoryStore();
  await seedIntu(store, FIXTURES.slice(0, 1), intuSource());
  const event = store.events()[0];
  const t1 = await buildConcurrencyToken(event);
  event.timingUrgency = 12;
  const t2 = await buildConcurrencyToken(event);
  assert(t1 !== t2);
});
