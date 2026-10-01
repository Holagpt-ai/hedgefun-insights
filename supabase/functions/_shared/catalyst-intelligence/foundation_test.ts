import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { companyEventsAdapter } from "./adapters/company-events.ts";
import { companyIrAdapter } from "./adapters/company-ir.ts";
import { newsPrAdapter } from "./adapters/news-pr.ts";
import { secFilingsAdapter } from "./adapters/sec.ts";
import { attributeCandidate } from "./attribution.ts";
import { findDuplicateEvent } from "./dedupe.ts";
import { toDistributionRecord } from "./distribution.ts";
import { parseHtmlArticles, parseIcsEvents, parseJsonLdEvents, parseRssOrAtom } from "./feeds.ts";
import { handleCatalystIntelRequest } from "./http.ts";
import { canTransition, transitionLifecycle } from "./lifecycle.ts";
import { assessMarketObservation, observationFromRadarRow } from "./market-reaction.ts";
import { contentHash, toUtcIso } from "./normalize.ts";
import { createMemoryStore } from "./persistence.ts";
import { runCollectorBot, runReactionBot } from "./run-bot.ts";
import { assertPublicHttpsUrl, safeFetch, SourceFetchError } from "./source-fetch.ts";
import { aiEnrichmentEnabled } from "./ai-enrichment.ts";
import { FIXTURE_MARKER, type CanonicalEvent, type SourceRecord } from "./types.ts";

const NOW = new Date("2026-09-30T15:00:00.000Z");
const SUMMIT = "2026-10-08T18:00:00.000Z";

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
    feedFormat: partial.feedFormat ?? "auto",
    pollIntervalSeconds: partial.pollIntervalSeconds ?? 0,
    enabled: partial.enabled ?? true,
    priority: partial.priority ?? 10,
    evidenceTier: partial.evidenceTier,
    authorityKey: partial.authorityKey ?? partial.sourceKey ?? partial.sourceType.toLowerCase(),
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

function jsonResponse(body: string, status = 200, headers: HeadersInit = {}): Response {
  return new Response(body, { status, headers });
}

const HOOD_EVENT_HTML = `<!doctype html><html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Event","name":"Example Hood Markets to host Active Trader Summit","startDate":"${SUMMIT}","endDate":"2026-10-08T20:00:00Z","description":"The summit will include meaningful active-trader product and strategy updates.","url":"https://ir.example.test/events/active-trader-summit"}
</script></head><body></body></html>`;

const HOOD_ANNOUNCEMENT = `<?xml version="1.0"?><rss version="2.0"><channel><item>
<title>Example Hood Markets details active-trader product updates for the summit</title>
<link>https://ir.example.test/news/summit-product-updates</link>
<guid>hood-summit-update-1</guid>
<pubDate>Thu, 08 Oct 2026 17:50:00 GMT</pubDate>
<description>The company described material product updates for active traders.</description>
</item></channel></rss>`;

Deno.test("content hash is stable and timestamps are not invented", async () => {
  const first = await contentHash("  Active   Trader Summit ", "Updates");
  const second = await contentHash("active trader summit", "updates");
  assertEquals(first, second);
  assertEquals(toUtcIso("2026-10-08T14:00:00-04:00"), "2026-10-08T18:00:00.000Z");
  assertEquals(toUtcIso(""), null);
  assertEquals(toUtcIso("next week"), null);
});

Deno.test("adapter rejects a malformed item and keeps a valid one", async () => {
  const src = source({ sourceType: "COMPANY_IR", url: "https://ir.example.test/rss", evidenceTier: "TIER_1_PRIMARY", ticker: "HOOD" });
  const ctx = {
    now: NOW,
    source: src,
    userAgent: "test",
    fetchImpl: fetch,
    itemLimit: 10,
    allowFixtures: true,
    fetchState: { unchanged: false, etag: null, lastModified: null, contentHash: null, checkpoint: null },
  };
  const bad = await companyIrAdapter.normalize({
    sourceId: src.id,
    sourceType: "COMPANY_IR",
    externalId: null,
    canonicalUrl: null,
    publishedAt: null,
    discoveredAt: NOW.toISOString(),
    title: "   ",
    summary: null,
    contentHash: "abc",
    metadata: {},
  }, ctx);
  assertEquals(bad, null);
});

