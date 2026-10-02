import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { secFilingsAdapter } from "./adapters/sec.ts";
import { handleCatalystIntelRequest } from "./http.ts";
import { createMemoryStore } from "./persistence.ts";
import { runCollectorBot } from "./run-bot.ts";
import type { SourceRecord } from "./types.ts";

const NOW = new Date("2026-10-02T22:40:00.000Z");
const ATOM_URL = "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&output=atom";
const MAP_URL = "https://www.sec.gov/files/company_tickers_exchange.json";
const MAP_OK = JSON.stringify({ data: [[1, "Example Hood Markets", "HOOD", "Nasdaq"]] });
const ATOM = `<?xml version="1.0"?><feed><entry>
<title>8-K - EXAMPLE HOOD MARKETS (0000000001) (Issuer)</title>
<link href="https://www.sec.gov/Archives/edgar/data/1/0000000001-26-000001-index.htm"/>
<id>urn:tag:sec.gov,2008:accession-number=0000000001-26-000001</id>
<updated>2026-09-30T14:00:00-04:00</updated>
<summary>Filed: 2026-09-30 AccNo: 0000000001-26-000001 Item 1.01</summary>
<category term="8-K"/>
</entry><entry>
<title>3 - EXAMPLE HOOD MARKETS (0000000001) (Issuer)</title>
<link href="https://www.sec.gov/Archives/edgar/data/1/0000000001-26-000009-index.htm"/>
<id>urn:tag:sec.gov,2008:accession-number=0000000001-26-000009</id>
<updated>2026-09-30T14:01:00-04:00</updated>
<summary>Filed: 2026-09-30 AccNo: 0000000001-26-000009</summary>
<category term="3"/>
</entry></feed>`;

type MapStep = "ok" | "timeout" | "500" | "429" | "403" | "408" | "parse" | "multi" | "missing";

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

function env(userAgent: string | null = "Stocksist test@example.com") {
  return (key: string) => {
    if (key === "SYNC_SECRET") return "secret";
    if (key === "CATALYST_INTEL_SEC_ENABLED") return "true";
    if (key === "SEC_USER_AGENT") return userAgent ?? undefined;
    return undefined;
  };
}

function mapBody(step: MapStep): string {
  if (step === "multi") {
    return JSON.stringify({
      data: [
        [1, "Example Hood Markets", "HOOD", "Nasdaq"],
        [1, "Example Hood Markets", "AAPL", "Nasdaq"],
      ],
    });
  }
  if (step === "missing") return JSON.stringify({ data: [[2, "Other", "MSFT", "Nasdaq"]] });
  if (step === "parse") return "{\"data\":";
  return MAP_OK;
}

function timeoutError(): Error {
  const error = new Error("timed out");
  error.name = "TimeoutError";
  return error;
}

async function invoke(steps: MapStep[], options?: { userAgent?: string | null; source?: SourceRecord }) {
  const store = createMemoryStore();
  await store.saveSource(options?.source ?? source());
  const calls: string[] = [];
  let mapCalls = 0;
  const fetchImpl = (url: string | URL | Request) => {
    const href = String(url);
    calls.push(href);
    assert(!href.includes("polygon.io"));
    if (href === MAP_URL) {
      const step = steps[Math.min(mapCalls, steps.length - 1)];
      mapCalls += 1;
      if (step === "timeout") return Promise.reject(timeoutError());
      if (step === "500" || step === "429" || step === "403" || step === "408") {
        const status = step === "500" ? 500 : step === "429" ? 429 : step === "408" ? 408 : 403;
        return Promise.resolve(new Response("upstream notice", { status, headers: { "content-type": "text/plain" } }));
      }
      return Promise.resolve(new Response(mapBody(step), { status: 200, headers: { "content-type": "application/json" } }));
    }
    return Promise.resolve(new Response(ATOM, { status: 200, headers: { "content-type": "application/atom+xml" } }));
  };
  const started = Date.now();
  const response = await handleCatalystIntelRequest(new Request("https://example.test/sec", {
    method: "POST",
    headers: { Authorization: "Bearer secret" },
  }), {
    bot: "sec",
    env: env(options?.userAgent === undefined ? "Stocksist test@example.com" : options.userAgent),
    store,
    now: () => NOW,
    fetchImpl: fetchImpl as typeof fetch,
    sleepFn: () => Promise.resolve(),
  });
  const body = await response.json();
  return { store, response, body, calls, mapCalls, elapsed: Date.now() - started };
}

