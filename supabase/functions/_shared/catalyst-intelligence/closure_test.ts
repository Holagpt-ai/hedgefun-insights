import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { newsPrAdapter } from "./adapters/news-pr.ts";
import { attributeCandidate } from "./attribution.ts";
import { buildCompanyUniverse } from "./company-universe.ts";
import { verifyEvidence } from "./evidence.ts";
import { eventReferenceInstant, priceBarsFromPolygonAggs, referencePriceAtOrBefore } from "./event-bars.ts";
import { observationFromRadarRow, pickLatestRadarRows } from "./market-reaction.ts";
import { ingestCandidate } from "./pipeline.ts";
import { createMemoryStore } from "./persistence.ts";
import { runCollectorBot, runReactionBot } from "./run-bot.ts";
import { selectDueSources } from "./source-registry.ts";
import type { NormalizedEventCandidate, SourceRecord } from "./types.ts";

const NOW = new Date("2026-09-30T15:00:00.000Z");

function source(partial: Partial<SourceRecord> & Pick<SourceRecord, "sourceType" | "url" | "evidenceTier">): SourceRecord {
  const url = new URL(partial.url);
  const sourceKey = partial.sourceKey ?? partial.sourceType.toLowerCase();
  return {
    id: partial.id ?? crypto.randomUUID(),
    sourceKey,
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
    authorityKey: partial.authorityKey ?? sourceKey,
    lastSuccessAt: partial.lastSuccessAt ?? null,
    lastContentHash: null,
    lastEtag: null,
    lastModified: null,
    failureCount: 0,
    backoffUntil: partial.backoffUntil ?? null,
    lastErrorCategory: null,
    metadata: partial.metadata ?? {},
  };
}

function candidate(input: {
  sourceId: string;
  externalId: string;
  title: string;
  hash?: string;
  ticker?: string;
}): NormalizedEventCandidate {
  const hash = input.hash ?? "hash-apple-chip-01";
  return {
    raw: {
      sourceId: input.sourceId,
      sourceType: "NEWS_PR",
      externalId: input.externalId,
      canonicalUrl: `https://news.example.test/${input.externalId}`,
      publishedAt: NOW.toISOString(),
      discoveredAt: NOW.toISOString(),
      title: input.title,
      summary: input.title,
      contentHash: hash,
      metadata: {},
    },
    title: input.title,
    summary: input.title,
    suggestedType: null,
    subtype: null,
    scheduledStart: null,
    scheduledEnd: null,
    scheduledDate: null,
    isAnnouncement: true,
    evidenceTier: "TIER_2_STRONG_SECONDARY",
    metadata: input.ticker ? { ticker: input.ticker } : {},
  };
}

Deno.test("unlinked raw resumes after attribution becomes possible", async () => {
  const store = createMemoryStore();
  const src = source({
    id: "news-1",
    sourceKey: "wire",
    authorityKey: "reuters",
    sourceType: "NEWS_PR",
    url: "https://news.example.test/feed",
    evidenceTier: "TIER_2_STRONG_SECONDARY",
  });
  const item = candidate({ sourceId: src.id, externalId: "apple-1", title: "Apple announces a new chip" });
  const first = await ingestCandidate(store, item, { now: NOW, allowFixtures: false, source: src });
  assertEquals(first.status, "unresolved");
  assertEquals(store.rawItems().length, 1);
  assertEquals(store.events().length, 0);

  const companies = buildCompanyUniverse([{ ticker: "AAPL", name: "Apple Inc." }]);
  const second = await ingestCandidate(store, item, { now: NOW, allowFixtures: false, source: src, companies });
  assertEquals(second.status, "created");
  assertEquals(second.rawItemId, first.rawItemId);
  assertEquals(store.rawItems().length, 1);
  assertEquals(store.events().length, 1);
  const evidence = await store.listEvidence(store.events()[0].id);
  assertEquals(evidence.length, 1);
  assertEquals(evidence[0].rawItemId, first.rawItemId);
  const tickers = await store.listTickers(store.events()[0].id);
  assertEquals(tickers[0].ticker, "AAPL");

  const third = await ingestCandidate(store, item, { now: NOW, allowFixtures: false, source: src, companies });
  assertEquals(third.status, "duplicate");
  assertEquals(store.rawItems().length, 1);
  assertEquals(store.events().length, 1);
});

