import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { secFilingsAdapter } from "./adapters/sec.ts";
import { MAX_ITEMS_PER_SOURCE } from "./config.ts";
import {
  buildSecIntelCheckpoint,
  discoverSecFilingsPages,
  hashPageText,
  planSecIntelIngestBatch,
  SecIntelPendingGapError,
} from "./sec-intel-discovery.ts";
import { buildLatestFilingsAtomUrl } from "../sec-edgar/ingest.ts";
import {
  applySecFetchMetadataToSource,
  checkpointMetadataRecord,
  readSecIntelCheckpoint,
} from "./sec-intel-metadata.ts";
import { readSecIntelContinuation } from "./sec-intel-continuation.ts";
import { createMemoryStore } from "./persistence.ts";
import { runCollectorBot } from "./run-bot.ts";
import type { SourceRecord } from "./types.ts";
import { SEC_EDGAR_STREAM_KEY } from "../sec-edgar/checkpoint.ts";

const ATOM_URL = "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&owner=exclude&count=100&start=0&output=atom";

function atomEntry(i: number): string {
  const acc = `0000000001-26-${String(i).padStart(6, "0")}`;
  return `<entry>
<title>8-K - EXAMPLE CO ${i} (0000000001) (Issuer)</title>
<link href="https://www.sec.gov/Archives/edgar/data/1/${acc.replace(/-/g, "")}-index.htm"/>
<id>urn:tag:sec.gov,2008:accession-number=${acc}</id>
<updated>2026-09-30T14:00:00-04:00</updated>
<summary>Filed: 2026-09-30 AccNo: ${acc}</summary>
<category term="8-K"/>
</entry>`;
}

function atomBody(entryCount: number, prepend?: string): string {
  const entries = Array.from({ length: entryCount }, (_, i) => atomEntry(i + 1)).join("");
  return `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">${prepend ?? ""}${entries}</feed>`;
}

function atomBodyRange(fromInclusive: number, count: number): string {
  const entries = Array.from({ length: count }, (_, i) => atomEntry(fromInclusive + i)).join("");
  return `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">${entries}</feed>`;
}

function accessionFor(n: number): string {
  return `0000000001-26-${String(n).padStart(6, "0")}`;
}

function secSource(metadata: Record<string, unknown> = {}): SourceRecord {
  return {
    id: crypto.randomUUID(),
    sourceKey: "sec-integration",
    companyName: null,
    ticker: null,
    cik: null,
    sourceType: "SEC_FILINGS",
    url: ATOM_URL,
    hostname: "www.sec.gov",
    feedFormat: "sec_atom",
    pollIntervalSeconds: 180,
    enabled: true,
    priority: 100,
    evidenceTier: "TIER_1_PRIMARY",
    authorityKey: "sec",
    lastSuccessAt: null,
    lastContentHash: null,
    lastEtag: null,
    lastModified: null,
    failureCount: 0,
    backoffUntil: null,
    lastErrorCategory: null,
    metadata,
  };
}

Deno.test("SEC checkpoint metadata round-trips through markSuccess-shaped helper", () => {
  const checkpoint = buildSecIntelCheckpoint({
    page0Accessions: ["0000320193-24-000123"],
    page0HeadUpdatedAt: "2024-01-02T12:00:00Z",
    pagesFetched: 1,
    nowIso: "2024-01-02T12:05:00Z",
    prior: null,
  });
  const source = secSource({
    checkpoint: { sec_edgar_intel: checkpoint, checkpoint },
  });
  assert(readSecIntelCheckpoint(source.metadata));
  applySecFetchMetadataToSource(
    source,
    {
      checkpoint: { ...checkpoint },
      continuation: null,
      batchComplete: true,
      workloadStartIndex: 0,
      successContentHash: "abc123",
    },
    "2024-01-02T12:10:00Z",
    "abc123",
    true,
  );
  const loaded = readSecIntelCheckpoint(source.metadata);
  assert(loaded);
  assertEquals(loaded.stream_key, SEC_EDGAR_STREAM_KEY);
  assertEquals(loaded.anchor_accessions, ["0000320193-24-000123"]);
});

