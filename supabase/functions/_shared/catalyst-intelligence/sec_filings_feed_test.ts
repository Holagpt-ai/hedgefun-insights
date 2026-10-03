import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleCatalystIntelRequest } from "./http.ts";
import {
  providerBackoffSeconds,
  secFilingsRateLimitBackoffSeconds,
  secFilingsRateLimitFloorApplied,
} from "./config.ts";
import { createMemoryStore } from "./persistence.ts";
import {
  encodeSecCompanyMap,
  SEC_COMPANY_MAP_CACHE_KEY,
  SEC_COMPANY_MAP_MIN_ISSUERS,
} from "./sec-company-map.ts";
import { parseSecRetryAfterSeconds } from "../sec-edgar/ingest.ts";
import { parseCompanyTickersExchangeJson } from "../sec-edgar/ingest.ts";
import type { SourceRecord } from "./types.ts";

const NOW = new Date("2026-10-03T15:00:00.000Z");
const ATOM_URL = "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&owner=exclude&count=100&start=0&output=atom";
const MAP_URL = "https://www.sec.gov/files/company_tickers_exchange.json";
const USER_AGENT = "Stocksist filings-audit test@example.com";
const ATOM = `<?xml version="1.0"?><feed><entry>
<title>8-K - EXAMPLE HOOD MARKETS (0000000001) (Issuer)</title>
<link href="https://www.sec.gov/Archives/edgar/data/1/0000000001-26-000001-index.htm"/>
<id>urn:tag:sec.gov,2008:accession-number=0000000001-26-000001</id>
<updated>2026-09-30T14:00:00-04:00</updated>
<summary>Filed: 2026-09-30 AccNo: 0000000001-26-000001 Item 1.01</summary>
<category term="8-K"/>
</entry></feed>`;

function source(partial: Partial<SourceRecord> = {}): SourceRecord {
  return {
    id: "sec-src",
    sourceKey: "sec-latest-filings",
    companyName: null,
    ticker: null,
    cik: null,
    sourceType: "SEC_FILINGS",
    url: ATOM_URL,
    hostname: "www.sec.gov",
    feedFormat: "sec_atom",
    pollIntervalSeconds: partial.pollIntervalSeconds ?? 180,
    enabled: true,
    priority: 100,
    evidenceTier: "TIER_1_PRIMARY",
    authorityKey: "sec",
    lastSuccessAt: partial.lastSuccessAt ?? null,
    lastContentHash: null,
    lastEtag: partial.lastEtag ?? null,
    lastModified: partial.lastModified ?? null,
    failureCount: partial.failureCount ?? 0,
    backoffUntil: partial.backoffUntil ?? null,
    lastErrorCategory: null,
    metadata: {},
  };
}

function freshCache() {
  const data: unknown[][] = [[1, "Example Hood Markets", "HOOD", "Nasdaq"]];
  const seen = new Set(["0000000001"]);
  let i = 0;
  while (seen.size < SEC_COMPANY_MAP_MIN_ISSUERS) {
    i += 1;
    const cik = 700000 + i;
    const padded = String(cik).padStart(10, "0");
    seen.add(padded);
    data.push([cik, `Issuer ${cik}`, `Q${String(i).padStart(4, "0")}`, "Nasdaq"]);
  }
  const parsed = parseCompanyTickersExchangeJson({ data });
  const map = new Map<string, string[]>();
  for (const [cik, rows] of parsed) map.set(cik, rows.map((row) => row.ticker));
  return {
    cacheKey: SEC_COMPANY_MAP_CACHE_KEY,
    payload: encodeSecCompanyMap(map),
    refreshedAt: new Date(NOW.getTime() - 60_000).toISOString(),
  };
}

function env() {
  return (key: string) => {
    if (key === "SYNC_SECRET") return "secret";
    if (key === "CATALYST_INTEL_SEC_ENABLED") return "true";
    if (key === "SEC_USER_AGENT") return USER_AGENT;
    return undefined;
  };
}

async function invoke(input: {
  atom: Response | (() => Response);
  source?: SourceRecord;
  seedCache?: boolean;
  now?: Date;
  store?: ReturnType<typeof createMemoryStore>;
}) {
  const store = input.store ?? createMemoryStore();
  if (!input.store) {
    await store.saveSource(input.source ?? source({ lastSuccessAt: new Date(NOW.getTime() - 600_000).toISOString() }));
    if (input.seedCache !== false) await store.saveProviderCache(freshCache());
  }
  const now = input.now ?? NOW;
  const calls: string[] = [];
  const headers: Headers[] = [];
  const delays: number[] = [];
  const fetchImpl = (url: string | URL | Request, init?: RequestInit) => {
    const href = String(url);
    calls.push(href);
    if (href === ATOM_URL) headers.push(new Headers(init?.headers));
    if (href === MAP_URL) return Promise.resolve(new Response("map", { status: 500 }));
    const atom = typeof input.atom === "function" ? input.atom() : input.atom;
    return Promise.resolve(atom);
  };
  const response = await handleCatalystIntelRequest(new Request("https://example.test/sec", {
    method: "POST",
    headers: { Authorization: "Bearer secret" },
  }), {
    bot: "sec",
    env: env(),
    store,
    now: () => now,
    fetchImpl: fetchImpl as typeof fetch,
    sleepFn: (ms: number) => {
      delays.push(ms);
      return Promise.resolve();
    },
  });
  const body = await response.json();
  return { store, response, body, calls, headers, delays, sourceRow: (await store.listSources({}))[0] };
}