Deno.test("SEC filing maps CIK, keeps form 4 modest, and accession is idempotent", async () => {
  const store = createMemoryStore();
  const src = source({
    sourceType: "SEC_FILINGS",
    sourceKey: "sec-test",
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&output=atom",
    evidenceTier: "TIER_1_PRIMARY",
    feedFormat: "sec_atom",
  });
  await store.saveSource(src);
  const xml = `<?xml version="1.0"?><feed><entry>
<title>8-K - EXAMPLE HOOD MARKETS (0000000001) (Issuer)</title>
<link href="https://www.sec.gov/Archives/edgar/data/1/0000000001-26-000001-index.htm"/>
<id>urn:tag:sec.gov,2008:accession-number=0000000001-26-000001</id>
<updated>2026-09-30T14:00:00-04:00</updated>
<summary>Filed: 2026-09-30 AccNo: 0000000001-26-000001 Item 1.01</summary>
<category term="8-K"/>
</entry><entry>
<title>4 - EXAMPLE HOOD MARKETS (0000000001) (Issuer)</title>
<link href="https://www.sec.gov/Archives/edgar/data/1/0000000001-26-000002-index.htm"/>
<id>urn:tag:sec.gov,2008:accession-number=0000000001-26-000002</id>
<updated>2026-09-30T14:05:00-04:00</updated>
<summary>Filed: 2026-09-30 AccNo: 0000000001-26-000002</summary>
<category term="4"/>
</entry><entry>
<title>8-K - UNMAPPED CO (0000000099) (Issuer)</title>
<link href="https://www.sec.gov/Archives/edgar/data/99/0000000099-26-000001-index.htm"/>
<id>urn:tag:sec.gov,2008:accession-number=0000000099-26-000001</id>
<updated>2026-09-30T14:06:00-04:00</updated>
<summary>Filed: 2026-09-30 AccNo: 0000000099-26-000001</summary>
<category term="8-K"/>
</entry></feed>`;
  let calls = 0;
  const run = () => runCollectorBot({
    bot: "sec",
    adapter: secFilingsAdapter,
    store,
    now: NOW,
    userAgent: "Stocksist test@example.com",
    fetchImpl: () => {
      calls += 1;
      const body = calls === 1 ? xml : xml.replace("</feed>", "<!-- refresh -->\n</feed>");
      return Promise.resolve(jsonResponse(body));
    },
    batchLimit: 5,
    cikMap: new Map([["0000000001", ["HOOD"]]]),
  });
  const first = await run();
  assertEquals(first.eventsCreated, 2);
  const events = store.events();
  const eight = events.find((event) => event.eventSubtype === "8-K");
  const form4 = events.find((event) => event.eventSubtype === "form-4");
  assert(eight);
  assert(form4);
  assertEquals(eight.verificationState, "VERIFIED_PRIMARY");
  assert(form4.materiality <= 40);
  assertEquals(store.rawItems().length, 3);
  const second = await run();
  assertEquals(second.eventsCreated, 0);
  assertEquals(second.duplicates, 2);
  assertEquals(store.events().length, 2);
  assertEquals(store.rawItems().length, 3);
});