Deno.test("SEC discover uses one page-zero fetch for bootstrap walk", async () => {
  const requests: string[] = [];
  const body = atomBody(3);
  const source = secSource();
  const ctx = {
    now: new Date("2026-10-01T12:00:00.000Z"),
    source,
    userAgent: "Stocksist test@example.com",
    fetchImpl: (url: string | URL | Request) => {
      requests.push(String(url));
      return Promise.resolve(new Response(body, { status: 200 }));
    },
    itemLimit: 40,
    allowFixtures: false,
    fetchState: {
      unchanged: false,
      etag: null,
      lastModified: null,
      contentHash: null,
      checkpoint: null,
    },
  };
  const result = await discoverSecFilingsPages(ctx, () => {});
  assert(result.ok);
  if (!result.ok) return;
  assertEquals(result.unchanged, false);
  assertEquals(result.secRequests, 1);
  assertEquals(requests.filter((u) => u.includes("start=0")).length, 1);
});

Deno.test("SEC batch drains 45 eligible filings across two runs without losing checkpoint", async () => {
  const store = createMemoryStore();
  const src = secSource();
  await store.saveSource(src);
  const body = atomBody(45);
  let httpCalls = 0;
  const fetchImpl = () => {
    httpCalls += 1;
    return Promise.resolve(new Response(body, { status: 200, headers: { "Content-Type": "application/atom+xml" } }));
  };
  const first = await runCollectorBot({
    bot: "sec",
    adapter: secFilingsAdapter,
    store,
    now: new Date("2026-10-01T12:00:00.000Z"),
    userAgent: "Stocksist test@example.com",
    fetchImpl,
    batchLimit: MAX_ITEMS_PER_SOURCE,
    cikMap: new Map([["0000000001", ["TST"]]]),
  });
  assertEquals(first.newItems, MAX_ITEMS_PER_SOURCE);
  const listed = await store.listSources({ sourceKeys: ["sec-integration"] });
  const saved = listed[0];
  assert(saved);
  const pending = readSecIntelContinuation(saved!.metadata);
  assert(pending);
  assertEquals(pending.next_index, MAX_ITEMS_PER_SOURCE);
  assertEquals(pending.batch_accessions.length, 45);
  assertEquals(readSecIntelCheckpoint(saved!.metadata), null);
  assertEquals(saved!.lastContentHash, null);

  const second = await runCollectorBot({
    bot: "sec",
    adapter: secFilingsAdapter,
    store,
    now: new Date("2026-10-01T12:05:00.000Z"),
    userAgent: "Stocksist test@example.com",
    fetchImpl,
    batchLimit: MAX_ITEMS_PER_SOURCE,
    cikMap: new Map([["0000000001", ["TST"]]]),
  });
  assertEquals(second.newItems, 5);
  const afterSecond = (await store.listSources({ sourceKeys: ["sec-integration"] }))[0];
  assert(afterSecond);
  assertEquals(readSecIntelContinuation(afterSecond.metadata), null);
  const checkpoint = readSecIntelCheckpoint(afterSecond.metadata);
  assert(checkpoint);
  assertEquals(store.rawItems().length, 45);
  assert(httpCalls >= 2);
});

Deno.test("SEC pending batch survives page-zero prepend and then ingests the new filing", async () => {
  const store = createMemoryStore();
  const src = secSource();
  await store.saveSource(src);
  const body45 = atomBody(45);
  const newPrepended = atomEntry(46);
  const body46 = atomBody(45, newPrepended);
  let feedBody = body45;
  const fetchImpl = () => Promise.resolve(new Response(feedBody, { status: 200 }));
  const run = (now: Date) => runCollectorBot({
    bot: "sec",
    adapter: secFilingsAdapter,
    store,
    now,
    userAgent: "Stocksist test@example.com",
    fetchImpl,
    batchLimit: MAX_ITEMS_PER_SOURCE,
    cikMap: new Map([["0000000001", ["TST"]]]),
  });
  await run(new Date("2026-10-01T12:00:00.000Z"));
  feedBody = body46;
  const second = await run(new Date("2026-10-01T12:05:00.000Z"));
  assertEquals(second.newItems, 5);
  assertEquals(store.rawItems().length, 45);
  const third = await run(new Date("2026-10-01T12:10:00.000Z"));
  assertEquals(third.newItems, 1);
  assertEquals(store.rawItems().length, 46);
});

