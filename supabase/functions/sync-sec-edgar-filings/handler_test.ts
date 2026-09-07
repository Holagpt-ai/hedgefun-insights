import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  SEC_COMPANY_TICKERS_EXCHANGE_URL,
  SEC_LATEST_FILINGS_ATOM_URL,
  secDedupeKey,
} from "../_shared/sec-edgar/ingest.ts";
import {
  handleSyncSecEdgarFilings,
  resetSecEdgarCikCacheForTests,
  type SecEdgarStore,
} from "./handler.ts";

const SYNC_SECRET = "test-sync-secret";
const FEED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>8-K - NVIDIA CORP (0001045810) (Filer)</title>
    <link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/1045810/000104581026000001/0001045810-26-000001-index.htm" />
    <id>urn:tag:sec.gov,2008:accession-number=0001045810-26-000001</id>
    <updated>2026-09-07T13:17:00-04:00</updated>
    <summary type="html">Filed: 2026-09-07 AccNo: 0001045810-26-000001</summary>
    <category scheme="https://www.sec.gov/" term="8-K" />
  </entry>
  <entry>
    <title>10-Q - ALPHA CLASS INC (0000002222) (Filer)</title>
    <link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/2222/000000222226000100/0000002222-26-000100-index.htm" />
    <id>urn:tag:sec.gov,2008:accession-number=0000002222-26-000100</id>
    <updated>2026-09-07T13:18:00-04:00</updated>
    <summary type="html">Filed: 2026-09-07 AccNo: 0000002222-26-000100</summary>
    <category scheme="https://www.sec.gov/" term="10-Q" />
  </entry>
</feed>`;

const CIK_JSON = JSON.stringify({
  fields: ["cik", "name", "ticker", "exchange"],
  data: [
    [1045810, "NVIDIA CORP", "NVDA", "Nasdaq"],
    [2222, "ALPHA CLASS INC", "ALPHA", "NYSE"],
  ],
});

function envMap(extra: Record<string, string | undefined> = {}) {
  const base: Record<string, string | undefined> = {
    SYNC_SECRET,
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    SEC_USER_AGENT: "Stocksist/1.0 test@example.com",
    SEC_EDGAR_WRITE_ENABLED: extra.SEC_EDGAR_WRITE_ENABLED,
    ...extra,
  };
  return (key: string) => base[key];
}

function fetchSpy() {
  const urls: string[] = [];
  const fetchFn: typeof fetch = (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    urls.push(url);
    if (url === SEC_LATEST_FILINGS_ATOM_URL) {
      return Promise.resolve(new Response(FEED_XML, { status: 200 }));
    }
    if (url === SEC_COMPANY_TICKERS_EXCHANGE_URL) {
      return Promise.resolve(new Response(CIK_JSON, { status: 200 }));
    }
    return Promise.resolve(new Response("unexpected", { status: 500 }));
  };
  return { urls, fetchFn };
}

function memoryStore(existing: string[] = []): SecEdgarStore & { inserts: Record<string, unknown>[][] } {
  const inserts: Record<string, unknown>[][] = [];
  return {
    inserts,
    findExistingDedupeKeys: async (keys) => new Set(keys.filter((k) => existing.includes(k))),
    insertNewRows: async (rows) => {
      inserts.push(rows);
      return rows.length;
    },
  };
}

async function invoke(
  body: string | null,
  opts: {
    env?: Record<string, string | undefined>;
    store?: ReturnType<typeof memoryStore>;
    fetch?: ReturnType<typeof fetchSpy>;
  } = {},
) {
  resetSecEdgarCikCacheForTests();
  const fetch = opts.fetch ?? fetchSpy();
  const store = opts.store ?? memoryStore();
  const req = new Request("http://localhost/sync-sec-edgar-filings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SYNC_SECRET}`,
      "Content-Type": "application/json",
    },
    body,
  });
  const res = await handleSyncSecEdgarFilings(req, {
    env: envMap(opts.env),
    fetchFn: fetch.fetchFn,
    store,
  });
  const json = await res.json();
  return { res, json, store, fetch };
}

Deno.test("no mode defaults to dry_run and performs zero writes", async () => {
  const { res, json, store } = await invoke(null);
  assertEquals(res.status, 200);
  assertEquals(json.mode, "dry_run");
  assertEquals(json.rows_upserted, 0);
  assertEquals(store.inserts.length, 0);
  assert(json.rows_would_insert >= 1);
});

Deno.test("dry_run compares existing keys and does not insert", async () => {
  const existing = [secDedupeKey("0001045810-26-000001", "NVDA")];
  const { res, json, store } = await invoke('{"mode":"dry_run"}', {
    store: memoryStore(existing),
  });
  assertEquals(res.status, 200);
  assertEquals(json.mode, "dry_run");
  assertEquals(json.rows_existing, 1);
  assertEquals(json.rows_would_insert, 1);
  assertEquals(json.rows_upserted, 0);
  assertEquals(store.inserts.length, 0);
});

Deno.test("write requested with switch false returns WRITE_DISABLED", async () => {
  const { res, json, store } = await invoke('{"mode":"write"}', {
    env: { SEC_EDGAR_WRITE_ENABLED: "false" },
  });
  assertEquals(res.status, 409);
  assertEquals(json.error, "WRITE_DISABLED");
  assertEquals(store.inserts.length, 0);
});

Deno.test("write requested with switch true uses persistence path", async () => {
  const { res, json, store } = await invoke('{"mode":"write"}', {
    env: { SEC_EDGAR_WRITE_ENABLED: "true" },
  });
  assertEquals(res.status, 200);
  assertEquals(json.mode, "write");
  assertEquals(store.inserts.length, 1);
  assert(json.rows_upserted >= 1);
});

Deno.test("unknown mode is rejected before any SEC request", async () => {
  const fetch = fetchSpy();
  const { res, json } = await invoke('{"mode":"live"}', { fetch });
  assertEquals(res.status, 400);
  assertEquals(json.error, "VALIDATION_ERROR");
  assertEquals(fetch.urls.length, 0);
});

Deno.test("request cannot override SEC endpoint URLs", async () => {
  const fetch = fetchSpy();
  const { res } = await invoke(
    '{"mode":"dry_run","url":"https://evil.example/atom"}',
    { fetch },
  );
  assertEquals(res.status, 400);
  assertEquals(fetch.urls.length, 0);

  const ok = await invoke('{"mode":"dry_run"}', { fetch: fetchSpy() });
  assertEquals(ok.res.status, 200);
  assertEquals(
    ok.fetch.urls.every((u) =>
      u === SEC_LATEST_FILINGS_ATOM_URL || u === SEC_COMPANY_TICKERS_EXCHANGE_URL
    ),
    true,
  );
});

Deno.test("holiday has no special disable behavior", async () => {
  const { res, json } = await invoke('{"mode":"dry_run"}');
  assertEquals(res.status, 200);
  assertEquals(json.mode, "dry_run");
  assertEquals(json.error, undefined);
});