Deno.test("IR parses RSS and HTML and skips an unchanged page", async () => {
  const rss = `<?xml version="1.0"?><rss><channel><item><title>Example Hood Markets files an 8-K</title><link>https://ir.example.test/a</link><guid>a</guid><pubDate>Wed, 30 Sep 2026 14:00:00 GMT</pubDate><description>Form 8-K filed.</description></item></channel></rss>`;
  assertEquals(parseRssOrAtom(rss)[0].title, "Example Hood Markets files an 8-K");
  const html = `<article><h2><a href="https://ir.example.test/b">Leadership update</a></h2><time datetime="2026-09-30T14:00:00Z"></time><p>The board appointed a chief financial officer.</p></article>`;
  assertEquals(parseHtmlArticles(html)[0].url, "https://ir.example.test/b");
  const store = createMemoryStore();
  const src = source({
    sourceType: "COMPANY_IR",
    url: "https://ir.example.test/news",
    evidenceTier: "TIER_1_PRIMARY",
    ticker: "HOOD",
    companyName: "Example Hood Markets",
    feedFormat: "html",
  });
  await store.saveSource(src);
  const fetchImpl = () => Promise.resolve(jsonResponse(html, 200, { etag: "v1" }));
  await runCollectorBot({ bot: "ir", adapter: companyIrAdapter, store, now: NOW, userAgent: "test", fetchImpl, batchLimit: 5 });
  assertEquals(store.events().length, 1);
  await runCollectorBot({ bot: "ir", adapter: companyIrAdapter, store, now: new Date(NOW.getTime() + 1000), userAgent: "test", fetchImpl, batchLimit: 5 });
  assertEquals(store.events().length, 1);
  assertEquals(store.rawItems().length, 1);
});

Deno.test("events parse JSON-LD and ICS without inventing a missing date", async () => {
  const html = `<script type="application/ld+json">{"@type":"Event","name":"Capital Markets Day","startDate":"2026-11-02T15:00:00Z","url":"https://ir.example.test/cmd"}</script>`;
  const parsed = parseJsonLdEvents(html);
  assertEquals(parsed[0].scheduledStart, "2026-11-02T15:00:00.000Z");
  const ics = `BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:evt-1\nSUMMARY:Investor Day\nDTSTART:20261102T150000Z\nURL:https://ir.example.test/id\nEND:VEVENT\nEND:VCALENDAR`;
  assertEquals(parseIcsEvents(ics)[0].scheduledStart, "2026-11-02T15:00:00.000Z");
  const missing = `BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:evt-2\nSUMMARY:Undated webinar\nDESCRIPTION:No date was provided.\nEND:VEVENT\nEND:VCALENDAR`;
  const undated = parseIcsEvents(missing)[0];
  assertEquals(undated.scheduledStart, null);
  assertEquals(undated.scheduledDate, null);
  const dateOnly = `BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:evt-3\nSUMMARY:Strategy presentation\nDTSTART;VALUE=DATE:20261102\nEND:VEVENT\nEND:VCALENDAR`;
  const dated = parseIcsEvents(dateOnly)[0];
  assertEquals(dated.scheduledDate, "2026-11-02");
  assertEquals(dated.scheduledStart, null);
});