Deno.test("SEC filings request sends the configured User-Agent and no conditional headers", async () => {
  const result = await invoke({
    atom: new Response(ATOM, { status: 200, headers: { "content-type": "application/atom+xml", etag: '"feed"', "last-modified": "Sat, 03 Oct 2026 14:00:00 GMT" } }),
  });
  assertEquals(result.calls, [ATOM_URL]);
  assertEquals(result.headers[0].get("user-agent"), USER_AGENT);
  assertEquals(result.headers[0].get("accept"), "application/atom+xml, application/xml, text/xml, application/json, text/plain");
  assertEquals(result.headers[0].get("if-none-match"), null);
  assertEquals(result.headers[0].get("if-modified-since"), null);
  assertEquals(result.headers[0].get("accept-encoding"), null);
  assertEquals(result.body.run.observability.ingestion.sec_filings_http_attempts, 1);
  assertEquals(result.body.run.observability.ingestion.sec_filings_http_status, 200);
  assertEquals(result.body.run.status, "completed");
  assertEquals(result.sourceRow.failureCount, 0);
});

Deno.test("a fresh company map plus one due filings wake makes one SEC request", async () => {
  const result = await invoke({
    atom: new Response(ATOM, { status: 200, headers: { "content-type": "application/atom+xml" } }),
  });
  assertEquals(result.calls.filter((url) => url === MAP_URL).length, 0);
  assertEquals(result.calls.filter((url) => url === ATOM_URL).length, 1);
  assertEquals(result.calls.length, 1);
  assertEquals(result.store.events().length, 1);
});

Deno.test("SEC filings 429 does not retry and keeps the numeric Retry-After", async () => {
  const result = await invoke({
    atom: new Response("slow", { status: 429, headers: { "content-type": "text/plain", "retry-after": "900" } }),
  });
  assertEquals(result.calls, [ATOM_URL]);
  assertEquals(result.delays, []);
  assertEquals(result.response.status, 200);
  assertEquals(result.body.run.status, "completed");
  assertEquals(result.body.run.sources_failed, 1);
  assertEquals(result.body.run.errors[0].category, "provider_rate_limited");
  assertEquals(result.body.run.errors[0].status_code, 429);
  assertEquals(result.body.run.errors[0].details.retry_after_seconds, 900);
  assertEquals(result.body.run.errors[0].details.filings_http_attempts, 1);
  assertEquals(result.body.run.errors[0].details.backoff_seconds, 900);
  assertEquals(result.body.run.observability.ingestion.sec_filings_http_attempts, 1);
  assertEquals(result.body.run.observability.ingestion.sec_company_map_state, "cache_fresh");
  assertEquals(result.sourceRow.failureCount, 1);
  assertEquals(result.sourceRow.lastErrorCategory, "provider_rate_limited");
  assertEquals(result.sourceRow.backoffUntil, new Date(NOW.getTime() + 900_000).toISOString());
  assertEquals(result.store.rawItems().length, 0);
});

Deno.test("SEC filings 429 HTTP-date Retry-After lengthens source backoff", async () => {
  const retryAt = new Date(NOW.getTime() + 600_000).toUTCString();
  const result = await invoke({
    atom: new Response("slow", { status: 429, headers: { "retry-after": retryAt } }),
  });
  assertEquals(result.calls.length, 1);
  assertEquals(result.body.run.observability.ingestion.sec_filings_retry_after_seconds, 600);
  assertEquals(result.sourceRow.backoffUntil, new Date(NOW.getTime() + 600_000).toISOString());
});

Deno.test("SEC filings 429 quiet period is 600 seconds unless a longer wait applies", () => {
  assertEquals(secFilingsRateLimitBackoffSeconds(1, null), 600);
  assertEquals(secFilingsRateLimitBackoffSeconds(1, Number.NaN), 600);
  assertEquals(secFilingsRateLimitBackoffSeconds(1, 120), 600);
  assertEquals(secFilingsRateLimitBackoffSeconds(1, 900), 900);
  assertEquals(secFilingsRateLimitBackoffSeconds(5, 100), 960);
  assertEquals(secFilingsRateLimitBackoffSeconds(1, 7_200), 3_600);
  assertEquals(secFilingsRateLimitFloorApplied(1, null), true);
  assertEquals(secFilingsRateLimitFloorApplied(1, 120), true);
  assertEquals(secFilingsRateLimitFloorApplied(1, 900), false);
  assertEquals(secFilingsRateLimitFloorApplied(5, 100), false);
  assertEquals(providerBackoffSeconds(1, 30), 60);
  assertEquals(providerBackoffSeconds(1, null), 60);
  assertEquals(providerBackoffSeconds(5, 100), 960);
  assertEquals(providerBackoffSeconds(1, 7_200), 3_600);
  assertEquals(parseSecRetryAfterSeconds("30", NOW.getTime()), 30);
  assertEquals(parseSecRetryAfterSeconds(new Date(NOW.getTime() + 4_000).toUTCString(), NOW.getTime()), 4);
  assertEquals(parseSecRetryAfterSeconds("soon", NOW.getTime()), null);
});

