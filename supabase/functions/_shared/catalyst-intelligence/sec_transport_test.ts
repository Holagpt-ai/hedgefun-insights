import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleCatalystIntelRequest } from "./http.ts";
import { createMemoryStore } from "./persistence.ts";
import {
  encodeSecCompanyMap,
  SEC_COMPANY_MAP_CACHE_KEY,
  SEC_COMPANY_MAP_MIN_ISSUERS,
} from "./sec-company-map.ts";
import { parseCompanyTickersExchangeJson } from "../sec-edgar/ingest.ts";
import { isPrimarySecFilingsUrl } from "./sec-transport.ts";
import type { SourceRecord } from "./types.ts";

const NOW = new Date("2026-10-03T15:00:00.000Z");
const ATOM_URL = "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&owner=exclude&count=100&start=0&output=atom";
const MAP_URL = "https://www.sec.gov/files/company_tickers_exchange.json";
const GATEWAY_BASE = "https://sec-gateway.internal";
const GATEWAY_URL = `${GATEWAY_BASE}/v1/sec/latest-filings`;
const GATEWAY_SECRET = "gateway-secret";
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
    pollIntervalSeconds: 180,
    enabled: true,
    priority: 100,
    evidenceTier: "TIER_1_PRIMARY",
    authorityKey: "sec",
    lastSuccessAt: partial.lastSuccessAt ?? new Date(NOW.getTime() - 600_000).toISOString(),
    lastContentHash: null,
    lastEtag: null,
    lastModified: null,
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

function env(mode: "direct" | "gateway", extra?: Record<string, string>) {
  return (key: string) => {
    if (key === "SYNC_SECRET") return "secret";
    if (key === "CATALYST_INTEL_SEC_ENABLED") return "true";
    if (key === "SEC_USER_AGENT") return "Stocksist transport test@example.com";
    if (key === "SEC_TRANSPORT_MODE") return mode === "gateway" ? "gateway" : undefined;
    if (extra && key in extra) return extra[key];
    return undefined;
  };
}

async function invoke(input: {
  mode?: "direct" | "gateway";
  envExtra?: Record<string, string>;
  source?: SourceRecord;
  seedCache?: boolean;
  fetchImpl: (url: string, init?: RequestInit) => Response | Promise<Response>;
}) {
  const store = createMemoryStore();
  await store.saveSource(input.source ?? source());
  if (input.seedCache !== false) await store.saveProviderCache(freshCache());
  const calls: { url: string; headers: Headers }[] = [];
  const response = await handleCatalystIntelRequest(new Request("https://example.test/sec", {
    method: "POST",
    headers: { Authorization: "Bearer secret" },
  }), {
    bot: "sec",
    env: env(input.mode ?? "direct", input.envExtra),
    store,
    now: () => NOW,
    fetchImpl: (async (url, init) => {
      const href = String(url);
      calls.push({ url: href, headers: new Headers(init?.headers) });
      return await input.fetchImpl(href, init);
    }) as typeof fetch,
    sleepFn: () => Promise.resolve(),
  });
  const body = await response.json();
  return { store, body, calls, sourceRow: (await store.listSources({}))[0] };
}

Deno.test("company-map URL stays outside the filings gateway route", () => {
  assertEquals(isPrimarySecFilingsUrl(ATOM_URL), true);
  assertEquals(isPrimarySecFilingsUrl(MAP_URL), false);
  assertEquals(isPrimarySecFilingsUrl("https://example.com/cgi-bin/browse-edgar?action=getcurrent&output=atom"), false);
});

Deno.test("DIRECT mode still fetches the SEC filings URL", async () => {
  const result = await invoke({
    fetchImpl: (url) => {
      if (url === ATOM_URL) return new Response(ATOM, { status: 200, headers: { "content-type": "application/atom+xml" } });
      return new Response("unexpected", { status: 500 });
    },
  });
  assertEquals(result.calls.map((call) => call.url), [ATOM_URL]);
  assertEquals(result.store.events().length, 1);
  assertEquals(result.calls[0].headers.get("authorization"), null);
});

Deno.test("GATEWAY mode sends the filings request only to the gateway with a bearer secret", async () => {
  const result = await invoke({
    mode: "gateway",
    envExtra: { SEC_GATEWAY_BASE_URL: GATEWAY_BASE, SEC_GATEWAY_SECRET: GATEWAY_SECRET },
    fetchImpl: (url) => {
      if (url === GATEWAY_URL) return new Response(ATOM, { status: 200, headers: { "content-type": "application/atom+xml" } });
      return new Response("unexpected", { status: 500 });
    },
  });
  assertEquals(result.calls.map((call) => call.url), [GATEWAY_URL]);
  assertEquals(result.calls[0].headers.get("authorization"), `Bearer ${GATEWAY_SECRET}`);
  assertEquals(result.calls[0].url.includes(GATEWAY_SECRET), false);
  assertEquals(result.store.events().length, 1);
  assertEquals(result.body.run.status, "completed");
});

Deno.test("GATEWAY 429 keeps the filings quiet period after one gateway call", async () => {
  const result = await invoke({
    mode: "gateway",
    envExtra: { SEC_GATEWAY_BASE_URL: GATEWAY_BASE, SEC_GATEWAY_SECRET: GATEWAY_SECRET },
    fetchImpl: () => new Response("slow", { status: 429, headers: { "retry-after": "30" } }),
  });
  assertEquals(result.calls.map((call) => call.url), [GATEWAY_URL]);
  assertEquals(result.body.run.errors[0].category, "provider_rate_limited");
  assertEquals(result.body.run.errors[0].details.backoff_seconds, 600);
  assertEquals(result.body.run.observability.ingestion.sec_filings_rate_limit_floor_applied, true);
  assertEquals(result.sourceRow.backoffUntil, new Date(NOW.getTime() + 600_000).toISOString());
  assertEquals(result.store.events().length, 0);
});

Deno.test("GATEWAY failure does not fall back to direct SEC", async () => {
  const result = await invoke({
    mode: "gateway",
    envExtra: { SEC_GATEWAY_BASE_URL: GATEWAY_BASE, SEC_GATEWAY_SECRET: GATEWAY_SECRET },
    fetchImpl: () => new Response("down", { status: 503 }),
  });
  assertEquals(result.calls.length > 0, true);
  assertEquals(result.calls.every((call) => call.url === GATEWAY_URL), true);
  assertEquals(result.calls.some((call) => call.url === ATOM_URL), false);
  assertEquals(result.store.events().length, 0);
  assertEquals(result.sourceRow.failureCount, 1);
});

Deno.test("GATEWAY mode without a secret makes no SEC or gateway call", async () => {
  const result = await invoke({
    mode: "gateway",
    envExtra: { SEC_GATEWAY_BASE_URL: GATEWAY_BASE },
    fetchImpl: () => new Response(ATOM, { status: 200 }),
  });
  assertEquals(result.calls, []);
  assertEquals(result.store.events().length, 0);
  assertEquals(result.sourceRow.failureCount, 1);
});

Deno.test("a filings wake inside backoff makes zero gateway and zero SEC calls", async () => {
  const result = await invoke({
    mode: "gateway",
    envExtra: { SEC_GATEWAY_BASE_URL: GATEWAY_BASE, SEC_GATEWAY_SECRET: GATEWAY_SECRET },
    source: source({ backoffUntil: new Date(NOW.getTime() + 600_000).toISOString(), failureCount: 1 }),
    fetchImpl: () => new Response(ATOM, { status: 200, headers: { "content-type": "application/atom+xml" } }),
  });
  assertEquals(result.calls, []);
  assertEquals(result.store.events().length, 0);
});