Deno.test("news syndication merges and a different company event stays separate", async () => {
  const store = createMemoryStore();
  const body = (guid: string) => `<?xml version="1.0"?><rss><channel><item><title>Example Hood Markets names a new chief financial officer</title><link>https://news.example.test/${guid}</link><guid>${guid}</guid><pubDate>Wed, 30 Sep 2026 15:00:00 GMT</pubDate><description>The company appointed a chief financial officer.</description></item></channel></rss>`;
  const wireA = source({ sourceKey: "wire-a", authorityKey: "reuters", sourceType: "NEWS_PR", url: "https://news.example.test/a", evidenceTier: "TIER_2_STRONG_SECONDARY", ticker: "HOOD", feedFormat: "rss" });
  const wireB = source({ sourceKey: "wire-b", authorityKey: "businesswire", sourceType: "NEWS_PR", url: "https://news.example.test/b", evidenceTier: "TIER_2_STRONG_SECONDARY", ticker: "HOOD", feedFormat: "rss" });
  await store.saveSource(wireA);
  await store.saveSource(wireB);
  const fetchImpl = (url: string | URL | Request) => {
    const href = String(url);
    return Promise.resolve(jsonResponse(body(href.endsWith("/a") ? "a" : "b")));
  };
  await runCollectorBot({ bot: "news", adapter: newsPrAdapter, store, now: NOW, userAgent: "test", fetchImpl, batchLimit: 5 });
  assertEquals(store.events().length, 1);
  assertEquals(store.events()[0].verificationState, "VERIFIED_MULTI_SOURCE");
  assertEquals(store.events()[0].eventType, "EXECUTIVE_CHANGE");

  const earnings = source({ sourceKey: "earnings", sourceType: "NEWS_PR", url: "https://news.example.test/earn", evidenceTier: "TIER_2_STRONG_SECONDARY", ticker: "HOOD", feedFormat: "rss" });
  await store.saveSource(earnings);
  const earnXml = `<?xml version="1.0"?><rss><channel><item><title>Example Hood Markets reports quarterly earnings results</title><link>https://news.example.test/earn1</link><guid>earn1</guid><pubDate>Wed, 30 Sep 2026 15:05:00 GMT</pubDate><description>Quarterly earnings results were reported.</description></item></channel></rss>`;
  await runCollectorBot({
    bot: "news",
    adapter: newsPrAdapter,
    store,
    now: NOW,
    userAgent: "test",
    fetchImpl: () => Promise.resolve(jsonResponse(earnXml)),
    batchLimit: 5,
    allowlist: ["earnings"],
  });
  assertEquals(store.events().length, 2);
});

Deno.test("dedupe does not merge same company and same day alone", () => {
  const left = eventStub("e1", "HOOD product summit", "PRODUCT_STRATEGY_EVENT");
  const right = eventStub("e2", "HOOD dividend declaration", "CORPORATE_ACTION");
  const match = findDuplicateEvent({
    title: "HOOD dividend declaration",
    eventType: "CORPORATE_ACTION",
    ticker: "HOOD",
    scheduledStart: null,
    publishedAt: "2026-09-30T15:00:00.000Z",
    canonicalUrl: "https://news.example.test/div",
    contentHash: "different",
  }, [left], new Map([[left.id, []]]));
  assertEquals(match, null);
  assertEquals(right.id, "e2");
});

Deno.test("attribution prefers direct, CIK, ticker, alias, and leaves ambiguity unresolved", () => {
  const base = {
    raw: { sourceId: "s", sourceType: "NEWS_PR" as const, externalId: null, canonicalUrl: null, publishedAt: null, discoveredAt: NOW.toISOString(), title: "t", summary: null, contentHash: "h", metadata: {} },
    title: "Acme Robotics expands capacity",
    summary: null,
    suggestedType: null,
    subtype: null,
    scheduledStart: null,
    scheduledEnd: null,
    scheduledDate: null,
    isAnnouncement: true,
    evidenceTier: "TIER_2_STRONG_SECONDARY" as const,
    metadata: {},
  };
  assertEquals(attributeCandidate(base, { sourceTicker: "HOOD", sourceCompanyName: "Example", sourceCik: null, sourceType: "COMPANY_IR" }).note, "direct_source_mapping");
  assertEquals(attributeCandidate({ ...base, metadata: { cik: "0000000001" } }, {
    sourceTicker: null, sourceCompanyName: null, sourceCik: null, sourceType: "SEC_FILINGS", cikMap: new Map([["0000000001", ["HOOD"]]]),
  }).note, "cik_mapping");
  assertEquals(attributeCandidate({ ...base, metadata: { ticker: "MSFT" } }, {
    sourceTicker: null, sourceCompanyName: null, sourceCik: null, sourceType: "NEWS_PR",
  }).note, "exact_ticker_metadata");
  const alias = attributeCandidate(base, {
    sourceTicker: null, sourceCompanyName: null, sourceCik: null, sourceType: "NEWS_PR",
    companies: [{ ticker: "ACME", name: "Acme Robotics" }],
  });
  assertEquals(alias.note, "alias_match");
  assertEquals(alias.ticker, "ACME");
  const ambiguous = attributeCandidate({ ...base, title: "Acme Robotics and Acme Logistics signed nothing together" }, {
    sourceTicker: null, sourceCompanyName: null, sourceCik: null, sourceType: "NEWS_PR",
    companies: [{ ticker: "ACME", name: "Acme Robotics" }, { ticker: "LOGX", name: "Acme Logistics" }],
  });
  assertEquals(ambiguous.status, "unresolved");
});