function providerError(body: { run: { errors: Array<Record<string, unknown>> } }) {
  return body.run.errors.find((error) => error.category === "sec_provider_dependency_error");
}

Deno.test("SEC company map success creates one filing and skips excluded forms", async () => {
  const result = await invoke(["ok"]);
  assertEquals(result.response.status, 200);
  assertEquals(result.body.run.status, "completed");
  assertEquals(result.body.run.events_created, 1);
  assertEquals(result.store.events().length, 1);
  assertEquals(result.store.events()[0].eventSubtype, "8-K");
  assertEquals(result.mapCalls, 1);
  assert(result.calls.some((url) => url === ATOM_URL));
  assert(result.calls.every((url) => !url.includes("polygon.io")));
  assertEquals((await result.store.listSources({}))[0].failureCount, 0);
});

Deno.test("SEC company map timeout then success retries once", async () => {
  const result = await invoke(["timeout", "ok"]);
  assertEquals(result.response.status, 200);
  assertEquals(result.mapCalls, 2);
  assertEquals(result.body.run.observability.ingestion.sec_company_map_attempts, 2);
  assertEquals(result.body.run.observability.ingestion.sec_company_map_retry_succeeded, true);
  assertEquals(result.body.run.events_created, 1);
  assertEquals(result.store.rawItems().length, 1);
  assertEquals(result.store.events().length, 1);
});

Deno.test("SEC company map 500 then success retries once", async () => {
  const result = await invoke(["500", "ok"]);
  assertEquals(result.response.status, 200);
  assertEquals(result.mapCalls, 2);
  assertEquals(result.body.run.status, "completed");
  assertEquals(result.store.events().length, 1);
});

Deno.test("SEC company map 429 then success retries once", async () => {
  const result = await invoke(["429", "ok"]);
  assertEquals(result.response.status, 200);
  assertEquals(result.mapCalls, 2);
  assertEquals(result.body.run.events_created, 1);
});

Deno.test("SEC company map timeout twice records a failed run", async () => {
  const result = await invoke(["timeout", "timeout"]);
  assertEquals(result.response.status, 502);
  assertEquals(result.body.error, "SEC_PROVIDER_DEPENDENCY_FAILURE");
  assertEquals(result.mapCalls, 2);
  assertEquals(result.calls.some((url) => url === ATOM_URL), false);
  const error = providerError(result.body);
  assertEquals(error?.retryable, true);
  assertEquals((error?.details as { error_type: string }).error_type, "timeout");
  assertEquals((error?.details as { attempt: number }).attempt, 2);
  assertEquals((error?.details as { atom_attempted: boolean }).atom_attempted, false);
  assertEquals(result.body.run.status, "failed");
  assert(result.body.run.completed_at == null || result.body.run.status !== "running");
  const saved = await result.store.getRun(result.body.run.run_id);
  assertEquals(saved?.status, "failed");
  assert(saved?.completedAt != null);
  assertEquals(result.store.rawItems().length, 0);
  assertEquals(result.store.events().length, 0);
  assertEquals((await result.store.listSources({}))[0].failureCount, 0);
  assert(result.elapsed < 5_000);
});

Deno.test("SEC company map 500 twice records a failed run", async () => {
  const result = await invoke(["500", "500"]);
  assertEquals(result.response.status, 502);
  assertEquals(result.mapCalls, 2);
  const error = providerError(result.body);
  assertEquals(error?.status_code, 500);
  assertEquals(error?.retryable, true);
  assertEquals(result.body.run.status, "failed");
  assertEquals(result.store.events().length, 0);
});

