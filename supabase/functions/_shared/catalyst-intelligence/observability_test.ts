import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  createSecRequester,
  emptySecSummary,
  parseCompanyTickersExchangeJson,
  SEC_COMPANY_TICKERS_EXCHANGE_URL,
} from "../sec-edgar/ingest.ts";
import { attributeCandidate } from "./attribution.ts";
import { DatabaseReadError } from "./conflicts.ts";
import { buildRawItem, contentHash } from "./normalize.ts";
import { createMemoryStore, type CatalystIntelStore } from "./persistence.ts";
import { ingestCandidate } from "./pipeline.ts";
import { runCollectorBot } from "./run-bot.ts";
import type { CatalystSourceAdapter } from "./source-adapter.ts";
import type { CompanyRecord, NormalizedEventCandidate, RawSourceItem, SourceRecord } from "./types.ts";

const NOW = new Date("2026-09-30T15:00:00.000Z");
const DISCOVERED = NOW.toISOString();

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

async function candidateFor(
  src: SourceRecord,
  key: string,
  cik: string,
): Promise<NormalizedEventCandidate> {
  const title = `Form 424B2 filing ${key}`;
  const hash = await contentHash(title, null);
  const raw = await buildRawItem({
    sourceId: src.id,
    sourceType: "SEC_FILINGS",
    externalId: `acc-${key}`,
    canonicalUrl: `https://www.sec.gov/Archives/edgar/data/${key}/index.htm`,
    publishedAt: DISCOVERED,
    discoveredAt: DISCOVERED,
    title,
    summary: null,
    metadata: { cik, formType: "424B2" },
  });
  raw.contentHash = hash;
  return {
    raw,
    title,
    summary: null,
    suggestedType: null,
    subtype: "424B2",
    scheduledStart: null,
    scheduledEnd: null,
    scheduledDate: null,
    isAnnouncement: true,
    evidenceTier: src.evidenceTier,
    metadata: raw.metadata,
  };
}

const CIK_MAP = new Map<string, string[]>([
  ["0000000001", ["AAA"]],
  ["0000000002", ["BBB"]],
  ["0000000003", ["CCC"]],
  ["0000000004", ["DDD"]],
  ["0000000005", ["EEE"]],
  ["0000000006", ["FFF"]],
  ["0000000007", ["GGG"]],
]);

Deno.test("ingestion counters: seven unique feed entries report seven new raws", async () => {
  const store = createMemoryStore();
  const src = source({
    sourceType: "SEC_FILINGS",
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&output=atom",
    evidenceTier: "TIER_1_PRIMARY",
    feedFormat: "sec_atom",
  });
  await store.saveSource(src);
  const keys = ["u1", "u2", "u3", "u4", "u5", "u6", "u7"];
  const items: RawSourceItem[] = [];
  for (let i = 0; i < keys.length; i++) {
    items.push((await candidateFor(src, keys[i], `000000000${i + 1}`)).raw);
  }
  const adapter: CatalystSourceAdapter = {
    id: "test-sec",
    sourceType: "SEC_FILINGS",
    discover: async () => items,
    normalize: async (item) => ({
      raw: item,
      title: item.title ?? "",
      summary: item.summary,
      suggestedType: null,
      subtype: "424B2",
      scheduledStart: null,
      scheduledEnd: null,
      scheduledDate: null,
      isAnnouncement: true,
      evidenceTier: src.evidenceTier,
      metadata: item.metadata,
    }),
  };
  const run = await runCollectorBot({
    bot: "sec",
    adapter,
    store,
    now: NOW,
    userAgent: "Stocksist test@example.com",
    fetchImpl: fetch,
    batchLimit: 5,
    cikMap: CIK_MAP,
  });
  assertEquals(run.rawItemsSeen, 7);
  assertEquals(run.newItems, 7);
  assertEquals(run.duplicates, 0);
  assertEquals(store.rawItems().length, 7);
});

Deno.test("ingestion counters: repeated feed entries in one run collapse to seven new and thirty-three repeats", async () => {
  const store = createMemoryStore();
  const src = source({
    sourceType: "SEC_FILINGS",
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&output=atom",
    evidenceTier: "TIER_1_PRIMARY",
    feedFormat: "sec_atom",
  });
  await store.saveSource(src);
  const unique = await Promise.all(
    ["a", "b", "c", "d", "e", "f", "g"].map((key, i) => candidateFor(src, key, `000000000${i + 1}`)),
  );
  const items: RawSourceItem[] = [];
  for (let repeat = 0; repeat < 40; repeat++) {
    items.push(unique[repeat % unique.length].raw);
  }
  const adapter: CatalystSourceAdapter = {
    id: "test-sec-repeat",
    sourceType: "SEC_FILINGS",
    discover: async () => items,
    normalize: async (item) => {
      const match = unique.find((row) => row.raw.externalId === item.externalId);
      assert(match);
      return match;
    },
  };
  const run = await runCollectorBot({
    bot: "sec",
    adapter,
    store,
    now: NOW,
    userAgent: "Stocksist test@example.com",
    fetchImpl: fetch,
    batchLimit: 5,
    cikMap: CIK_MAP,
  });
  assertEquals(run.rawItemsSeen, 40);
  assertEquals(run.newItems, 7);
  assertEquals(run.duplicates, 33);
  assertEquals(store.rawItems().length, 7);
});