Deno.test("planSecIntelIngestBatch resumes pending accessions when page hash and order change", () => {
  const entries = Array.from({ length: 50 }, (_, i) => ({
    accession_number: `0000000001-26-${String(i + 1).padStart(6, "0")}`,
    form_type: "8-K",
    filing_url: `https://www.sec.gov/Archives/edgar/data/1/x${i}`,
    accepted_at: "2026-09-30T18:00:00Z",
    filing_date: "2026-09-30",
    cik: "0000000001",
    company_name: `Example ${i + 1}`,
    sec_items: [],
    primary_document: null,
  }));
  const proposed = buildSecIntelCheckpoint({
    page0Accessions: entries.slice(0, 5).map((e) => e.accession_number),
    page0HeadUpdatedAt: "2026-09-30T18:00:00Z",
    pagesFetched: 1,
    nowIso: "2026-10-01T12:00:00.000Z",
    prior: null,
  });
  const first = planSecIntelIngestBatch({
    entries,
    contentHash: "hash-a",
    proposedCheckpoint: proposed,
    metadata: {},
    itemLimit: 40,
    filterForm: (f) => f === "8-K",
  });
  const reordered = [...entries].reverse();
  const second = planSecIntelIngestBatch({
    entries: reordered,
    contentHash: "hash-b",
    proposedCheckpoint: proposed,
    metadata: { sec_intel_continuation: first.patch.continuation },
    itemLimit: 40,
    filterForm: (f) => f === "8-K",
  });
  assertEquals(second.batchEntries.length, 10);
  assertEquals(second.batchEntries[0].accession_number, "0000000001-26-000041");
  assertEquals(second.patch.batchComplete, true);
  assertEquals(second.patch.checkpoint?.anchor_accessions, proposed.anchor_accessions);
});

Deno.test("planSecIntelIngestBatch fails closed when pending accessions are missing from walk", () => {
  const entries = Array.from({ length: 5 }, (_, i) => ({
    accession_number: `0000000001-26-${String(i + 1).padStart(6, "0")}`,
    form_type: "8-K",
    filing_url: `https://www.sec.gov/Archives/edgar/data/1/x${i}`,
    accepted_at: "2026-09-30T18:00:00Z",
    filing_date: "2026-09-30",
    cik: "0000000001",
    company_name: "Example",
    sec_items: [],
    primary_document: null,
  }));
  const proposed = buildSecIntelCheckpoint({
    page0Accessions: [entries[0].accession_number],
    page0HeadUpdatedAt: "2026-09-30T18:00:00Z",
    pagesFetched: 1,
    nowIso: "2026-10-01T12:00:00.000Z",
    prior: null,
  });
  const first = planSecIntelIngestBatch({
    entries,
    contentHash: "hash",
    proposedCheckpoint: proposed,
    metadata: {},
    itemLimit: 2,
    filterForm: (f) => f === "8-K",
  });
  assert(first.patch.continuation);
  let threw = false;
  try {
    planSecIntelIngestBatch({
      entries: entries.slice(0, 1),
      contentHash: "hash-2",
      proposedCheckpoint: proposed,
      metadata: { sec_intel_continuation: first.patch.continuation },
      itemLimit: 10,
      filterForm: (f) => f === "8-K",
    });
  } catch (err) {
    threw = err instanceof SecIntelPendingGapError;
    if (err instanceof SecIntelPendingGapError) {
      assert(err.missingAccessions.includes("0000000001-26-000003"));
    }
  }
  assert(threw);
});