Deno.test("downstream failure after raw insert resumes on the same raw row", async () => {
  const store = createMemoryStore();
  const src = source({
    id: "news-2",
    sourceType: "NEWS_PR",
    url: "https://news.example.test/feed",
    evidenceTier: "TIER_2_STRONG_SECONDARY",
    authorityKey: "reuters",
  });
  const item = candidate({
    sourceId: src.id,
    externalId: "nvda-1",
    title: "NVIDIA unveils a new accelerator",
    hash: "hash-nvda-01",
    ticker: "NVDA",
  });
  let failed = false;
  const insertEvent = store.insertEvent.bind(store);
  store.insertEvent = (event) => {
    if (!failed) {
      failed = true;
      throw new Error("downstream");
    }
    return insertEvent(event);
  };
  await assertRejects(() => ingestCandidate(store, item, { now: NOW, allowFixtures: false, source: src }));
  assertEquals(store.rawItems().length, 1);
  assertEquals(store.events().length, 0);
  const resumed = await ingestCandidate(store, item, { now: NOW, allowFixtures: false, source: src });
  assertEquals(resumed.status, "created");
  assertEquals(resumed.rawItemId, store.rawItems()[0].id);
  assertEquals(store.rawItems().length, 1);
  assertEquals(store.events().length, 1);
  assertEquals((await store.listEvidence(store.events()[0].id))[0].rawItemId, store.rawItems()[0].id);
});

Deno.test("concurrent ingestion of the same logical event creates one canonical event", async () => {
  const store = createMemoryStore();
  const left = source({
    id: "src-a",
    sourceKey: "wire-a",
    authorityKey: "reuters",
    sourceType: "NEWS_PR",
    url: "https://news.example.test/a",
    evidenceTier: "TIER_2_STRONG_SECONDARY",
  });
  const right = source({
    id: "src-b",
    sourceKey: "wire-b",
    authorityKey: "globenewswire",
    sourceType: "NEWS_PR",
    url: "https://news.example.test/b",
    evidenceTier: "TIER_2_STRONG_SECONDARY",
  });
  const shared = "same-logical-event-hash";
  const [a, b] = await Promise.all([
    ingestCandidate(store, candidate({ sourceId: left.id, externalId: "a", title: "Example Hood Markets names a CFO", hash: shared, ticker: "HOOD" }), {
      now: NOW, allowFixtures: false, source: left,
    }),
    ingestCandidate(store, candidate({ sourceId: right.id, externalId: "b", title: "Example Hood Markets names a CFO", hash: shared, ticker: "HOOD" }), {
      now: NOW, allowFixtures: false, source: right,
    }),
  ]);
  assertEquals(store.events().length, 1);
  assertEquals(store.rawItems().length, 2);
  assert(a.eventId === store.events()[0].id || b.eventId === store.events()[0].id);
  assertEquals((await store.listEvidence(store.events()[0].id)).length, 2);

  const again = createMemoryStore();
  const one = source({
    id: "src-same",
    sourceType: "NEWS_PR",
    url: "https://news.example.test/same",
    evidenceTier: "TIER_2_STRONG_SECONDARY",
    authorityKey: "reuters",
  });
  const item = candidate({ sourceId: one.id, externalId: "same", title: "Example Hood Markets names a CFO", hash: shared, ticker: "HOOD" });
  await Promise.all([
    ingestCandidate(again, item, { now: NOW, allowFixtures: false, source: one }),
    ingestCandidate(again, item, { now: NOW, allowFixtures: false, source: one }),
  ]);
  assertEquals(again.rawItems().length, 1);
  assertEquals(again.events().length, 1);
  assertEquals((await again.listEvidence(again.events()[0].id)).length, 1);
});