Deno.test("ingestion counters: previously linked raw is duplicate not new", async () => {
  const store = createMemoryStore();
  const src = source({
    sourceType: "SEC_FILINGS",
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&output=atom",
    evidenceTier: "TIER_1_PRIMARY",
  });
  const candidate = await candidateFor(src, "linked", "0000000001");
  const ctx = { now: NOW, allowFixtures: true, source: src, cikMap: CIK_MAP };
  const first = await ingestCandidate(store, candidate, ctx);
  assertEquals(first.rawDisposition, "inserted");
  assertEquals(first.status, "created");
  const second = await ingestCandidate(store, candidate, ctx);
  assertEquals(second.status, "duplicate");
  assertEquals(second.rawDisposition, "existing_linked");
});

Deno.test("ingestion counters: resumable raw without evidence is not counted as new", async () => {
  const store = createMemoryStore();
  const src = source({
    sourceType: "SEC_FILINGS",
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&output=atom",
    evidenceTier: "TIER_1_PRIMARY",
  });
  const unmapped = await candidateFor(src, "resume", "0000000099");
  const ctx = { now: NOW, allowFixtures: true, source: src, cikMap: CIK_MAP };
  const first = await ingestCandidate(store, unmapped, ctx);
  assertEquals(first.status, "unresolved");
  assertEquals(first.rawDisposition, "inserted");
  assertEquals(store.rawItems()[0]?.metadata.attribution_unresolved_reason, "NO_CIK_TICKER_MAPPING");
  const second = await ingestCandidate(store, unmapped, ctx);
  assertEquals(second.status, "unresolved");
  assertEquals(second.rawDisposition, "existing_resumed");
});

Deno.test("ingestion counters: database failure on raw insert is not reported as duplicate", async () => {
  const base = createMemoryStore();
  let inserts = 0;
  const store: CatalystIntelStore = {
    ...base,
    async insertRaw(item) {
      inserts += 1;
      if (inserts > 1) throw new DatabaseReadError();
      return base.insertRaw(item);
    },
  };
  const src = source({
    sourceType: "SEC_FILINGS",
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&output=atom",
    evidenceTier: "TIER_1_PRIMARY",
  });
  const ctx = { now: NOW, allowFixtures: true, source: src, cikMap: CIK_MAP };
  await ingestCandidate(store, await candidateFor(src, "ok", "0000000001"), ctx);
  const failing = await candidateFor(src, "fail", "0000000002");
  await assertRejects(
    () => ingestCandidate(store, failing, ctx),
    DatabaseReadError,
  );
});

const LIVE_ISSUERS: { cik: string; label: string }[] = [
  { cik: "0001114446", label: "UBS AG" },
  { cik: "0000886982", label: "Goldman Sachs Group Inc" },
  { cik: "0001419828", label: "GS Finance Corp." },
  { cik: "0000895421", label: "Morgan Stanley" },
  { cik: "0001666268", label: "Morgan Stanley Finance LLC" },
  { cik: "0000312070", label: "Barclays Bank PLC" },
];

Deno.test("SEC live issuer CIKs: deterministic attribution diagnostics from company_tickers_exchange", async () => {
  const summary = emptySecSummary();
  const secFetch = createSecRequester(Deno.env.get("SEC_USER_AGENT") ?? "Stocksist test@example.com", summary);
  const res = await secFetch(SEC_COMPANY_TICKERS_EXCHANGE_URL);
  if (!res.ok) {
    console.warn("Skipping live SEC CIK evaluation: provider unavailable");
    return;
  }
  const parsed = parseCompanyTickersExchangeJson(res.json);
  const cikMap = new Map<string, string[]>();
  for (const [cik, rows] of parsed) cikMap.set(cik, rows.map((row) => row.ticker));
  const minimalCandidate = (cik: string): NormalizedEventCandidate => ({
    raw: {
      sourceId: "test",
      sourceType: "SEC_FILINGS",
      externalId: null,
      canonicalUrl: null,
      publishedAt: null,
      discoveredAt: DISCOVERED,
      title: "424B2",
      summary: null,
      contentHash: "abc",
      metadata: { cik },
    },
    title: "424B2",
    summary: null,
    suggestedType: null,
    subtype: "424B2",
    scheduledStart: null,
    scheduledEnd: null,
    scheduledDate: null,
    isAnnouncement: true,
    evidenceTier: "TIER_1_PRIMARY",
    metadata: { cik },
  });
  for (const issuer of LIVE_ISSUERS) {
    const tickers = cikMap.get(issuer.cik) ?? [];
    const decision = attributeCandidate(minimalCandidate(issuer.cik), {
      sourceTicker: null,
      sourceCompanyName: null,
      sourceCik: null,
      sourceType: "SEC_FILINGS",
      cikMap,
    });
    console.log(
      JSON.stringify({
        cik: issuer.cik,
        issuer: issuer.label,
        mapping_candidates: tickers,
        candidate_count: tickers.length,
        outcome: decision.status,
        unresolved_reason: decision.unresolvedReason ?? null,
      }),
    );
    if (tickers.length === 0) {
      assertEquals(decision.status, "unresolved");
      assertEquals(decision.unresolvedReason, "NO_CIK_TICKER_MAPPING");
    } else if (tickers.length > 1) {
      assertEquals(decision.status, "unresolved");
      assertEquals(decision.unresolvedReason, "MULTIPLE_CIK_TICKERS");
    }
  }
});