Deno.test("SEC discover propagates later-page 429 status and Retry-After", async () => {
  const anchor = "0000000001-26-000150";
  const checkpoint = buildSecIntelCheckpoint({
    page0Accessions: ["0000000001-26-000001"],
    page0HeadUpdatedAt: "2026-09-30T18:00:00Z",
    pagesFetched: 1,
    nowIso: "2026-10-01T12:00:00.000Z",
    prior: null,
  });
  checkpoint.anchor_accessions = [anchor];
  const page0Entries = Array.from({ length: 100 }, (_, i) => atomEntry(i + 1)).join("");
  const page1Entry = `<entry>
<title>8-K - EXAMPLE CO 150 (0000000001) (Issuer)</title>
<link href="https://www.sec.gov/Archives/edgar/data/1/000000000126000150-index.htm"/>
<id>urn:tag:sec.gov,2008:accession-number=${anchor}</id>
<updated>2026-09-30T14:00:00-04:00</updated>
<summary>Filed: 2026-09-30 AccNo: ${anchor}</summary>
<category term="8-K"/>
</entry>`;
  const page0Body = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">${page0Entries}</feed>`;
  const page1Body = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">${page1Entry}</feed>`;
  const requests: string[] = [];
  const source = secSource({ checkpoint });
  const fetchState: import("./types.ts").FetchState = {
    unchanged: false,
    etag: null,
    lastModified: null,
    contentHash: null,
    checkpoint: null,
  };
  const ctx = {
    now: new Date("2026-10-01T12:00:00.000Z"),
    source,
    userAgent: "Stocksist test@example.com",
    fetchImpl: (url: string | URL | Request) => {
      const href = String(url);
      requests.push(href);
      if (href.includes("start=0")) {
        return Promise.resolve(new Response(page0Body, { status: 200 }));
      }
      if (href === buildLatestFilingsAtomUrl(100)) {
        return Promise.resolve(new Response("slow", {
          status: 429,
          headers: { "retry-after": "900", "content-type": "text/plain" },
        }));
      }
      return Promise.resolve(new Response(page1Body, { status: 200 }));
    },
    itemLimit: 40,
    allowFixtures: false,
    fetchState,
  };
  const result = await discoverSecFilingsPages(ctx, () => {});
  assertEquals(result.ok, false);
  if (result.ok) return;
  assertEquals(result.reason, "PROVIDER_RATE_LIMITED");
  assertEquals(result.retryAfterSeconds, 900);
  assertEquals(fetchState.providerHttpStatus, 429);
  assertEquals(fetchState.providerRetryAfterSeconds, 900);
  assertEquals(result.secRequests, 2);
  assertEquals(requests.filter((u) => u.includes("start=0")).length, 1);
  assert(requests.some((u) => u.includes("start=100")));
});

Deno.test("SEC pending batch drains 150 filings across SEC page boundaries", async () => {
  const prior = buildSecIntelCheckpoint({
    page0Accessions: [accessionFor(1)],
    page0HeadUpdatedAt: "2026-09-30T18:00:00Z",
    pagesFetched: 2,
    nowIso: "2026-10-01T10:00:00.000Z",
    prior: null,
  });
  prior.anchor_accessions = [accessionFor(151)];
  const anchorOnly = `<entry>
<title>3 - EXAMPLE CO ANCHOR (0000000001) (Issuer)</title>
<link href="https://www.sec.gov/Archives/edgar/data/1/000000000126000151-index.htm"/>
<id>urn:tag:sec.gov,2008:accession-number=${accessionFor(151)}</id>
<updated>2026-09-30T14:00:00-04:00</updated>
<summary>Filed: 2026-09-30 AccNo: ${accessionFor(151)}</summary>
<category term="3"/>
</entry>`;
  const pageBodies = new Map<number, string>([
    [0, atomBodyRange(1, 100)],
    [100, atomBodyRange(101, 50)],
    [200, `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">${anchorOnly}</feed>`],
  ]);
  const store = createMemoryStore();
  const src = secSource({ checkpoint: checkpointMetadataRecord(prior) });
  src.pollIntervalSeconds = 0;
  await store.saveSource(src);
  let sawSecondPageDuringPending = false;
  let runOffsetMs = 0;
  const fetchImpl = (url: string | URL | Request) => {
    const href = String(url);
    const start = Number(new URL(href).searchParams.get("start") ?? "0");
    const body = pageBodies.get(start) ?? atomBodyRange(1, 0);
    return Promise.resolve(new Response(body, { status: 200 }));
  };
  const run = async () => {
    const hadPending = readSecIntelContinuation(
      (await store.listSources({ sourceKeys: ["sec-integration"] }))[0]?.metadata ?? {},
    ) != null;
    const calls: string[] = [];
    const wrappedFetch = (url: string | URL | Request) => {
      calls.push(String(url));
      return fetchImpl(url);
    };
    runOffsetMs += 60_000;
    const telemetry = await runCollectorBot({
      bot: "sec",
      adapter: secFilingsAdapter,
      store,
      now: new Date(Date.parse("2026-10-01T12:00:00.000Z") + runOffsetMs),
      userAgent: "Stocksist test@example.com",
      fetchImpl: wrappedFetch,
      batchLimit: MAX_ITEMS_PER_SOURCE,
      cikMap: new Map([["0000000001", ["TST"]]]),
    });
    if (hadPending && calls.some((u) => u.includes("start=100"))) {
      sawSecondPageDuringPending = true;
    }
    return telemetry;
  };
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const result = await run();
    assertEquals(result.sourcesAttempted, 1);
    assertEquals(result.errors.some((e) => e.category === "sec_intel_pending_gap"), false);
    const pending = readSecIntelContinuation(
      (await store.listSources({ sourceKeys: ["sec-integration"] }))[0]?.metadata ?? {},
    );
    if (!pending) break;
  }
  assertEquals(store.rawItems().length, 150);
  assert(sawSecondPageDuringPending);
  assertEquals(readSecIntelContinuation(
    (await store.listSources({ sourceKeys: ["sec-integration"] }))[0].metadata,
  ), null);
});