Deno.test("verification follows evidence and price does not verify a weak item", async () => {
  const store = createMemoryStore();
  const src = source({
    sourceType: "NEWS_PR",
    url: "https://rumor.example.test/feed",
    evidenceTier: "TIER_3_DISCOVERY",
    ticker: "HOOD",
    feedFormat: "rss",
  });
  await store.saveSource(src);
  const xml = `<?xml version="1.0"?><rss><channel><item><title>Example Hood Markets mentioned in a market recap</title><link>https://rumor.example.test/1</link><guid>r1</guid><pubDate>Wed, 30 Sep 2026 15:00:00 GMT</pubDate><description>A recap mentioned the shares.</description></item></channel></rss>`;
  await runCollectorBot({ bot: "news", adapter: newsPrAdapter, store, now: NOW, userAgent: "test", fetchImpl: () => Promise.resolve(jsonResponse(xml)), batchLimit: 2 });
  const before = store.events()[0];
  assertEquals(before.verificationState, "UNVERIFIED");
  await runReactionBot({
    store,
    now: NOW,
    batchLimit: 5,
    loadObservation: async () => ({
      symbol: "HOOD",
      observedAt: NOW.toISOString(),
      freshness: "fresh",
      referencePrice: 10,
      currentPrice: 14,
      intradayHigh: 14.2,
      intradayLow: 9.8,
      volume: null,
      dollarVolume: null,
      rvol5m: 8,
      timeAdjustedRvol: null,
      volumeVelocity: 1200,
      volumeAcceleration: 80,
      vwap: null,
      vwapSide: null,
      hodDistancePct: null,
      floatTurnover: null,
    }),
  });
  const after = store.events()[0];
  assertEquals(after.verificationState, "UNVERIFIED");
  assert(after.reactionScore != null && after.reactionScore > 0);
});

Deno.test("lifecycle allows the announcement shortcut and blocks a backward move", () => {
  assertEquals(transitionLifecycle("discovered", "announced"), "announced");
  assertEquals(transitionLifecycle("resolved", "discovered"), "resolved");
  assertEquals(canTransition("resolved", "discovered"), false);
  assertEquals(canTransition("scheduled", "announced"), true);
});

Deno.test("future catalyst ranks without a price reaction", async () => {
  const store = await ingestHood(NOW);
  const event = store.events()[0];
  assertEquals(event.lifecycle, "scheduled");
  assertEquals(event.catalystState, "UPCOMING");
  assertEquals(event.reactionScore, null);
  assert(event.priorityScore >= 70);
  assertEquals(event.distributionStatus, "observation");
  const view = toDistributionRecord(event, await store.listTickers(event.id), await store.listEvidence(event.id), null);
  assertEquals(view.ticker, "HOOD");
  assertEquals(view.distributionStatus, "observation");
});

