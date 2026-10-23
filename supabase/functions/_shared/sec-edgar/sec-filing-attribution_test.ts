import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  emptySecSummary,
  parseLatestFilingsAtom,
  parseCompanyTickersExchangeJson,
  secDedupeKey,
  toCatalystRowsFromSec,
  type SecFeedEntry,
  type SecTickerRow,
} from "./ingest.ts";
import {
  resolveSecFilingAttribution,
  secIssuerIdentityKey,
} from "./sec-filing-attribution.ts";

const UBS_CIK = "0001114446";
const UBS_MAP: SecTickerRow[] = [
  { ticker: "UBS", exchange: "NYSE" },
  { ticker: "UBS^I", exchange: "NYSE" },
  { ticker: "UBS^O", exchange: "NYSE" },
];

const CITI_MAP: SecTickerRow[] = [
  { ticker: "C", exchange: "NYSE" },
  { ticker: "C-PJ", exchange: "NYSE" },
  { ticker: "C-PK", exchange: "NYSE" },
];

function entry(partial: Partial<SecFeedEntry> & Pick<SecFeedEntry, "form_type" | "cik" | "accession_number">): SecFeedEntry {
  return {
    company_name: partial.company_name ?? "Example Corp",
    filing_date: partial.filing_date ?? "2026-10-01",
    accepted_at: partial.accepted_at ?? "2026-10-01T12:00:00.000Z",
    filing_url: partial.filing_url ?? "https://www.sec.gov/example-index.htm",
    primary_document: null,
    sec_items: partial.sec_items ?? null,
    ...partial,
  };
}

Deno.test("424B2 on multi-ticker UBS CIK stays issuer-unattributed", () => {
  const result = resolveSecFilingAttribution(
    entry({ form_type: "424B2", cik: UBS_CIK, accession_number: "0001114446-26-000001", company_name: "UBS AG" }),
    UBS_MAP,
  );
  assertEquals(result.targets.length, 0);
  assertEquals(result.reason, "ISSUER_LEVEL_MULTI_TICKER");
});

Deno.test("Citigroup 10-Q maps only to common C when preferred listings share CIK", () => {
  const result = resolveSecFilingAttribution(
    entry({ form_type: "10-Q", cik: "0000831001", accession_number: "0000831001-26-000010", company_name: "CITIGROUP INC" }),
    CITI_MAP,
  );
  assertEquals(result.targets.map((t) => t.ticker), ["C"]);
});

Deno.test("valid single-ticker 8-K maps to NVDA", () => {
  const result = resolveSecFilingAttribution(
    entry({ form_type: "8-K", cik: "0001045810", accession_number: "0001045810-26-000001", company_name: "NVIDIA CORP" }),
    [{ ticker: "NVDA", exchange: "Nasdaq" }],
  );
  assertEquals(result.targets[0]?.ticker, "NVDA");
});

Deno.test("multi-class 10-Q with two common listings fails closed", () => {
  const result = resolveSecFilingAttribution(
    entry({ form_type: "10-Q", cik: "0000002222", accession_number: "0000002222-26-000100" }),
    [{ ticker: "FOO", exchange: "NYSE" }, { ticker: "BAR", exchange: "NYSE" }],
  );
  assertEquals(result.targets.length, 0);
  assertEquals(result.reason, "AMBIGUOUS_MULTI_CLASS");
});

Deno.test("dual-class issuer report maps to sole non-suffixed common", () => {
  const result = resolveSecFilingAttribution(
    entry({ form_type: "10-Q", cik: "0000002222", accession_number: "0000002222-26-000100" }),
    [{ ticker: "ALPHA", exchange: "NYSE" }, { ticker: "ALPHA.A", exchange: "NYSE" }],
  );
  assertEquals(result.targets.map((t) => t.ticker), ["ALPHA"]);
});

Deno.test("unmapped issuer produces no catalyst rows", () => {
  const summary = emptySecSummary();
  const rows = toCatalystRowsFromSec(
    [entry({ form_type: "8-K", cik: "0000009999", accession_number: "0000009999-26-000099" })],
    new Map(),
    summary,
  );
  assertEquals(rows.length, 0);
  assertEquals(summary.unmapped_issuers, 1);
});

Deno.test("repeated accession ingestion keeps single dedupe key per attributed symbol", () => {
  const summary = emptySecSummary();
  const filing = entry({ form_type: "8-K", cik: "0001045810", accession_number: "0001045810-26-000001" });
  const map = parseCompanyTickersExchangeJson({
    fields: ["cik", "name", "ticker", "exchange"],
    data: [[1045810, "NVIDIA CORP", "NVDA", "Nasdaq"]],
  });
  const first = toCatalystRowsFromSec([filing, filing], map, summary);
  assertEquals(first.length, 1);
  assertEquals(first[0]?.dedupe_key, secDedupeKey("0001045810-26-000001", "NVDA"));
});

Deno.test("issuer identity key is stable for non-ticker surfaces", () => {
  assertEquals(secIssuerIdentityKey("0001114446-26-000001"), "sec:0001114446-26-000001:issuer");
});

Deno.test("explicit exchange-qualified ticker evidence attributes security-specific filing", () => {
  const result = resolveSecFilingAttribution(
    entry({
      form_type: "424B2",
      cik: UBS_CIK,
      accession_number: "0001114446-26-000042",
      company_name: "UBS AG (NYSE: UBS^I)",
    }),
    UBS_MAP,
  );
  assertEquals(result.targets[0]?.ticker, "UBS^I");
  assertEquals(result.reason, "EXPLICIT_TICKER_EVIDENCE");
});

Deno.test("toCatalystRowsFromSec records unattributed issuer filings in summary", () => {
  const summary = emptySecSummary();
  const map = parseCompanyTickersExchangeJson({
    fields: ["cik", "name", "ticker", "exchange"],
    data: UBS_MAP.map((row, i) => [Number(UBS_CIK), "UBS AG", row.ticker, row.exchange ?? "NYSE"]),
  });
  map.set(UBS_CIK, UBS_MAP);
  const rows = toCatalystRowsFromSec([
    entry({ form_type: "424B2", cik: UBS_CIK, accession_number: "0001114446-26-000001" }),
  ], map, summary);
  assertEquals(rows.length, 0);
  assertEquals(summary.rows_attribution_unattributed, 1);
});