Deno.test("first SEC filings 429 with no Retry-After waits 600 seconds", async () => {
  const result = await invoke({
    atom: new Response("slow", { status: 429, headers: { "content-type": "text/plain" } }),
  });
  assertEquals(result.calls, [ATOM_URL]);
  assertEquals(result.delays, []);
  assertEquals(result.body.run.status, "completed");
  assertEquals(result.body.run.errors[0].status_code, 429);
  assertEquals(result.body.run.errors[0].details.retry_after_seconds, null);
  assertEquals(result.body.run.errors[0].details.backoff_seconds, 600);
  assertEquals(result.body.run.errors[0].details.rate_limit_floor_applied, true);
  assertEquals(result.body.run.observability.ingestion.sec_filings_http_attempts, 1);
  assertEquals(result.body.run.observability.ingestion.sec_filings_backoff_seconds, 600);
  assertEquals(result.body.run.observability.ingestion.sec_filings_rate_limit_floor_applied, true);
  assertEquals(result.sourceRow.backoffUntil, new Date(NOW.getTime() + 600_000).toISOString());
});

Deno.test("SEC filings Retry-After of 120 still waits the 600-second minimum", async () => {
  const result = await invoke({
    atom: new Response("slow", { status: 429, headers: { "retry-after": "120" } }),
  });
  assertEquals(result.calls.length, 1);
  assertEquals(result.body.run.observability.ingestion.sec_filings_retry_after_seconds, 120);
  assertEquals(result.body.run.observability.ingestion.sec_filings_backoff_seconds, 600);
  assertEquals(result.body.run.observability.ingestion.sec_filings_rate_limit_floor_applied, true);
  assertEquals(result.sourceRow.backoffUntil, new Date(NOW.getTime() + 600_000).toISOString());
});

Deno.test("a later SEC filings 429 keeps a calculated backoff above 600 seconds", async () => {
  const result = await invoke({
    atom: new Response("slow", { status: 429, headers: { "retry-after": "100" } }),
    source: source({
      failureCount: 4,
      lastSuccessAt: new Date(NOW.getTime() - 3_600_000).toISOString(),
      pollIntervalSeconds: 180,
    }),
  });
  assertEquals(result.sourceRow.failureCount, 5);
  assertEquals(result.body.run.observability.ingestion.sec_filings_backoff_seconds, 960);
  assertEquals(result.body.run.observability.ingestion.sec_filings_rate_limit_floor_applied, false);
  assertEquals(result.sourceRow.backoffUntil, new Date(NOW.getTime() + 960_000).toISOString());
});

Deno.test("the five-minute wake after a filings 429 makes no SEC request", async () => {
  const first = await invoke({
    atom: new Response("slow", { status: 429 }),
  });
  const duringQuiet = await invoke({
    atom: new Response(ATOM, { status: 200, headers: { "content-type": "application/atom+xml" } }),
    store: first.store,
    now: new Date(NOW.getTime() + 300_000),
  });
  assertEquals(duringQuiet.calls, []);
  assertEquals(duringQuiet.body.run.sources_attempted, 0);
  assertEquals(duringQuiet.body.run.observability.ingestion.atom_source_attempted, false);
  assertEquals(duringQuiet.sourceRow.failureCount, 1);
  assertEquals(duringQuiet.sourceRow.backoffUntil, new Date(NOW.getTime() + 600_000).toISOString());

  const resumed = await invoke({
    atom: new Response(ATOM, { status: 200, headers: { "content-type": "application/atom+xml" } }),
    store: first.store,
    now: new Date(NOW.getTime() + 600_000),
  });
  assertEquals(resumed.calls, [ATOM_URL]);
  assertEquals(resumed.body.run.status, "completed");
  assertEquals(resumed.sourceRow.failureCount, 0);
  assertEquals(resumed.sourceRow.backoffUntil, null);
  assertEquals(resumed.store.events().length, 1);
});

Deno.test("an active SEC backoff suppresses the filings request", async () => {
  const result = await invoke({
    atom: new Response(ATOM, { status: 200 }),
    source: source({
      backoffUntil: new Date(NOW.getTime() + 960_000).toISOString(),
      failureCount: 5,
      pollIntervalSeconds: 180,
    }),
  });
  assertEquals(result.calls, []);
  assertEquals(result.body.run.status, "completed");
  assertEquals(result.body.run.sources_attempted, 0);
  assertEquals(result.body.run.observability.ingestion.atom_source_attempted, false);
  assertEquals(result.sourceRow.failureCount, 5);
});