Deno.test("market reaction keeps missing metrics null and rejects stale data", async () => {
  const fresh = assessMarketObservation({
    symbol: "HOOD",
    observedAt: NOW.toISOString(),
    freshness: "fresh",
    referencePrice: 20,
    currentPrice: 21,
    intradayHigh: 21.5,
    intradayLow: 19.5,
    volume: 1_000_000,
    dollarVolume: null,
    rvol5m: null,
    timeAdjustedRvol: 1.4,
    volumeVelocity: null,
    volumeAcceleration: null,
    vwap: 20.4,
    vwapSide: null,
    hodDistancePct: 2,
    floatTurnover: null,
  }, NOW);
  assertEquals(fresh.availability, "available");
  assertEquals(fresh.volume, 1_000_000);
  assertEquals(fresh.rvol5m, null);
  assertEquals(fresh.floatTurnover, null);
  assertEquals(fresh.dollarVolume, null);
  assertEquals(fresh.vwapSide, "above");
  const stale = assessMarketObservation({
    symbol: "HOOD",
    observedAt: new Date(NOW.getTime() - 60 * 60 * 1000).toISOString(),
    freshness: "fresh",
    referencePrice: 20,
    currentPrice: 30,
    intradayHigh: null,
    intradayLow: null,
    volume: 5,
    dollarVolume: null,
    rvol5m: 9,
    timeAdjustedRvol: null,
    volumeVelocity: null,
    volumeAcceleration: null,
    vwap: null,
    vwapSide: null,
    hodDistancePct: null,
    floatTurnover: null,
  }, NOW);
  assertEquals(stale.availability, "stale");
  assertEquals(stale.volume, null);
  assertEquals(stale.currentPrice, null);
  const radar = observationFromRadarRow({
    symbol: "hood",
    last_price: 21,
    session_volume: 10,
    rvol_5m: 2.5,
    dollar_volume_60s: 99,
    provider_as_of: NOW.toISOString(),
    freshness_class: "fresh",
  });
  assertEquals(radar.rvol5m, 2.5);
  assertEquals(radar.dollarVolume, null);
  assertEquals(radar.floatTurnover, null);
});

Deno.test("repeated bot run and one failed source do not duplicate or abort the batch", async () => {
  const store = createMemoryStore();
  const good = source({ sourceKey: "good", sourceType: "COMPANY_IR", url: "https://ir.example.test/good", evidenceTier: "TIER_1_PRIMARY", ticker: "HOOD", feedFormat: "rss" });
  const bad = source({ sourceKey: "bad", sourceType: "COMPANY_IR", url: "https://ir.example.test/bad", evidenceTier: "TIER_1_PRIMARY", ticker: "ZZZZ", feedFormat: "rss", priority: 1 });
  await store.saveSource(good);
  await store.saveSource(bad);
  const xml = `<?xml version="1.0"?><rss><channel><item><title>Example Hood Markets files an 8-K</title><link>https://ir.example.test/filing</link><guid>filing-1</guid><pubDate>Wed, 30 Sep 2026 14:00:00 GMT</pubDate><description>Form 8-K filed with the SEC.</description></item></channel></rss>`;
  const fetchImpl = (url: string | URL | Request) => {
    if (String(url).includes("/bad")) return Promise.reject(Object.assign(new Error("down"), { name: "Error" }));
    return Promise.resolve(jsonResponse(xml));
  };
  const first = await runCollectorBot({ bot: "ir", adapter: companyIrAdapter, store, now: NOW, userAgent: "test", fetchImpl, batchLimit: 5 });
  assertEquals(first.status, "completed");
  assertEquals(first.sourcesFailed, 1);
  assertEquals(first.sourcesSuccessful, 1);
  assertEquals(first.eventsCreated, 1);
  const second = await runCollectorBot({ bot: "ir", adapter: companyIrAdapter, store, now: new Date(NOW.getTime() + 5000), userAgent: "test", fetchImpl, batchLimit: 5 });
  assertEquals(second.eventsCreated, 0);
  assertEquals(store.events().length, 1);
  assert(second.duplicates >= 1 || store.rawItems().filter((row) => row.sourceId === good.id).length === 1);
});

