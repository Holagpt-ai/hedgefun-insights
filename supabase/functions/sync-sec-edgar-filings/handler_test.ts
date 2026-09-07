import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildLatestFilingsAtomUrl,
  SEC_COMPANY_TICKERS_EXCHANGE_URL,
  SEC_LATEST_FILINGS_ATOM_URL,
  secDedupeKey,
} from "../_shared/sec-edgar/ingest.ts";
import { SEC_EDGAR_STREAM_KEY, type SecEdgarCheckpoint } from "../_shared/sec-edgar/checkpoint.ts";
import {
  handleSyncSecEdgarFilings,
  resetSecEdgarCikCacheForTests,
  type SecEdgarStore,
} from "./handler.ts";

const SYNC_SECRET = "test-sync-secret";
const NVDA_ACC = "0001045810-26-000001";
const ALPHA_ACC = "0000002222-26-000100";
const OLD_ACC = "0001045810-26-000099";

function entryXml(form: string, name: string, cik: string, acc: string): string {
  return `
  <entry>
    <title>${form} - ${name} (${cik}) (Filer)</title>
    <link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${acc.replaceAll("-", "")}/${acc}-index.htm" />
    <id>urn:tag:sec.gov,2008:accession-number=${acc}</id>
    <updated>2026-09-07T13:17:00-04:00</updated>
    <summary type="html">Filed: 2026-09-07 AccNo: ${acc}</summary>
    <category scheme="https://www.sec.gov/" term="${form}" />
  </entry>`;
}

function feedXml(entries: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom">${entries}</feed>`;
}

const PAGE0 = feedXml(
  entryXml("8-K", "NVIDIA CORP", "0001045810", NVDA_ACC) +
    entryXml("4", "IGNORE FORM", "0001045810", "0001045810-26-000003"),
);
const PAGE1 = feedXml(entryXml("10-Q", "ALPHA CLASS INC", "0000002222", ALPHA_ACC));
const PAGE2 = feedXml(entryXml("8-K/A", "NVIDIA CORP", "0001045810", OLD_ACC));

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

function fetchByStart(pages: Record<number, string | "error"> = { 0: PAGE0 }) {
  const urls: string[] = [];
  const fetchFn: typeof fetch = (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    urls.push(url);
    if (url === SEC_COMPANY_TICKERS_EXCHANGE_URL) {
      return Promise.resolve(new Response(CIK_JSON, { status: 200 }));
    }
    let start = 0;
    try {
      start = Number(new URL(url).searchParams.get("start") ?? "0");
    } catch {
      start = 0;
    }
    const page = pages[start];
    if (page === "error") return Promise.resolve(new Response("down", { status: 500 }));
    if (typeof page === "string") return Promise.resolve(new Response(page, { status: 200 }));
    return Promise.resolve(new Response("unexpected", { status: 500 }));
  };
  return { urls, fetchFn };
}

function memoryStore(
  opts: {
    existing?: string[];
    checkpoint?: SecEdgarCheckpoint | null;
    insertFails?: boolean;
    saveFails?: boolean;
    loadFails?: boolean;
  } = {},
): SecEdgarStore & {
  inserts: Record<string, unknown>[][];
  saves: SecEdgarCheckpoint[];
  loads: number;
  finds: number;
} {
  const inserts: Record<string, unknown>[][] = [];
  const saves: SecEdgarCheckpoint[] = [];
  let loads = 0;
  let finds = 0;
  return {
    inserts,
    saves,
    get loads() {
      return loads;
    },
    get finds() {
      return finds;
    },
    findExistingDedupeKeys: async (keys) => {
      finds += 1;
      return new Set(keys.filter((k) => (opts.existing ?? []).includes(k)));
    },
    insertNewRows: async (rows) => {
      if (opts.insertFails) return null;
      inserts.push(rows);
      return rows.length;
    },
    loadCheckpoint: async () => {
      loads += 1;
      if (opts.loadFails) return { ok: false };
      return { ok: true, checkpoint: opts.checkpoint ?? null };
    },
    saveCheckpoint: async (checkpoint) => {
      if (opts.saveFails) return false;
      saves.push(checkpoint);
      return true;
    },
  };
}

function checkpoint(accessions: string[]): SecEdgarCheckpoint {
  return {
    stream_key: SEC_EDGAR_STREAM_KEY,
    anchor_accessions: accessions,
    anchor_observed_at: "2026-09-07T00:00:00.000Z",
    last_success_at: "2026-09-07T00:00:00.000Z",
    head_updated_at: null,
    pages_fetched: 1,
  };
}

