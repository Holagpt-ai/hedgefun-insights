import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { secFilingsAdapter } from "./adapters/sec.ts";
import { MAX_ITEMS_PER_SOURCE } from "./config.ts";
import { buildSecIntelCheckpoint, discoverSecFilingsPages, planSecIntelIngestBatch } from "./sec-intel-discovery.ts";
import {
  applySecFetchMetadataToSource,
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

function atomBody(entryCount: number): string {
  const entries = Array.from({ length: entryCount }, (_, i) => atomEntry(i + 1)).join("");
  return `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">${entries}</feed>`;
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
    { checkpoint: { ...checkpoint }, continuation: null, batchComplete: true },
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