Deno.test("unsafe urls, oversized bodies, and timeouts are rejected", async () => {
  const expectUnsafe = (url: string) => assertRejects(async () => {
    assertPublicHttpsUrl(url);
  }, SourceFetchError);
  await expectUnsafe("http://news.example.test/a");
  await expectUnsafe("file:///etc/passwd");
  await expectUnsafe("https://127.0.0.1/admin");
  await expectUnsafe("https://192.168.1.8/a");
  await expectUnsafe("https://10.0.0.4/a");
  await expectUnsafe("https://169.254.169.254/latest");
  let called = false;
  await assertRejects(() => safeFetch({
    url: "https://127.0.0.1/secret",
    userAgent: "test",
    fetchImpl: () => {
      called = true;
      return Promise.resolve(jsonResponse("no"));
    },
  }), SourceFetchError);
  assertEquals(called, false);
  await assertRejects(() => safeFetch({
    url: "https://news.example.test/big",
    userAgent: "test",
    maxBytes: 16,
    fetchImpl: () => Promise.resolve(jsonResponse("x".repeat(100))),
  }), SourceFetchError);
  await assertRejects(() => safeFetch({
    url: "https://news.example.test/slow",
    userAgent: "test",
    fetchImpl: () => Promise.reject(Object.assign(new Error("slow"), { name: "TimeoutError" })),
  }), SourceFetchError);
  await assertRejects(() => safeFetch({
    url: "https://public.example.test/start",
    userAgent: "test",
    fetchImpl: () => Promise.resolve(new Response(null, { status: 302, headers: { location: "http://127.0.0.1/internal" } })),
  }), SourceFetchError);
});

Deno.test("AI enrichment stays off unless the flag is explicitly true", () => {
  assertEquals(aiEnrichmentEnabled(() => undefined), false);
  assertEquals(aiEnrichmentEnabled((key) => key.endsWith("AI_ENRICHMENT_ENABLED") ? "false" : undefined), false);
  assertEquals(aiEnrichmentEnabled((key) => key.endsWith("AI_ENRICHMENT_ENABLED") ? "true" : undefined), true);
});

Deno.test("handler disables bots, rejects arbitrary urls, and stays fixture-free", async () => {
  const store = createMemoryStore();
  const disabled = await handleCatalystIntelRequest(new Request("https://example.test/bot", {
    method: "POST",
    headers: { Authorization: "Bearer secret" },
  }), {
    bot: "news",
    env: (key) => key === "SYNC_SECRET" ? "secret" : key === "CATALYST_INTEL_NEWS_ENABLED" ? "false" : undefined,
    store,
  });
  assertEquals(disabled.status, 200);
  assertEquals((await disabled.json()).status, "disabled");
  const denied = await handleCatalystIntelRequest(new Request("https://example.test/bot", { method: "POST" }), {
    bot: "news",
    env: (key) => key === "SYNC_SECRET" ? "secret" : undefined,
    store,
  });
  assertEquals(denied.status, 403);
  const unsafe = await handleCatalystIntelRequest(new Request("https://example.test/bot", {
    method: "POST",
    headers: { Authorization: "Bearer secret" },
    body: JSON.stringify({ url: "https://evil.example/feed" }),
  }), {
    bot: "news",
    env: (key) => key === "SYNC_SECRET" ? "secret" : key === "CATALYST_INTEL_NEWS_ENABLED" ? "true" : undefined,
    store,
  });
  assertEquals(unsafe.status, 400);
});

