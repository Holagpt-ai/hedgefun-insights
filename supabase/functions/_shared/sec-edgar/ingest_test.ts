import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  createSecRequester,
  emptySecSummary,
  extractSecItems,
  formatSecFilingDescription,
  parseCompanyTickersExchangeJson,
  parseLatestFilingsAtom,
  parseSecAtomCompanyName,
  partitionNewRows,
  secDedupeKey,
  toCatalystRowsFromSec,
} from "./ingest.ts";

const FEED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Latest Filings</title>
  <entry>
    <title>8-K - NVIDIA CORP (0001045810) (Issuer)</title>
    <link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/1045810/000104581026000001/0001045810-26-000001-index.htm" />
    <id>urn:tag:sec.gov,2008:accession-number=0001045810-26-000001</id>
    <updated>2026-09-07T13:17:00-04:00</updated>
    <summary type="html">&lt;b&gt;Filed:&lt;/b&gt; 2026-09-07 &lt;b&gt;AccNo:&lt;/b&gt; 0001045810-26-000001</summary>
    <category scheme="https://www.sec.gov/" term="8-K" />
  </entry>
  <entry>
    <title>10-Q - ALPHA CLASS INC (0000002222) (Issuer)</title>
    <link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/2222/000000222226000100/0000002222-26-000100-index.htm" />
    <id>urn:tag:sec.gov,2008:accession-number=0000002222-26-000100</id>
    <updated>2026-09-07T13:18:00-04:00</updated>
    <summary type="html">&lt;b&gt;Filed:&lt;/b&gt; 2026-09-07 &lt;b&gt;AccNo:&lt;/b&gt; 0000002222-26-000100</summary>
    <category scheme="https://www.sec.gov/" term="10-Q" />
  </entry>
  <entry>
    <title>4 - IGNORE FORM (0001045810) (Issuer)</title>
    <link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/1045810/000104581026000003/0001045810-26-000003-index.htm" />
    <id>urn:tag:sec.gov,2008:accession-number=0001045810-26-000003</id>
    <updated>2026-09-07T13:20:00-04:00</updated>
    <summary type="html">&lt;b&gt;Filed:&lt;/b&gt; 2026-09-07 &lt;b&gt;AccNo:&lt;/b&gt; 0001045810-26-000003</summary>
    <category scheme="https://www.sec.gov/" term="4" />
  </entry>
  <entry>
    <title>8-K/A - AMENDED REPORT INC (0000003333) (Issuer)</title>
    <link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/3333/000000333326000010/0000003333-26-000010-index.htm" />
    <id>urn:tag:sec.gov,2008:accession-number=0000003333-26-000010</id>
    <updated>2026-09-07T13:22:00-04:00</updated>
    <summary type="html">&lt;b&gt;Filed:&lt;/b&gt; 2026-09-07 &lt;b&gt;AccNo:&lt;/b&gt; 0000003333-26-000010</summary>
    <category scheme="https://www.sec.gov/" term="8-K/A" />
  </entry>
  <entry>
    <title>S-3 - NO MAP CO (0000009999) (Issuer)</title>
    <link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/9999/000000999926000099/0000009999-26-000099-index.htm" />
    <id>urn:tag:sec.gov,2008:accession-number=0000009999-26-000099</id>
    <updated>2026-09-07T13:25:00-04:00</updated>
    <summary type="html">&lt;b&gt;Filed:&lt;/b&gt; 2026-09-07 &lt;b&gt;AccNo:&lt;/b&gt; 0000009999-26-000099</summary>
    <category scheme="https://www.sec.gov/" term="S-3" />
  </entry>
  <entry>
    <title>8-K - DUPLICATE EXAMPLE INC (0001045810) (Issuer)</title>
    <link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/1045810/000104581026000001/0001045810-26-000001-index.htm" />
    <id>urn:tag:sec.gov,2008:accession-number=0001045810-26-000001</id>
    <updated>2026-09-07T13:30:00-04:00</updated>
    <summary type="html">&lt;b&gt;Filed:&lt;/b&gt; 2026-09-07 &lt;b&gt;AccNo:&lt;/b&gt; 0001045810-26-000001</summary>
    <category scheme="https://www.sec.gov/" term="8-K" />
  </entry>
  <entry>
    <title>10-K - BROKEN ENTRY</title>
    <id>urn:tag:sec.gov,2008:accession-number=NOT_VALID</id>
    <updated>invalid-date</updated>
    <summary type="html">&lt;b&gt;Filed:&lt;/b&gt; bad</summary>
  </entry>
