import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { secFilingsAdapter } from "./adapters/sec.ts";
import { handleCatalystIntelRequest } from "./http.ts";
import { createMemoryStore, type ProviderCacheRecord } from "./persistence.ts";
import { runCollectorBot } from "./run-bot.ts";
import {
  decodeSecCompanyMap,
  encodeSecCompanyMap,
  SEC_COMPANY_MAP_CACHE_KEY,
  SEC_COMPANY_MAP_MIN_ISSUERS,
  secCompanyMapRetryDelayMs,
} from "./sec-company-map.ts";
import { parseCompanyTickersExchangeJson } from "../sec-edgar/ingest.ts";
import type { SourceRecord } from "./types.ts";

const NOW = new Date("2026-10-02T22:40:00.000Z");
const ATOM_URL = "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&output=atom";
const MAP_URL = "https://www.sec.gov/files/company_tickers_exchange.json";
const HOUR_MS = 3_600_000;
const ATOM = `<?xml version="1.0"?><feed><entry>
<title>8-K - EXAMPLE HOOD MARKETS (0000000001) (Issuer)</title>
<link href="https://www.sec.gov/Archives/edgar/data/1/0000000001-26-000001-index.htm"/>
<id>urn:tag:sec.gov,2008:accession-number=0000000001-26-000001</id>
<updated>2026-09-30T14:00:00-04:00</updated>
<summary>Filed: 2026-09-30 AccNo: 0000000001-26-000001 Item 1.01</summary>
<category term="8-K"/>
</entry></feed>`;

function exchangeRows(rows: unknown[][], count = SEC_COMPANY_MAP_MIN_ISSUERS): unknown[][] {
  const data = rows.map((row) => [...row]);
  const seen = new Set(data.map((row) => String(row[0]).replace(/\D/g, "").padStart(10, "0")));
  let i = 0;
  while (seen.size < count) {
    i += 1;
    const cik = 500000 + i;
    const padded = String(cik).padStart(10, "0");
    if (seen.has(padded)) continue;
    seen.add(padded);
    data.push([cik, `Issuer ${cik}`, `Q${String(i).padStart(4, "0")}`, "Nasdaq"]);
  }
  return data;
}

function exchangeJson(rows: unknown[][], count = SEC_COMPANY_MAP_MIN_ISSUERS): string {
  return JSON.stringify({ data: exchangeRows(rows, count) });
}

function encoded(rows: unknown[][], count = SEC_COMPANY_MAP_MIN_ISSUERS) {
  const parsed = parseCompanyTickersExchangeJson({ data: exchangeRows(rows, count) });
  const map = new Map<string, string[]>();
  for (const [cik, list] of parsed) map.set(cik, list.map((row) => row.ticker));
  return encodeSecCompanyMap(map);
}

function source(partial: Partial<SourceRecord> = {}): SourceRecord {
  return {
    id: partial.id ?? "sec-src",
    sourceKey: "sec-latest-filings",
    companyName: null,
    ticker: null,
    cik: null,
    sourceType: "SEC_FILINGS",
    url: ATOM_URL,
    hostname: "www.sec.gov",
    feedFormat: "sec_atom",
    pollIntervalSeconds: partial.pollIntervalSeconds ?? 0,
    enabled: partial.enabled ?? true,
    priority: 100,
    evidenceTier: "TIER_1_PRIMARY",
    authorityKey: "sec",
    lastSuccessAt: partial.lastSuccessAt ?? null,
    lastContentHash: null,
    lastEtag: null,
    lastModified: null,
    failureCount: partial.failureCount ?? 0,
    backoffUntil: null,
    lastErrorCategory: null,
    metadata: {},
  };
}

function env() {
  return (key: string) => {
    if (key === "SYNC_SECRET") return "secret";
    if (key === "CATALYST_INTEL_SEC_ENABLED") return "true";
    if (key === "SEC_USER_AGENT") return "Stocksist test@example.com";
    return undefined;
  };
}

type Scripted =
  | { kind: "json"; body: string }
  | { kind: "status"; status: number; retryAfter?: string }
  | { kind: "timeout" }
  | { kind: "html" };