Deno.test("hood fixture enriches one event through announcement and reaction", async () => {
  const store = await ingestHood(NOW);
  assertEquals(store.events().length, 1);
  const created = store.events()[0];
  assertEquals(created.lifecycle, "scheduled");
  assertEquals(created.scheduledStartAt, SUMMIT);
  assertEquals(created.eventType, "PRODUCT_STRATEGY_EVENT");

  const announcement = source({
    sourceKey: "hood-ir",
    sourceType: "COMPANY_IR",
    url: "https://ir.example.test/rss",
    evidenceTier: "TIER_1_PRIMARY",
    ticker: "HOOD",
    companyName: "Example Hood Markets",
    feedFormat: "rss",
    metadata: { [FIXTURE_MARKER]: true },
  });
  await store.saveSource(announcement);
  const announcedAt = new Date("2026-10-08T17:50:00.000Z");
  await runCollectorBot({
    bot: "ir",
    adapter: companyIrAdapter,
    store,
    now: announcedAt,
    userAgent: "test",
    fetchImpl: () => Promise.resolve(jsonResponse(HOOD_ANNOUNCEMENT)),
    batchLimit: 5,
    allowFixtures: true,
    allowlist: ["hood-ir"],
  });
  assertEquals(store.events().length, 1);
  assertEquals(store.events()[0].id, created.id);
  assertEquals(store.events()[0].lifecycle, "announced");
  assert(store.events()[0].announcementSummary);

  const reactionNow = new Date("2026-10-08T18:05:00.000Z");
  await runReactionBot({
    store,
    now: reactionNow,
    batchLimit: 5,
    loadObservation: async () => ({
      symbol: "HOOD",
      observedAt: reactionNow.toISOString(),
      freshness: "fresh",
      referencePrice: 40,
      currentPrice: 44,
      intradayHigh: 45,
      intradayLow: 39,
      volume: 8_000_000,
      dollarVolume: 352_000_000,
      rvol5m: 3.2,
      timeAdjustedRvol: 2.8,
      volumeVelocity: 24000,
      volumeAcceleration: 45,
      vwap: 42,
      vwapSide: "above",
      hodDistancePct: 1.2,
      floatTurnover: 0.08,
    }),
  });
  const finalEvent = store.events()[0];
  assertEquals(store.events().length, 1);
  assertEquals(finalEvent.id, created.id);
  assertEquals(finalEvent.lifecycle, "reacting");
  const reaction = store.reactions()[0];
  assertEquals(reaction.eventId, created.id);
  assertEquals(reaction.availability, "available");
  assertEquals(reaction.rvol5m, 3.2);
  assertEquals(reaction.volume, 8_000_000);
  assert(finalEvent.reactionScore != null);

  await runReactionBot({
    store,
    now: new Date(reactionNow.getTime() + 2 * 60 * 60 * 1000),
    batchLimit: 5,
    loadObservation: async () => ({
      symbol: "HOOD",
      observedAt: new Date(reactionNow.getTime() - 60 * 60 * 1000).toISOString(),
      freshness: "stale",
      referencePrice: 1,
      currentPrice: 2,
      intradayHigh: null,
      intradayLow: null,
      volume: 0,
      dollarVolume: null,
      rvol5m: null,
      timeAdjustedRvol: null,
      volumeVelocity: null,
      volumeAcceleration: null,
      vwap: null,
      vwapSide: null,
      hodDistancePct: null,
      floatTurnover: null,
    }),
  });
  assertEquals(store.reactions()[0].availability, "available");
  assertEquals(store.reactions()[0].volume, 8_000_000);
});

async function ingestHood(now: Date) {
  const store = createMemoryStore();
  const events = source({
    sourceKey: "hood-events",
    sourceType: "COMPANY_EVENTS",
    url: "https://ir.example.test/events",
    evidenceTier: "TIER_1_PRIMARY",
    ticker: "HOOD",
    companyName: "Example Hood Markets",
    feedFormat: "html",
    metadata: { [FIXTURE_MARKER]: true },
  });
  await store.saveSource(events);
  await runCollectorBot({
    bot: "events",
    adapter: companyEventsAdapter,
    store,
    now,
    userAgent: "test",
    fetchImpl: () => Promise.resolve(jsonResponse(HOOD_EVENT_HTML)),
    batchLimit: 5,
    allowFixtures: true,
  });
  return store;
}

function eventStub(id: string, title: string, eventType: CanonicalEvent["eventType"]): CanonicalEvent {
  return {
    id,
    canonicalKey: id,
    title,
    summary: null,
    announcementSummary: null,
    eventType,
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
    timingBucket: "immediate",
    verificationState: "REPORTED",
    evidenceConfidence: 55,
    materiality: 40,
    timingUrgency: 40,
    reactionScore: null,
    priorityScore: 40,
    attributionConfidence: 0.6,
    distributionStatus: "observation",
    lifecycleLog: [],
    scoreComponents: {},
  };
}