</feed>`;

const CIK_MAP_FIXTURE = {
  fields: ["cik", "name", "ticker", "exchange"],
  data: [
    [1045810, "NVIDIA CORP", "NVDA", "Nasdaq"],
    [2222, "ALPHA CLASS INC", "ALPHA", "NYSE"],
    [2222, "ALPHA CLASS INC", "ALPHA.A", "NYSE"],
    [3333, "AMENDED REPORT INC", "AMND", "Nasdaq"],
  ],
};

Deno.test("parseLatestFilingsAtom extracts valid entries and rejects malformed", () => {
  const entries = parseLatestFilingsAtom(FEED_XML);
  assertEquals(entries.length, 6);
  assertEquals(entries[0].form_type, "8-K");
  assertEquals(entries[0].cik, "0001045810");
  assertEquals(entries[0].accession_number, "0001045810-26-000001");
  assertEquals(entries[1].form_type, "10-Q");
});

Deno.test("parseCompanyTickersExchangeJson supports single and multi-class mappings", () => {
  const map = parseCompanyTickersExchangeJson(CIK_MAP_FIXTURE);
  assertEquals(map.get("0001045810")?.map((x) => x.ticker), ["NVDA"]);
  assertEquals(map.get("0000002222")?.map((x) => x.ticker), ["ALPHA", "ALPHA.A"]);
  assertEquals(map.has("0000009999"), false);
});

Deno.test("toCatalystRowsFromSec maps forms, rejects irrelevant, skips unmapped, dedupes accession+symbol", () => {
  const entries = parseLatestFilingsAtom(FEED_XML);
  const map = parseCompanyTickersExchangeJson(CIK_MAP_FIXTURE);
  const summary = emptySecSummary();
  const rows = toCatalystRowsFromSec(entries, map, summary);

  const keys = rows.map((r) => r.dedupe_key).sort();
  assertEquals(
    keys,
    [
      secDedupeKey("0000002222-26-000100", "ALPHA"),
      secDedupeKey("0000002222-26-000100", "ALPHA.A"),
      secDedupeKey("0000003333-26-000010", "AMND"),
      secDedupeKey("0001045810-26-000001", "NVDA"),
    ].sort(),
  );

  assertEquals(
    rows.every((r) => r.provider === "sec_edgar" && r.event_type === "sec_filing_news"),
    true,
  );
  assertEquals(summary.feed_entries_read, 6);
  assertEquals(summary.relevant_forms_found, 5);
  assertEquals(summary.unmapped_issuers, 1);
  assertEquals(summary.rows_validated, 4);
  assert(summary.rows_rejected >= 1);
});

Deno.test("SEC rows keep fact-only deterministic title/description", () => {
  const entries = parseLatestFilingsAtom(FEED_XML);
  const map = parseCompanyTickersExchangeJson(CIK_MAP_FIXTURE);
  const summary = emptySecSummary();
  const rows = toCatalystRowsFromSec(entries, map, summary);
  const row = rows.find((r) => r.symbol === "NVDA");
  assert(!!row);
  assertEquals(row?.title, "NVDA filed Form 8-K");
  assertEquals(row?.description, "Form 8-K filed with the SEC.");
  const blob = JSON.stringify(row);
  assertEquals(blob.includes("Bullish"), false);
  assertEquals(blob.includes("bearish"), false);
  assertEquals(blob.includes("Potential breakout"), false);
});

Deno.test("Atom filing index URL is source_url and never facts.primary_document", () => {
  const entries = parseLatestFilingsAtom(FEED_XML);
  const nvda = entries.find((e) => e.accession_number === "0001045810-26-000001");
  assert(!!nvda);
  assertEquals(
    nvda?.filing_url,
    "https://www.sec.gov/Archives/edgar/data/1045810/000104581026000001/0001045810-26-000001-index.htm",
  );
  assertEquals(nvda?.primary_document, null);

  const map = parseCompanyTickersExchangeJson(CIK_MAP_FIXTURE);
  const rows = toCatalystRowsFromSec([nvda!], map, emptySecSummary());
  assertEquals(rows[0]?.source_url, nvda?.filing_url);
  assertEquals(rows[0]?.facts.primary_document, null);
  assertEquals(String(rows[0]?.facts.primary_document ?? "").includes("index.htm"), false);
});

Deno.test("parseSecAtomCompanyName handles hyphenated SEC form titles", () => {
  assertEquals(
    parseSecAtomCompanyName("8-K - NVIDIA CORP (0001045810) (Filer)"),
    "NVIDIA CORP",
  );
  assertEquals(
    parseSecAtomCompanyName("8-K/A - AMENDED REPORT INC (0000003333) (Issuer)"),
    "AMENDED REPORT INC",
  );
  assertEquals(
    parseSecAtomCompanyName("10-Q - ALPHA CLASS INC (0000002222) (Filer)"),
    "ALPHA CLASS INC",
  );
  assertEquals(
    parseSecAtomCompanyName("20-F - FOREIGN ISSUER LTD (0000011111) (Filer)"),
    "FOREIGN ISSUER LTD",
  );
  assertEquals(parseSecAtomCompanyName("10-K - BROKEN ENTRY"), null);
  assertEquals(parseSecAtomCompanyName("8-K - NVIDIA CORP"), null);
});

Deno.test("parsed Atom entries keep verified company names from hyphenated forms", () => {
  const entries = parseLatestFilingsAtom(FEED_XML);
  assertEquals(entries.find((e) => e.form_type === "8-K")?.company_name, "NVIDIA CORP");
  assertEquals(entries.find((e) => e.form_type === "8-K/A")?.company_name, "AMENDED REPORT INC");
  assertEquals(entries.find((e) => e.form_type === "10-Q")?.company_name, "ALPHA CLASS INC");
});

Deno.test("partitionNewRows skips existing dedupe keys and keeps only new rows", () => {
  const existingKey = secDedupeKey("0001045810-26-000001", "NVDA");
  const newKey = secDedupeKey("0000002222-26-000100", "ALPHA");
  const rows = [
    { dedupe_key: existingKey, symbol: "NVDA" },
    { dedupe_key: newKey, symbol: "ALPHA" },
  ];
  const { existing, incoming } = partitionNewRows(rows, new Set([existingKey]));
  assertEquals(existing.length, 1);
  assertEquals(existing[0]?.dedupe_key, existingKey);
  assertEquals(incoming.map((r) => r.dedupe_key), [newKey]);
});

Deno.test("extractSecItems keeps explicit Item X.XX identifiers only", () => {
  const multi = extractSecItems(
    "Filed: 2026-09-07 AccNo: 0001045810-26-000001 Item 2.02: Results of Operations and Financial Condition Item 5.02: Departure of Directors Item 9.01: Financial Statements and Exhibits",
  );
  assertEquals(multi, ["2.02", "5.02", "9.01"]);

  const dupes = extractSecItems("Item 2.02: Results Item 2.02: Results Item 8.01: Other Events");
  assertEquals(dupes, ["2.02", "8.01"]);

  assertEquals(extractSecItems("Filed: 2026-09-07 AccNo: 0001045810-26-000001 Size: 12 KB"), null);
  assertEquals(extractSecItems("Item foo Item 2.0 Item 2 Items 5.02"), null);
});

Deno.test("formatSecFilingDescription stays factual", () => {
  assertEquals(formatSecFilingDescription("8-K", null), "Form 8-K filed with the SEC.");
  assertEquals(
    formatSecFilingDescription("8-K", ["2.02", "5.02", "9.01"]),
    "Form 8-K — Items 2.02, 5.02 and 9.01",
  );
});

Deno.test("8-K Atom summary items become sec_items and a factual description", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>8-K - NVIDIA CORP (0001045810) (Filer)</title>
    <link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/1045810/000104581026000001/0001045810-26-000001-index.htm" />
    <id>urn:tag:sec.gov,2008:accession-number=0001045810-26-000001</id>
    <updated>2026-09-07T13:17:00-04:00</updated>
    <summary type="html">Filed: 2026-09-07 AccNo: 0001045810-26-000001 Item 2.02: Results of Operations and Financial Condition Item 5.02: Departure of Directors Item 9.01: Financial Statements and Exhibits</summary>
    <category scheme="https://www.sec.gov/" term="8-K" />
  </entry>
</feed>`;
  const entries = parseLatestFilingsAtom(xml);
  assertEquals(entries[0]?.sec_items, ["2.02", "5.02", "9.01"]);
  const rows = toCatalystRowsFromSec(
    entries,
    parseCompanyTickersExchangeJson(CIK_MAP_FIXTURE),
    emptySecSummary(),
  );
  assertEquals(rows[0]?.description, "Form 8-K — Items 2.02, 5.02 and 9.01");
  assertEquals(rows[0]?.facts.sec_items, ["2.02", "5.02", "9.01"]);
});