Deno.test("company universe attributes names and exact tickers without guessing", () => {
  const companies = buildCompanyUniverse([
    { ticker: "AAPL", name: "Apple Inc." },
    { ticker: "NVDA", name: "NVIDIA Corporation" },
    { ticker: "MSFT", name: "Microsoft Corporation" },
    { ticker: "APX", name: "Apex Holdings" },
    { ticker: "APEX", name: "Apex Inc." },
    { ticker: "ON", name: "ON Semiconductor Corporation" },
  ]);
  const ctx = { sourceTicker: null, sourceCompanyName: null, sourceCik: null, sourceType: "NEWS_PR", companies };
  const base = candidate({ sourceId: "s", externalId: "x", title: "placeholder" });
  const apple = attributeCandidate({ ...base, title: "Apple announces a buyback" }, ctx);
  assertEquals(apple.ticker, "AAPL");
  assertEquals(apple.status, "resolved");
  const nvda = attributeCandidate({ ...base, title: "NVIDIA unveils a new chip" }, ctx);
  assertEquals(nvda.ticker, "NVDA");
  const exact = attributeCandidate({ ...base, title: "AAPL reports earnings" }, ctx);
  assertEquals(exact.ticker, "AAPL");
  assertEquals(exact.note, "ticker_mention");
  const ambiguous = attributeCandidate({ ...base, title: "Apex announces a vague partnership" }, ctx);
  assertEquals(ambiguous.status, "unresolved");
  const multi = attributeCandidate({ ...base, title: "Apple and Microsoft announce a joint product" }, ctx);
  assertEquals(multi.status, "unresolved");
  const prose = attributeCandidate({ ...base, title: "ON Monday the desk met" }, ctx);
  assertEquals(prose.status, "unresolved");
  const inside = attributeCandidate({ ...base, title: "A pineapple recipe was published" }, ctx);
  assertEquals(inside.status, "unresolved");
});

Deno.test("due source selection rotates past the first 500 equal-priority sources", () => {
  const sources = Array.from({ length: 600 }, (_, index) => source({
    id: `id-${index}`,
    sourceKey: `src-${String(index).padStart(4, "0")}`,
    sourceType: "COMPANY_IR",
    url: "https://ir.example.test/feed",
    evidenceTier: "TIER_1_PRIMARY",
    priority: 10,
    pollIntervalSeconds: 0,
    enabled: true,
  }));
  const seen = new Set<string>();
  let now = NOW;
  for (let round = 0; round < 30 && seen.size < 600; round++) {
    const batch = selectDueSources(sources, now, 25);
    assertEquals(batch.length, 25);
    for (const row of batch) {
      seen.add(row.sourceKey);
      row.lastSuccessAt = new Date(now.getTime() + seen.size).toISOString();
    }
    now = new Date(now.getTime() + 1000);
  }
  assertEquals(seen.size, 600);
  assert(seen.has("src-0599"));
  const hidden = sources.slice(0, 500);
  assertEquals(selectDueSources(hidden, NOW, 25).some((row) => row.sourceKey === "src-0599"), false);
});

Deno.test("verification counts independent publishers, not feed rows", async () => {
  assertEquals(verifyEvidence([
    { evidenceTier: "TIER_1_PRIMARY", conflict: false, authorityKey: "company:hood" },
  ]), "VERIFIED_PRIMARY");
  assertEquals(verifyEvidence([
    { evidenceTier: "TIER_2_STRONG_SECONDARY", conflict: false, authorityKey: "reuters" },
    { evidenceTier: "TIER_2_STRONG_SECONDARY", conflict: false, authorityKey: "reuters" },
  ]), "REPORTED");
  assertEquals(verifyEvidence([
    { evidenceTier: "TIER_2_STRONG_SECONDARY", conflict: false, authorityKey: "reuters" },
    { evidenceTier: "TIER_2_STRONG_SECONDARY", conflict: false, authorityKey: "businesswire" },
  ]), "VERIFIED_MULTI_SOURCE");

  const store = createMemoryStore();
  const body = (guid: string) => `<?xml version="1.0"?><rss><channel><item><title>Example Hood Markets names a new chief financial officer</title><link>https://news.example.test/${guid}</link><guid>${guid}</guid><pubDate>Wed, 30 Sep 2026 15:00:00 GMT</pubDate><description>The company appointed a chief financial officer.</description></item></channel></rss>`;
  const wireA = source({ sourceKey: "wire-a", authorityKey: "reuters", sourceType: "NEWS_PR", url: "https://news.example.test/a", evidenceTier: "TIER_2_STRONG_SECONDARY", ticker: "HOOD" });
  const wireB = source({ sourceKey: "wire-b", authorityKey: "reuters", sourceType: "NEWS_PR", url: "https://news.example.test/b", evidenceTier: "TIER_2_STRONG_SECONDARY", ticker: "HOOD" });
  await store.saveSource(wireA);
  await store.saveSource(wireB);
  await runCollectorBot({
    bot: "news",
    adapter: newsPrAdapter,
    store,
    now: NOW,
    userAgent: "test",
    fetchImpl: (url) => Promise.resolve(new Response(body(String(url).endsWith("/a") ? "a" : "b"), { status: 200 })),
    batchLimit: 5,
  });
  assertEquals(store.events().length, 1);
  assertEquals(store.events()[0].verificationState, "REPORTED");
  const wireC = source({ sourceKey: "wire-c", authorityKey: "globenewswire", sourceType: "NEWS_PR", url: "https://news.example.test/c", evidenceTier: "TIER_2_STRONG_SECONDARY", ticker: "HOOD" });
  await store.saveSource(wireC);
  await runCollectorBot({
    bot: "news",
    adapter: newsPrAdapter,
    store,
    now: NOW,
    userAgent: "test",
    fetchImpl: () => Promise.resolve(new Response(body("c"), { status: 200 })),
    batchLimit: 5,
    allowlist: ["wire-c"],
  });
  assertEquals(store.events().length, 1);
  assertEquals(store.events()[0].verificationState, "VERIFIED_MULTI_SOURCE");
});

