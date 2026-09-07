import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  emptySecSummary,
  parseCompanyTickersExchangeJson,
  parseLatestFilingsAtom,
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