function requesterHarness() {
  let now = 1_000_000;
  const sleeps: number[] = [];
  return {
    sleeps,
    nowMs: () => {
      now += 10_000;
      return now;
    },
    sleepFn: async (ms: number) => {
      sleeps.push(ms);
    },
  };
}

Deno.test("createSecRequester classifies timeout/abort as PROVIDER_TIMEOUT after bounded retries", async () => {
  const harness = requesterHarness();
  const summary = emptySecSummary();
  let calls = 0;
  const secFetch = createSecRequester("Stocksist/1.0 test@example.com", summary, {
    ...harness,
    fetchFn: () => {
      calls += 1;
      return Promise.reject(Object.assign(new Error("aborted"), { name: "TimeoutError" }));
    },
  });
  const res = await secFetch("https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&output=atom");
  assertEquals(res.ok, false);
  if (!res.ok) assertEquals(res.reason, "PROVIDER_TIMEOUT");
  assertEquals(calls, 3);
  assertEquals(summary.sec_requests, 3);
});

Deno.test("createSecRequester classifies generic fetch failure as PROVIDER_ERROR", async () => {
  const harness = requesterHarness();
  const summary = emptySecSummary();
  const secFetch = createSecRequester("Stocksist/1.0 test@example.com", summary, {
    ...harness,
    fetchFn: () => Promise.reject(new TypeError("fetch failed")),
  });
  const res = await secFetch("https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&output=atom");
  assertEquals(res.ok, false);
  if (!res.ok) assertEquals(res.reason, "PROVIDER_ERROR");
});