function timeoutError(): Error {
  const error = new Error("timed out");
  error.name = "TimeoutError";
  return error;
}

async function invoke(input: {
  steps?: Scripted[];
  cache?: ProviderCacheRecord | null;
  source?: SourceRecord;
}) {
  const store = createMemoryStore();
  await store.saveSource(input.source ?? source());
  if (input.cache) await store.saveProviderCache(input.cache);
  const before = await store.getProviderCache(SEC_COMPANY_MAP_CACHE_KEY);
  const calls: string[] = [];
  const delays: number[] = [];
  let mapCalls = 0;
  let cacheReads = 0;
  const readCache = store.getProviderCache.bind(store);
  store.getProviderCache = async (key) => {
    cacheReads += 1;
    return readCache(key);
  };
  const steps = input.steps ?? [];
  const fetchImpl = (url: string | URL | Request) => {
    const href = String(url);
    calls.push(href);
    if (href !== MAP_URL) {
      return Promise.resolve(new Response(ATOM, { status: 200, headers: { "content-type": "application/atom+xml" } }));
    }
    const step = steps[Math.min(mapCalls, Math.max(steps.length - 1, 0))];
    mapCalls += 1;
    if (!step || step.kind === "timeout") return Promise.reject(timeoutError());
    if (step.kind === "html") {
      return Promise.resolve(new Response("<html>unavailable</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }));
    }
    if (step.kind === "status") {
      const headers = new Headers({ "content-type": "text/plain" });
      if (step.retryAfter) headers.set("retry-after", step.retryAfter);
      return Promise.resolve(new Response("upstream notice", { status: step.status, headers }));
    }
    return Promise.resolve(new Response(step.body, { status: 200, headers: { "content-type": "application/json" } }));
  };
  const response = await handleCatalystIntelRequest(new Request("https://example.test/sec", {
    method: "POST",
    headers: { Authorization: "Bearer secret" },
  }), {
    bot: "sec",
    env: env(),
    store,
    now: () => NOW,
    fetchImpl: fetchImpl as typeof fetch,
    sleepFn: (ms: number) => {
      delays.push(ms);
      return Promise.resolve();
    },
  });
  const body = await response.json();
  const saved = await store.listSources({});
  return { store, response, body, calls, mapCalls, cacheReads, delays, before, sourceRow: saved[0] };
}

function cacheRecord(rows: unknown[][], ageMs: number, count = SEC_COMPANY_MAP_MIN_ISSUERS): ProviderCacheRecord {
  return {
    cacheKey: SEC_COMPANY_MAP_CACHE_KEY,
    payload: encoded(rows, count),
    refreshedAt: new Date(NOW.getTime() - ageMs).toISOString(),
  };
}

function ingestion(body: { run: { observability: { ingestion: Record<string, unknown> } } }) {
  return body.run.observability.ingestion;
}

function mapError(body: { run: { errors: Array<Record<string, unknown>> } }) {
  return body.run.errors.find((error) => error.source_id === "sec-company-map");
}

Deno.test("429 retry delay honors Retry-After and stays capped", () => {
  const now = NOW.getTime();
  assertEquals(secCompanyMapRetryDelayMs(429, null, now), 5_000);
  assertEquals(secCompanyMapRetryDelayMs(429, "3", now), 3_000);
  assertEquals(secCompanyMapRetryDelayMs(429, "30", now), 10_000);
  assertEquals(secCompanyMapRetryDelayMs(429, new Date(now + 4_000).toUTCString(), now), 4_000);
  assertEquals(secCompanyMapRetryDelayMs(429, new Date(now + 30_000).toUTCString(), now), 10_000);
  assertEquals(secCompanyMapRetryDelayMs(500, null, now), 350);
  assertEquals(secCompanyMapRetryDelayMs(403, "3", now), 350);
});

Deno.test("fresh SEC company map cache skips the provider request", async () => {
  const result = await invoke({
    cache: cacheRecord([[1, "Example Hood Markets", "HOOD", "Nasdaq"]], HOUR_MS),
    steps: [{ kind: "status", status: 500 }],
  });
  assertEquals(result.response.status, 200);
  assertEquals(result.body.run.status, "completed");
  assertEquals(result.mapCalls, 0);
  assertEquals(result.calls.some((url: string) => url === ATOM_URL), true);
  assertEquals(result.store.events().length, 1);
  const obs = ingestion(result.body);
  assertEquals(obs.sec_company_map_source, "cache");
  assertEquals(obs.sec_company_map_state, "cache_fresh");
  assertEquals(obs.sec_company_map_attempts, 0);
  assertEquals(obs.sec_company_map_refresh_attempted, false);
  assertEquals(obs.sec_company_map_age_seconds, 3_600);
  assertEquals(obs.atom_source_attempted, true);
  assertEquals(result.sourceRow.failureCount, 0);
});

Deno.test("missing SEC company map cache stores a validated live mapping", async () => {
  const result = await invoke({
    steps: [{ kind: "json", body: exchangeJson([[1, "Example Hood Markets", "HOOD", "Nasdaq"]]) }],
  });
  assertEquals(result.response.status, 200);
  assertEquals(result.mapCalls, 1);
  assertEquals(result.store.events().length, 1);
  const saved = await result.store.getProviderCache(SEC_COMPANY_MAP_CACHE_KEY);
  const decoded = decodeSecCompanyMap(saved?.payload);
  assertEquals(decoded?.get("0000000001"), ["HOOD"]);
  assertEquals(decoded?.size, SEC_COMPANY_MAP_MIN_ISSUERS);
  const obs = ingestion(result.body);
  assertEquals(obs.sec_company_map_source, "live_refresh");
  assertEquals(obs.sec_company_map_state, "cache_refreshed");
  assertEquals(obs.sec_company_map_attempts, 1);
  assertEquals(obs.atom_source_attempted, true);
});

Deno.test("stale SEC company map refreshes and replaces the cached mapping", async () => {
  const result = await invoke({
    cache: cacheRecord([[1, "Other Issuer", "MSFT", "Nasdaq"]], 8 * HOUR_MS),
    steps: [{ kind: "json", body: exchangeJson([[1, "Example Hood Markets", "HOOD", "Nasdaq"]]) }],
  });
  assertEquals(result.mapCalls, 1);
  assertEquals(result.response.status, 200);
  assertEquals(result.store.events().length, 1);
  const tickers = await result.store.listTickers(result.store.events()[0].id);
  assertEquals(tickers.some((row) => row.ticker === "HOOD"), true);
  assertEquals(tickers.some((row) => row.ticker === "MSFT"), false);
  const saved = decodeSecCompanyMap((await result.store.getProviderCache(SEC_COMPANY_MAP_CACHE_KEY))?.payload);
  assertEquals(saved?.get("0000000001"), ["HOOD"]);
  const obs = ingestion(result.body);
  assertEquals(obs.sec_company_map_states, ["cache_stale_refresh_attempted", "cache_refreshed"]);
  assertEquals(obs.sec_company_map_source, "live_refresh");
  assertEquals(obs.sec_company_map_age_seconds, 0);
});

Deno.test("stale SEC company map uses last-known-good after two 429 attempts", async () => {
  const result = await invoke({
    cache: cacheRecord([[1, "Example Hood Markets", "HOOD", "Nasdaq"]], 8 * HOUR_MS),
    steps: [{ kind: "status", status: 429 }, { kind: "status", status: 429 }],
  });
  assertEquals(result.mapCalls, 2);
  assertEquals(result.delays, [5_000]);
  assertEquals(result.response.status, 200);
  assertEquals(result.body.run.status, "completed");
  assertEquals(result.store.events().length, 1);
  assertEquals(result.calls.some((url: string) => url === ATOM_URL), true);
  assertEquals(result.sourceRow.failureCount, 0);
  assertEquals(result.sourceRow.lastErrorCategory, null);
  const obs = ingestion(result.body);
  assertEquals(obs.sec_company_map_source, "lkg_fallback");
  assertEquals(obs.sec_company_map_state, "cache_lkg_fallback");
  assertEquals(obs.sec_company_map_states, ["cache_stale_refresh_attempted", "provider_429", "cache_lkg_fallback"]);
  assertEquals(obs.sec_company_map_provider_condition, "provider_429");
  assertEquals(obs.sec_company_map_http_status, 429);
  assertEquals(obs.sec_company_map_attempts, 2);
  assertEquals(obs.sec_company_map_age_seconds, 8 * 3_600);
  assertEquals(obs.atom_source_attempted, true);
  assertEquals(obs.sec_company_map_retry_succeeded, undefined);
  const error = mapError(result.body);
  assertEquals(error?.category, "sec_provider_dependency_error");
  assertEquals((error?.details as { map_source: string }).map_source, "lkg_fallback");
  assertEquals((error?.details as { atom_attempted: boolean }).atom_attempted, true);
  assertEquals(result.body.run.errors.some((error: { source_id: string }) => error.source_id === "sec-src"), false);
  const saved = await result.store.getProviderCache(SEC_COMPANY_MAP_CACHE_KEY);
  assertEquals(saved?.refreshedAt, result.before?.refreshedAt);
});

Deno.test("stale SEC company map honors a short Retry-After on 429", async () => {
  const result = await invoke({
    cache: cacheRecord([[1, "Example Hood Markets", "HOOD", "Nasdaq"]], 8 * HOUR_MS),
    steps: [{ kind: "status", status: 429, retryAfter: "3" }, { kind: "status", status: 429, retryAfter: "30" }],
  });
  assertEquals(result.mapCalls, 2);
  assertEquals(result.delays, [3_000]);
  assertEquals(result.body.run.status, "completed");
  assertEquals(ingestion(result.body).sec_company_map_source, "lkg_fallback");
});

Deno.test("stale SEC company map uses last-known-good after one 403", async () => {
  const result = await invoke({
    cache: cacheRecord([[1, "Example Hood Markets", "HOOD", "Nasdaq"]], 8 * HOUR_MS),
    steps: [{ kind: "status", status: 403 }, { kind: "status", status: 403 }],
  });
  assertEquals(result.mapCalls, 1);
  assertEquals(result.delays, []);
  assertEquals(result.response.status, 200);
  assertEquals(result.store.events().length, 1);
  assertEquals(result.sourceRow.failureCount, 0);
  const obs = ingestion(result.body);
  assertEquals(obs.sec_company_map_provider_condition, "provider_403");
  assertEquals(obs.sec_company_map_source, "lkg_fallback");
  assertEquals(obs.atom_source_attempted, true);
});

Deno.test("stale SEC company map uses last-known-good after bounded 5xx retries", async () => {
  const result = await invoke({
    cache: cacheRecord([[1, "Example Hood Markets", "HOOD", "Nasdaq"]], 8 * HOUR_MS),
    steps: [{ kind: "status", status: 500 }, { kind: "status", status: 503 }],
  });
  assertEquals(result.mapCalls, 2);
  assertEquals(result.delays, [350]);
  assertEquals(result.body.run.status, "completed");
  assertEquals(ingestion(result.body).sec_company_map_provider_condition, "provider_5xx");
  assertEquals(ingestion(result.body).sec_company_map_http_status, 503);
  assertEquals(ingestion(result.body).sec_company_map_source, "lkg_fallback");
  assertEquals(result.sourceRow.failureCount, 0);
});

Deno.test("stale SEC company map uses last-known-good after timeout", async () => {
  const result = await invoke({
    cache: cacheRecord([[1, "Example Hood Markets", "HOOD", "Nasdaq"]], 8 * HOUR_MS),
    steps: [{ kind: "timeout" }, { kind: "timeout" }],
  });
  assertEquals(result.mapCalls, 2);
  assertEquals(result.body.run.status, "completed");
  assertEquals(result.store.events().length, 1);
  assertEquals(ingestion(result.body).sec_company_map_provider_condition, "provider_timeout");
  assertEquals(ingestion(result.body).sec_company_map_error_type, "timeout");
  assertEquals(ingestion(result.body).atom_source_attempted, true);
});

Deno.test("expired SEC company map fails closed without the Atom feed", async () => {
  const seeded = cacheRecord([[1, "Example Hood Markets", "HOOD", "Nasdaq"]], 25 * HOUR_MS);
  const result = await invoke({
    cache: seeded,
    steps: [{ kind: "status", status: 429 }, { kind: "status", status: 429 }],
  });
  assertEquals(result.response.status, 502);
  assertEquals(result.body.error, "SEC_PROVIDER_DEPENDENCY_FAILURE");
  assertEquals(result.body.run.status, "failed");
  assertEquals(result.mapCalls, 2);
  assertEquals(result.calls.some((url: string) => url === ATOM_URL), false);
  assertEquals(result.store.rawItems().length, 0);
  assertEquals(result.sourceRow.failureCount, 0);
  const obs = ingestion(result.body);
  assertEquals(obs.sec_company_map_state, "cache_expired");
  assertEquals(obs.sec_company_map_provider_condition, "provider_429");
  assertEquals(obs.atom_source_attempted, false);
  const saved = await result.store.getProviderCache(SEC_COMPANY_MAP_CACHE_KEY);
  assertEquals(saved?.refreshedAt, seeded.refreshedAt);
  assertEquals(saved?.payload, seeded.payload);
});

Deno.test("missing SEC company map fails closed when the provider fails", async () => {
  const result = await invoke({
    steps: [{ kind: "status", status: 429 }, { kind: "status", status: 429 }],
  });
  assertEquals(result.response.status, 502);
  assertEquals(result.mapCalls, 2);
  assertEquals(result.calls.some((url: string) => url === ATOM_URL), false);
  assertEquals(result.store.events().length, 0);
  assertEquals(await result.store.getProviderCache(SEC_COMPANY_MAP_CACHE_KEY), null);
  const obs = ingestion(result.body);
  assertEquals(obs.sec_company_map_state, "cache_missing");
  assertEquals(obs.sec_company_map_provider_condition, "provider_429");
  assertEquals(obs.atom_source_attempted, false);
  assertEquals(result.sourceRow.failureCount, 0);
});

Deno.test("invalid SEC company map refresh preserves the last-known-good cache", async () => {
  const seeded = cacheRecord([[1, "Example Hood Markets", "HOOD", "Nasdaq"]], 8 * HOUR_MS);
  const html = await invoke({ cache: seeded, steps: [{ kind: "html" }, { kind: "html" }] });
  assertEquals(html.mapCalls, 1);
  assertEquals(html.body.run.status, "completed");
  assertEquals(html.store.events().length, 1);
  assertEquals(ingestion(html.body).sec_company_map_provider_condition, "provider_malformed");
  assertEquals(ingestion(html.body).sec_company_map_source, "lkg_fallback");
  const afterHtml = await html.store.getProviderCache(SEC_COMPANY_MAP_CACHE_KEY);
  assertEquals(afterHtml?.payload, seeded.payload);
  assertEquals(afterHtml?.refreshedAt, seeded.refreshedAt);

  const tiny = await invoke({
    cache: seeded,
    steps: [{ kind: "json", body: exchangeJson([[1, "Example Hood Markets", "ZZZZ", "Nasdaq"]], 999) }],
  });
  assertEquals(tiny.mapCalls, 1);
  assertEquals(tiny.store.events().length, 1);
  const tickers = await tiny.store.listTickers(tiny.store.events()[0].id);
  assertEquals(tickers.some((row) => row.ticker === "HOOD"), true);
  assertEquals(tickers.some((row) => row.ticker === "ZZZZ"), false);
  const afterTiny = await tiny.store.getProviderCache(SEC_COMPANY_MAP_CACHE_KEY);
  assertEquals(afterTiny?.payload, seeded.payload);
  assertEquals(ingestion(tiny.body).sec_company_map_state, "cache_lkg_fallback");
});

Deno.test("multiple SEC ticker candidates stay unresolved through the cache", async () => {
  const rows = [
    [1, "Example Hood Markets", "HOOD", "Nasdaq"],
    [1, "Example Hood Markets", "AAPL", "Nasdaq"],
  ];
  const fresh = await invoke({ cache: cacheRecord(rows, HOUR_MS) });
  assertEquals(fresh.mapCalls, 0);
  assertEquals(fresh.store.events().length, 0);
  assertEquals(fresh.body.run.observability.ingestion.unresolved_attribution_reasons.MULTIPLE_CIK_TICKERS, 1);
  const cached = decodeSecCompanyMap((await fresh.store.getProviderCache(SEC_COMPANY_MAP_CACHE_KEY))?.payload);
  assertEquals(cached?.get("0000000001"), ["AAPL", "HOOD"]);

  const live = await invoke({ steps: [{ kind: "json", body: exchangeJson(rows) }] });
  const stored = decodeSecCompanyMap((await live.store.getProviderCache(SEC_COMPANY_MAP_CACHE_KEY))?.payload);
  assertEquals(stored?.get("0000000001"), ["AAPL", "HOOD"]);
  assertEquals(live.store.events().length, 0);
  assertEquals(live.body.run.observability.ingestion.unresolved_attribution_reasons.MULTIPLE_CIK_TICKERS, 1);
});

Deno.test("a not-due SEC source does not read or refresh the company map", async () => {
  let reads = 0;
  const store = createMemoryStore();
  await store.saveSource(source({ lastSuccessAt: NOW.toISOString(), pollIntervalSeconds: 180 }));
  await store.saveProviderCache(cacheRecord([[1, "Example Hood Markets", "HOOD", "Nasdaq"]], 8 * HOUR_MS));
  const readCache = store.getProviderCache.bind(store);
  store.getProviderCache = async (key) => {
    reads += 1;
    return readCache(key);
  };
  let fetches = 0;
  const response = await handleCatalystIntelRequest(new Request("https://example.test/sec", {
    method: "POST",
    headers: { Authorization: "Bearer secret" },
  }), {
    bot: "sec",
    env: env(),
    store,
    now: () => NOW,
    fetchImpl: () => {
      fetches += 1;
      return Promise.resolve(new Response("", { status: 500 }));
    },
    sleepFn: () => Promise.resolve(),
  });
  const body = await response.json();
  assertEquals(response.status, 200);
  assertEquals(body.run.status, "completed");
  assertEquals(reads, 0);
  assertEquals(fetches, 0);
  assertEquals(body.run.observability.ingestion.atom_source_attempted, false);
  assertEquals(body.run.observability.ingestion.sec_company_map_attempts, 0);
});

Deno.test("corrupt SEC company map cache cannot be used when refresh fails", async () => {
  const result = await invoke({
    cache: {
      cacheKey: SEC_COMPANY_MAP_CACHE_KEY,
      payload: { version: 1, entries: [] },
      refreshedAt: new Date(NOW.getTime() - HOUR_MS).toISOString(),
    },
    steps: [{ kind: "status", status: 429 }, { kind: "status", status: 429 }],
  });
  assertEquals(result.response.status, 502);
  assertEquals(result.mapCalls, 2);
  assertEquals(result.calls.some((url: string) => url === ATOM_URL), false);
  assertEquals(ingestion(result.body).sec_company_map_state, "cache_validation_failed");
  assertEquals(ingestion(result.body).sec_company_map_provider_condition, "provider_429");
  const saved = await result.store.getProviderCache(SEC_COMPANY_MAP_CACHE_KEY);
  assertEquals(saved?.payload, { version: 1, entries: [] });
});

Deno.test("direct collector reuse of a fresh cache does not download the map again", async () => {
  const store = createMemoryStore();
  await store.saveSource(source());
  let mapCalls = 0;
  const run = () => runCollectorBot({
    bot: "sec",
    adapter: secFilingsAdapter,
    store,
    now: NOW,
    userAgent: "Stocksist test@example.com",
    fetchImpl: (url) => {
      if (String(url) === MAP_URL) {
        mapCalls += 1;
        return Promise.resolve(new Response(
          exchangeJson([[1, "Example Hood Markets", "HOOD", "Nasdaq"]]),
          { status: 200, headers: { "content-type": "application/json" } },
        ));
      }
      return Promise.resolve(new Response(ATOM, { status: 200 }));
    },
    batchLimit: 1,
    sleepFn: () => Promise.resolve(),
  });
  const first = await run();
  const second = await run();
  assertEquals(first.eventsCreated, 1);
  assertEquals(second.eventsCreated, 0);
  assertEquals(second.duplicates, 1);
  assertEquals(mapCalls, 1);
  assert(second.observability);
});