Deno.test("SEC ingest error after feed prepend keeps batch-open hash for catch-up", async () => {
  const store = createMemoryStore();
  const src = secSource();
  await store.saveSource(src);
  const body45 = atomBody(45);
  const hash45 = await hashPageText(body45);
  const body46 = atomBody(45, atomEntry(46));
  let feedBody = body45;
  await runCollectorBot({
    bot: "sec",
    adapter: secFilingsAdapter,
    store,
    now: new Date("2026-10-01T12:00:00.000Z"),
    userAgent: "Stocksist test@example.com",
    fetchImpl: () => Promise.resolve(new Response(feedBody, { status: 200 })),
    batchLimit: MAX_ITEMS_PER_SOURCE,
    cikMap: new Map([["0000000001", ["TST"]]]),
  });
  feedBody = body46;
  let failOnce = true;
  const baseInsert = store.insertRaw.bind(store);
  store.insertRaw = async (item) => {
    if (failOnce) {
      failOnce = false;
      throw new Error("simulated ingest failure");
    }
    return baseInsert(item);
  };
  const failed = await runCollectorBot({
    bot: "sec",
    adapter: secFilingsAdapter,
    store,
    now: new Date("2026-10-01T12:05:00.000Z"),
    userAgent: "Stocksist test@example.com",
    fetchImpl: () => Promise.resolve(new Response(feedBody, { status: 200 })),
    batchLimit: MAX_ITEMS_PER_SOURCE,
    cikMap: new Map([["0000000001", ["TST"]]]),
  });
  assertEquals(failed.sourcesFailed, 1);
  const afterFail = (await store.listSources({ sourceKeys: ["sec-integration"] }))[0];
  const pendingAfterFail = readSecIntelContinuation(afterFail.metadata);
  assert(pendingAfterFail);
  assertEquals(pendingAfterFail.page_content_hash, hash45);
  store.insertRaw = baseInsert;
  await runCollectorBot({
    bot: "sec",
    adapter: secFilingsAdapter,
    store,
    now: new Date("2026-10-01T12:06:00.000Z"),
    userAgent: "Stocksist test@example.com",
    fetchImpl: () => Promise.resolve(new Response(feedBody, { status: 200 })),
    batchLimit: MAX_ITEMS_PER_SOURCE,
    cikMap: new Map([["0000000001", ["TST"]]]),
  });
  assertEquals(store.rawItems().length, 45);
  const catchUp = await runCollectorBot({
    bot: "sec",
    adapter: secFilingsAdapter,
    store,
    now: new Date("2026-10-01T12:10:00.000Z"),
    userAgent: "Stocksist test@example.com",
    fetchImpl: () => Promise.resolve(new Response(feedBody, { status: 200 })),
    batchLimit: MAX_ITEMS_PER_SOURCE,
    cikMap: new Map([["0000000001", ["TST"]]]),
  });
  assertEquals(catchUp.newItems, 1);
  assertEquals(store.rawItems().length, 46);
});