Deno.test("createSecRequester returns PROVIDER_FORBIDDEN on 403 without retrying", async () => {
  const harness = requesterHarness();
  const summary = emptySecSummary();
  let calls = 0;
  const secFetch = createSecRequester("Stocksist/1.0 test@example.com", summary, {
    ...harness,
    fetchFn: () => {
      calls += 1;
      return Promise.resolve(new Response("forbidden", { status: 403 }));
    },
  });
  const res = await secFetch("https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&output=atom");
  assertEquals(res.ok, false);
  if (!res.ok) assertEquals(res.reason, "PROVIDER_FORBIDDEN");
  assertEquals(calls, 1);
});

Deno.test("createSecRequester retries 429 then returns PROVIDER_RATE_LIMITED", async () => {
  const harness = requesterHarness();
  const summary = emptySecSummary();
  let calls = 0;
  const secFetch = createSecRequester("Stocksist/1.0 test@example.com", summary, {
    ...harness,
    fetchFn: () => {
      calls += 1;
      return Promise.resolve(new Response("slow", { status: 429 }));
    },
  });
  const res = await secFetch("https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&output=atom");
  assertEquals(res.ok, false);
  if (!res.ok) assertEquals(res.reason, "PROVIDER_RATE_LIMITED");
  assertEquals(calls, 3);
  assert(harness.sleeps.length >= 2);
});

Deno.test("createSecRequester retries 503 then returns PROVIDER_ERROR", async () => {
  const harness = requesterHarness();
  const summary = emptySecSummary();
  let calls = 0;
  const secFetch = createSecRequester("Stocksist/1.0 test@example.com", summary, {
    ...harness,
    fetchFn: () => {
      calls += 1;
      return Promise.resolve(new Response("down", { status: 503 }));
    },
  });
  const res = await secFetch("https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&output=atom");
  assertEquals(res.ok, false);
  if (!res.ok) assertEquals(res.reason, "PROVIDER_ERROR");
  assertEquals(calls, 3);
});