Deno.test("SEC company map 403 does not retry", async () => {
  const result = await invoke(["403"]);
  assertEquals(result.response.status, 502);
  assertEquals(result.mapCalls, 1);
  const error = providerError(result.body);
  assertEquals(error?.status_code, 403);
  assertEquals(error?.retryable, false);
  assertEquals((error?.details as { stage: string }).stage, "company_ticker_map");
  assertEquals((error?.details as { error_type: string }).error_type, "http");
  assertEquals((error?.details as { attempt: number }).attempt, 1);
  assertEquals(result.store.rawItems().length, 0);
  assertEquals((await result.store.listSources({}))[0].failureCount, 0);
});

Deno.test("missing SEC_USER_AGENT makes no provider request and no run", async () => {
  const store = createMemoryStore();
  let fetches = 0;
  let saves = 0;
  const baseSave = store.saveRun.bind(store);
  store.saveRun = (run) => {
    saves += 1;
    return baseSave(run);
  };
  const response = await handleCatalystIntelRequest(new Request("https://example.test/sec", {
    method: "POST",
    headers: { Authorization: "Bearer secret" },
  }), {
    bot: "sec",
    env: env(null),
    store,
    fetchImpl: () => {
      fetches += 1;
      return Promise.resolve(new Response(""));
    },
  });
  const body = await response.json();
  assertEquals(response.status, 400);
  assertEquals(body.error, "VALIDATION_ERROR");
  assertEquals(body.message, "SEC_USER_AGENT is required");
  assertEquals(fetches, 0);
  assertEquals(saves, 0);
});

Deno.test("malformed SEC company map fails once without ingest", async () => {
  const result = await invoke(["parse"]);
  assertEquals(result.response.status, 502);
  assertEquals(result.mapCalls, 1);
  const error = providerError(result.body);
  assertEquals((error?.details as { error_type: string }).error_type, "parse");
  assertEquals(error?.retryable, false);
  assertEquals(result.store.rawItems().length, 0);
  assertEquals(result.body.run.status, "failed");
});

Deno.test("SEC wake with no due source does not fetch the company map", async () => {
  const result = await invoke(["ok"], {
    source: source({ lastSuccessAt: NOW.toISOString(), pollIntervalSeconds: 180 }),
  });
  assertEquals(result.response.status, 200);
  assertEquals(result.body.run.status, "completed");
  assertEquals(result.body.run.sources_attempted, 0);
  assertEquals(result.mapCalls, 0);
  assertEquals(result.calls.length, 0);
  assertEquals(result.body.run.observability.ingestion.sec_company_map_attempts, 0);
  assertEquals(result.body.run.observability.ingestion.atom_source_attempted, false);
});

Deno.test("missing CIK mapping stays unresolved", async () => {
  const result = await invoke(["missing"]);
  assertEquals(result.response.status, 200);
  assertEquals(result.store.events().length, 0);
  assertEquals(result.store.rawItems().length, 1);
  assertEquals(result.body.run.observability.ingestion.unresolved_attribution_reasons.NO_CIK_TICKER_MAPPING, 1);
});

Deno.test("multiple CIK tickers stay unresolved", async () => {
  const result = await invoke(["multi"]);
  assertEquals(result.response.status, 200);
  assertEquals(result.store.events().length, 0);
  assertEquals(result.body.run.observability.ingestion.unresolved_attribution_reasons.MULTIPLE_CIK_TICKERS, 1);
});

Deno.test("unchanged SEC atom does not insert a second filing", async () => {
  const store = createMemoryStore();
  await store.saveSource(source());
  const fetchImpl = () => Promise.resolve(new Response(ATOM, { status: 200 }));
  const run = () => runCollectorBot({
    bot: "sec",
    adapter: secFilingsAdapter,
    store,
    now: NOW,
    userAgent: "Stocksist test@example.com",
    fetchImpl: (url) => String(url) === MAP_URL
      ? Promise.resolve(new Response(MAP_OK, { status: 200, headers: { "content-type": "application/json" } }))
      : fetchImpl(),
    batchLimit: 1,
    sleepFn: () => Promise.resolve(),
  });
  const first = await run();
  const second = await run();
  assertEquals(first.eventsCreated, 1);
  assertEquals(second.eventsCreated, 0);
  assertEquals(second.newItems, 0);
  assertEquals(second.duplicates, 1);
  assertEquals(store.rawItems().length, 1);
  assertEquals(store.events().length, 1);
});