async function invoke(
  body: string | null,
  opts: {
    env?: Record<string, string | undefined>;
    store?: ReturnType<typeof memoryStore>;
    fetch?: ReturnType<typeof fetchByStart>;
    auth?: string;
  } = {},
) {
  resetSecEdgarCikCacheForTests();
  const fetch = opts.fetch ?? fetchByStart();
  const store = opts.store ?? memoryStore();
  const req = new Request("http://localhost/sync-sec-edgar-filings", {
    method: "POST",
    headers: {
      Authorization: opts.auth ?? `Bearer ${SYNC_SECRET}`,
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
  assertEquals(json.checkpoint_status, "absent");
  assertEquals(json.rows_upserted, 0);
  assertEquals(store.inserts.length, 0);
  assertEquals(store.saves.length, 0);
  assert(json.rows_would_insert >= 1);
});

Deno.test("dry_run compares existing keys and does not insert or create checkpoint", async () => {
  const existing = [secDedupeKey(NVDA_ACC, "NVDA")];
  const { res, json, store } = await invoke('{"mode":"dry_run"}', {
    store: memoryStore({ existing }),
  });
  assertEquals(res.status, 200);
  assertEquals(json.mode, "dry_run");
  assertEquals(json.rows_existing, 1);
  assertEquals(json.rows_would_insert, 0);
  assertEquals(store.inserts.length, 0);
  assertEquals(store.saves.length, 0);
});

Deno.test("write requested with switch false returns WRITE_DISABLED", async () => {
  const { res, json, store } = await invoke('{"mode":"write"}', {
    env: { SEC_EDGAR_WRITE_ENABLED: "false" },
  });
  assertEquals(res.status, 409);
  assertEquals(json.error, "WRITE_DISABLED");
  assertEquals(store.inserts.length, 0);
  assertEquals(store.saves.length, 0);
  assertEquals(store.loads, 0);
});

Deno.test("write without checkpoint bootstraps from page 0 only", async () => {
  const fetch = fetchByStart({ 0: PAGE0, 100: PAGE1 });
  const { res, json, store } = await invoke('{"mode":"write"}', {
    env: { SEC_EDGAR_WRITE_ENABLED: "true" },
    fetch,
  });
  assertEquals(res.status, 200);
  assertEquals(json.mode, "write");
  assertEquals(json.checkpoint_status, "bootstrapped");
  assertEquals(json.pages_fetched, 1);
  assertEquals(store.inserts.length, 1);
  assertEquals(store.saves.length, 1);
  assertEquals(store.saves[0]?.anchor_accessions.includes(NVDA_ACC), true);
  assertEquals(store.saves[0]?.anchor_accessions.includes("0001045810-26-000003"), true);
  assertEquals(fetch.urls.filter((u) => u.includes("browse-edgar")).length, 1);
});

Deno.test("previous anchor on page 0 fetches one page and reaches boundary", async () => {
  const { res, json, store } = await invoke('{"mode":"write"}', {
    env: { SEC_EDGAR_WRITE_ENABLED: "true" },
    store: memoryStore({ checkpoint: checkpoint([NVDA_ACC]) }),
    fetch: fetchByStart({ 0: PAGE0, 100: PAGE1 }),
  });
  assertEquals(res.status, 200);
  assertEquals(json.checkpoint_status, "boundary_reached");
  assertEquals(json.checkpoint_boundary_reached, true);
  assertEquals(json.pages_fetched, 1);
  assertEquals(store.saves[0]?.anchor_accessions[0], NVDA_ACC);
});

Deno.test("previous anchor on page 2 walks start=0,100,200", async () => {
  const fetch = fetchByStart({ 0: PAGE0, 100: PAGE1, 200: PAGE2 });
  const { res, json } = await invoke('{"mode":"write"}', {
    env: { SEC_EDGAR_WRITE_ENABLED: "true" },
    store: memoryStore({ checkpoint: checkpoint([OLD_ACC]) }),
    fetch,
  });
  assertEquals(res.status, 200);
  assertEquals(json.checkpoint_boundary_reached, true);
  assertEquals(json.pages_fetched, 3);
  const starts = fetch.urls
    .filter((u) => u.includes("browse-edgar"))
    .map((u) => new URL(u).searchParams.get("start"));
  assertEquals(starts, ["0", "100", "200"]);
});

Deno.test("anchor not reached by max pages is CHECKPOINT_GAP with zero writes", async () => {
  const pages: Record<number, string> = {};
  for (let i = 0; i < 20; i += 1) {
    pages[i * 100] = feedXml(entryXml("8-K", "NVIDIA CORP", "0001045810", `0001045810-26-${String(i).padStart(6, "0")}`));
  }
  const store = memoryStore({ checkpoint: checkpoint(["0009999999-26-000001"]) });
  const { res, json } = await invoke('{"mode":"write"}', {
    env: { SEC_EDGAR_WRITE_ENABLED: "true" },
    store,
    fetch: fetchByStart(pages),
  });
  assertEquals(res.status, 409);
  assertEquals(json.error, "CHECKPOINT_GAP");
  assertEquals(store.inserts.length, 0);
  assertEquals(store.saves.length, 0);
});

Deno.test("provider error on page 2 writes nothing and does not advance checkpoint", async () => {
  const store = memoryStore({ checkpoint: checkpoint([OLD_ACC]) });
  const { res, json } = await invoke('{"mode":"write"}', {
    env: { SEC_EDGAR_WRITE_ENABLED: "true" },
    store,
    fetch: fetchByStart({ 0: PAGE0, 100: "error" }),
  });
  assertEquals(res.status, 502);
  assertEquals(json.error, "PROVIDER_ERROR");
  assertEquals(store.inserts.length, 0);
  assertEquals(store.saves.length, 0);
});

Deno.test("Catalyst insertion failure does not advance checkpoint", async () => {
  const store = memoryStore({ insertFails: true });
  const { res, json } = await invoke('{"mode":"write"}', {
    env: { SEC_EDGAR_WRITE_ENABLED: "true" },
    store,
  });
  assertEquals(res.status, 500);
  assertEquals(json.error, "DATABASE_ERROR");
  assertEquals(store.saves.length, 0);
});

Deno.test("checkpoint update failure after insert returns CHECKPOINT_WRITE_FAILED", async () => {
  const store = memoryStore({ saveFails: true });
  const { res, json } = await invoke('{"mode":"write"}', {
    env: { SEC_EDGAR_WRITE_ENABLED: "true" },
    store,
  });
  assertEquals(res.status, 500);
  assertEquals(json.error, "CHECKPOINT_WRITE_FAILED");
  assertEquals(store.inserts.length, 1);
  assertEquals(store.saves.length, 0);
});

Deno.test("successful write inserts rows and advances checkpoint to current page-0 accessions", async () => {
  const store = memoryStore();
  const { res, json } = await invoke('{"mode":"write"}', {
    env: { SEC_EDGAR_WRITE_ENABLED: "true" },
    store,
  });
  assertEquals(res.status, 200);
  assert(json.rows_upserted >= 1);
  assertEquals(store.saves[0]?.anchor_accessions.includes(NVDA_ACC), true);
  assertEquals(store.saves[0]?.anchor_accessions.includes("0001045810-26-000003"), true);
});

Deno.test("dry-run may read checkpoint but never writes events or checkpoint", async () => {
  const store = memoryStore({ checkpoint: checkpoint([NVDA_ACC]) });
  const { res, json } = await invoke('{"mode":"dry_run"}', { store });
  assertEquals(res.status, 200);
  assertEquals(json.checkpoint_present, true);
  assertEquals(json.checkpoint_boundary_reached, true);
  assertEquals(store.inserts.length, 0);
  assertEquals(store.saves.length, 0);
});

Deno.test("unauthorized request performs zero SEC and DB work", async () => {
  const fetch = fetchByStart();
  const store = memoryStore();
  const { res, json } = await invoke('{"mode":"write"}', {
    env: { SEC_EDGAR_WRITE_ENABLED: "true" },
    fetch,
    store,
    auth: "Bearer wrong",
  });
  assertEquals(res.status, 403);
  assertEquals(json.error, "AUTH_FAILED");
  assertEquals(fetch.urls.length, 0);
  assertEquals(store.loads, 0);
  assertEquals(store.finds, 0);
  assertEquals(store.inserts.length, 0);
  assertEquals(store.saves.length, 0);
});

Deno.test("repeated write is dedupe-safe", async () => {
  const existing = [secDedupeKey(NVDA_ACC, "NVDA")];
  const store = memoryStore({ existing, checkpoint: checkpoint([NVDA_ACC]) });
  const { res, json } = await invoke('{"mode":"write"}', {
    env: { SEC_EDGAR_WRITE_ENABLED: "true" },
    store,
  });
  assertEquals(res.status, 200);
  assertEquals(store.inserts.length, 0);
  assertEquals(json.rows_existing, 1);
  assertEquals(store.saves.length, 1);
});

Deno.test("caller cannot override paging or checkpoint configuration", async () => {
  const fetch = fetchByStart();
  const { res } = await invoke(
    '{"mode":"dry_run","start":500,"owner":"include","count":10}',
    { fetch },
  );
  assertEquals(res.status, 400);
  assertEquals(fetch.urls.length, 0);

  const ok = await invoke('{"mode":"dry_run"}', { fetch: fetchByStart() });
  assertEquals(ok.res.status, 200);
  assertEquals(
    ok.fetch.urls.filter((u) => u.includes("browse-edgar")).every((u) =>
      u === buildLatestFilingsAtomUrl(0) || u === SEC_LATEST_FILINGS_ATOM_URL
    ),
    true,
  );
  assertEquals(ok.fetch.urls.some((u) => u.includes("owner=include")), false);
});

Deno.test("holiday has no special disable behavior", async () => {
  const { res, json } = await invoke('{"mode":"dry_run"}');
  assertEquals(res.status, 200);
  assertEquals(json.mode, "dry_run");
  assertEquals(json.error, undefined);
});