Deno.test("latest radar generation wins and event bars set the reference price", async () => {
  const latest = pickLatestRadarRows([
    { symbol: "AAPL", last_price: 10, provider_as_of: "2026-09-30T14:00:00.000Z", updated_at: "2026-09-30T16:00:00.000Z" },
    { symbol: "AAPL", last_price: 21, provider_as_of: "2026-09-30T15:00:00.000Z", updated_at: "2026-09-30T15:00:00.000Z" },
    { symbol: "MSFT", last_price: 400, provider_as_of: "2026-09-30T12:00:00.000Z", updated_at: "2026-09-30T12:00:00.000Z" },
  ]);
  assertEquals(latest.length, 2);
  const apple = latest.find((row) => row.symbol === "AAPL");
  assertEquals(apple?.last_price, 21);
  assertEquals(observationFromRadarRow(apple ?? {}).currentPrice, 21);
  assertEquals(observationFromRadarRow(apple ?? {}).referencePrice, null);

  const eventAt = "2026-09-30T14:30:00.000Z";
  assertEquals(eventReferenceInstant({
    announcementAt: eventAt,
    effectiveAt: "2026-09-30T14:00:00.000Z",
    scheduledStartAt: "2026-09-30T13:00:00.000Z",
    firstDiscoveredAt: "2026-09-30T12:00:00.000Z",
  }), eventAt);
  assertEquals(eventReferenceInstant({
    announcementAt: null,
    effectiveAt: "2026-09-30T14:00:00.000Z",
    scheduledStartAt: "2026-09-30T13:00:00.000Z",
    firstDiscoveredAt: "2026-09-30T12:00:00.000Z",
  }), "2026-09-30T14:00:00.000Z");
  const sampleMs = Date.parse(eventAt);
  assertEquals(referencePriceAtOrBefore(priceBarsFromPolygonAggs([
    { t: sampleMs - 120_000, c: 90 },
    { t: sampleMs - 60_000, c: 100 },
    { t: sampleMs, c: 130 },
  ]), sampleMs), 100);
  assertEquals(referencePriceAtOrBefore([], sampleMs), null);

  const eventMs = NOW.getTime();
  const bars = priceBarsFromPolygonAggs([
    { t: eventMs - 120_000, c: 90 },
    { t: eventMs - 60_000, c: 100 },
    { t: eventMs, c: 130 },
  ]);
  assertEquals(referencePriceAtOrBefore(bars, eventMs), 100);
  assertEquals(referencePriceAtOrBefore([], eventMs), null);

  const store = createMemoryStore();
  const src = source({
    id: "rx",
    sourceType: "NEWS_PR",
    url: "https://news.example.test/rx",
    evidenceTier: "TIER_2_STRONG_SECONDARY",
    authorityKey: "reuters",
  });
  await ingestCandidate(
    store,
    candidate({ sourceId: src.id, externalId: "rx", title: "Example Hood Markets names a CFO", hash: "rx-hash", ticker: "HOOD" }),
    { now: NOW, allowFixtures: false, source: src },
  );
  const observation = {
    symbol: "HOOD",
    observedAt: NOW.toISOString(),
    freshness: "fresh" as const,
    referencePrice: null,
    currentPrice: 110,
    intradayHigh: 112,
    intradayLow: 98,
    volume: 50_000,
    dollarVolume: null,
    rvol5m: 4,
    timeAdjustedRvol: null,
    volumeVelocity: 12,
    volumeAcceleration: null,
    vwap: 105,
    vwapSide: "above" as const,
    hodDistancePct: null,
    floatTurnover: null,
  };
  await runReactionBot({
    store,
    now: NOW,
    batchLimit: 5,
    loadObservation: async () => observation,
    loadReferenceBars: async () => bars,
  });
  assertEquals(store.reactions()[0].referencePrice, 100);
  assertEquals(store.reactions()[0].percentMove, 10);
  assertEquals(store.reactions()[0].rvol5m, 4);
  assertEquals(store.reactions()[0].volumeVelocity, 12);

  await runReactionBot({
    store,
    now: NOW,
    batchLimit: 5,
    loadObservation: async () => ({ ...observation, referencePrice: null, rvol5m: null, volumeVelocity: null, vwap: null, currentPrice: 120 }),
    loadReferenceBars: async () => [],
  });
  assertEquals(store.reactions()[0].referencePrice, 100);
  assertEquals(store.reactions()[0].currentPrice, 120);
  assertEquals(store.reactions()[0].rvol5m, 4);
  assertEquals(store.reactions()[0].volumeVelocity, 12);
  assertEquals(store.reactions()[0].vwap, 105);

  const empty = createMemoryStore();
  await ingestCandidate(
    empty,
    candidate({ sourceId: src.id, externalId: "rx2", title: "Example Hood Markets names a CFO", hash: "rx-hash-2", ticker: "HOOD" }),
    { now: NOW, allowFixtures: false, source: src },
  );
  await runReactionBot({
    store: empty,
    now: NOW,
    batchLimit: 5,
    loadObservation: async () => ({ ...observation, rvol5m: 2, volumeVelocity: 3, vwap: 101 }),
    loadReferenceBars: async () => [],
  });
  assertEquals(empty.reactions()[0].referencePrice, null);
  assertEquals(empty.reactions()[0].percentMove, null);
  assertEquals(empty.reactions()[0].volume, 50_000);
  assertEquals(empty.reactions()[0].rvol5m, 2);

  await runReactionBot({
    store: empty,
    now: new Date(NOW.getTime() + 2 * 60 * 60 * 1000),
    batchLimit: 5,
    loadObservation: async () => ({
      ...observation,
      observedAt: new Date(NOW.getTime() - 60 * 60 * 1000).toISOString(),
      freshness: "stale",
      currentPrice: 1,
      volume: 1,
      rvol5m: null,
    }),
  });
  assertEquals(empty.reactions()[0].availability, "available");
  assertEquals(empty.reactions()[0].volume, 50_000);
  assertEquals(empty.reactions()[0].currentPrice, 110);
});