Deno.test("SEC item ingest error preserves pending continuation index", async () => {
  const store = createMemoryStore();
  const src = secSource();
  await store.saveSource(src);
  const body = atomBody(45);
  let insertCount = 0;
  const baseInsert = store.insertRaw.bind(store);
  store.insertRaw = async (item) => {
    insertCount += 1;
    if (insertCount === 3) throw new Error("simulated ingest failure");
    return baseInsert(item);
  };
  const first = await runCollectorBot({
    bot: "sec",
    adapter: secFilingsAdapter,
    store,
    now: new Date("2026-10-01T12:00:00.000Z"),
    userAgent: "Stocksist test@example.com",
    fetchImpl: () => Promise.resolve(new Response(body, { status: 200 })),
    batchLimit: MAX_ITEMS_PER_SOURCE,
    cikMap: new Map([["0000000001", ["TST"]]]),
  });
  assertEquals(first.sourcesFailed, 1);
  const saved = (await store.listSources({ sourceKeys: ["sec-integration"] }))[0];
  const pending = readSecIntelContinuation(saved.metadata);
  assert(pending);
  assertEquals(pending.next_index, 2);
  assertEquals(store.rawItems().length, 2);
});

Deno.test("SEC duplicate run does not recreate raw rows", async () => {
  const store = createMemoryStore();
  const src = secSource();
  await store.saveSource(src);
  const body = atomBody(2);
  const fetchImpl = () => Promise.resolve(new Response(body, { status: 200 }));
  await runCollectorBot({
    bot: "sec",
    adapter: secFilingsAdapter,
    store,
    now: new Date("2026-10-01T12:00:00.000Z"),
    userAgent: "Stocksist test@example.com",
    fetchImpl,
    batchLimit: 40,
    cikMap: new Map([["0000000001", ["TST"]]]),
  });
  const before = store.rawItems().length;
  await runCollectorBot({
    bot: "sec",
    adapter: secFilingsAdapter,
    store,
    now: new Date("2026-10-01T12:01:00.000Z"),
    userAgent: "Stocksist test@example.com",
    fetchImpl: () => Promise.resolve(new Response(body.replace("</feed>", "<!--v2--></feed>"), { status: 200 })),
    batchLimit: 40,
    cikMap: new Map([["0000000001", ["TST"]]]),
  });
  assertEquals(store.rawItems().length, before);
});

Deno.test("planSecIntelIngestBatch holds checkpoint until batch complete", () => {
  const entries = Array.from({ length: 50 }, (_, i) => ({
    accession_number: `0000000001-26-${String(i + 1).padStart(6, "0")}`,
    form_type: "8-K",
    filing_url: `https://www.sec.gov/Archives/edgar/data/1/x${i}`,
    accepted_at: "2026-09-30T18:00:00Z",
    filing_date: "2026-09-30",
    cik: "0000000001",
    company_name: "Example",
    sec_items: [],
    primary_document: null,
  }));
  const proposed = buildSecIntelCheckpoint({
    page0Accessions: entries.slice(0, 5).map((e) => e.accession_number),
    page0HeadUpdatedAt: "2026-09-30T18:00:00Z",
    pagesFetched: 1,
    nowIso: "2026-10-01T12:00:00.000Z",
    prior: null,
  });
  const first = planSecIntelIngestBatch({
    entries,
    contentHash: "hash-45",
    proposedCheckpoint: proposed,
    metadata: {},
    itemLimit: 40,
    filterForm: (f) => f === "8-K",
  });
  assertEquals(first.batchEntries.length, 40);
  assertEquals(first.patch.batchComplete, false);
  assert(first.patch.continuation);
  const second = planSecIntelIngestBatch({
    entries,
    contentHash: "hash-45",
    proposedCheckpoint: proposed,
    metadata: { sec_intel_continuation: first.patch.continuation },
    itemLimit: 40,
    filterForm: (f) => f === "8-K",
  });
  assertEquals(second.batchEntries.length, 10);
  assertEquals(second.patch.batchComplete, true);
  assertEquals(second.patch.continuation, null);
});