Deno.test("migration keeps the two-layer gate and does not alter catalyst_events", async () => {
  const sql = await Deno.readTextFile(new URL("../../../migrations/20260930120000_catalyst_intelligence_foundation_v1.sql", import.meta.url));
  const storeSrc = await Deno.readTextFile(new URL("./supabase-store.ts", import.meta.url));
  assert(sql.includes("authority_key"));
  assert(sql.includes("catalyst_intel_due_sources"));
  assert(sql.includes("last_success_at ASC NULLS FIRST"));
  assert(sql.includes("catalyst_intel_latest_radar"));
  assert(sql.includes("DISTINCT ON (c.symbol)"));
  assert(sql.includes("CATALYST_INTEL_SEC_ENABLED=true is NOT sufficient"));
  assert(sql.includes("GRANT EXECUTE ON FUNCTION public.catalyst_intel_due_sources"));
  assert(sql.includes("TO service_role"));
  assert(!/ALTER TABLE public\.catalyst_events/i.test(sql));
  assert(!sql.includes("GRANT SELECT ON public.catalyst_intel_events TO anon"));
  assert(!storeSrc.includes(".limit(500)"));
  assert(storeSrc.includes("catalyst_intel_due_sources"));
  assert(storeSrc.includes("mapDatabaseError"));
});
