import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  classifyHistoricalSecRow,
  summarizeSecHistoricalClassifications,
  type SecHistoricalRowInput,
} from "./sec-v1c-historical-classification.ts";
import type { CikTickerMap } from "./sec-v1c-historical-classification.ts";

const UBS_CIK = "0001114446";
const CITI_CIK = "0000831001";

function row(partial: Partial<SecHistoricalRowInput> & Pick<SecHistoricalRowInput, "dedupe_key" | "symbol">): SecHistoricalRowInput {
  return {
    company_name: partial.company_name ?? "Example",
    provider: "sec_edgar",
    provider_article_id: null,
    verification_state: "provider_reported",
    facts: partial.facts ?? {},
    ...partial,
  };
}

function map(entries: [string, { ticker: string; exchange: string }[]][]): CikTickerMap {
  return new Map(entries);
}

Deno.test("issuer-level 424B2 fan-out rows classify as confirmed misattribution", () => {
  const cikMap = map([
    [UBS_CIK, [
      { ticker: "UBS", exchange: "NYSE" },
      { ticker: "UBS^I", exchange: "NYSE" },
      { ticker: "UBS^O", exchange: "NYSE" },
    ]],
  ]);
  const accession = "0001114446-26-000001";
  const facts = {
    form_type: "424B2",
    cik: UBS_CIK,
    accession_number: accession,
  };
  for (const symbol of ["UBS", "UBS^I", "UBS^O"]) {
    const result = classifyHistoricalSecRow(
      row({ dedupe_key: `sec:${accession}:${symbol}`, symbol, facts }),
      cikMap,
    );
    assertEquals(result.classification, "confirmed_misattribution");
    assertEquals(result.reason_code, "ISSUER_LEVEL_MULTI_TICKER");
  }
});

Deno.test("Citigroup 10-Q keeps common C legitimate and marks preferred misattributed", () => {
  const cikMap = map([
    [CITI_CIK, [
      { ticker: "C", exchange: "NYSE" },
      { ticker: "C-PJ", exchange: "NYSE" },
      { ticker: "C-PK", exchange: "NYSE" },
    ]],
  ]);
  const accession = "0000831001-26-000010";
  const facts = { form_type: "10-Q", cik: CITI_CIK, accession_number: accession };
  const c = classifyHistoricalSecRow(
    row({ dedupe_key: `sec:${accession}:C`, symbol: "C", facts }),
    cikMap,
  );
  const pref = classifyHistoricalSecRow(
    row({ dedupe_key: `sec:${accession}:C-PJ`, symbol: "C-PJ", facts }),
    cikMap,
  );
  assertEquals(c.classification, "legitimate");
  assertEquals(pref.classification, "confirmed_misattribution");
});

Deno.test("single-ticker 8-K remains legitimate", () => {
  const cikMap = map([
    ["0001045810", [{ ticker: "NVDA", exchange: "Nasdaq" }]],
  ]);
  const accession = "0001045810-26-000001";
  const facts = { form_type: "8-K", cik: "0001045810", accession_number: accession };
  const result = classifyHistoricalSecRow(
    row({ dedupe_key: `sec:${accession}:NVDA`, symbol: "NVDA", facts }),
    cikMap,
  );
  assertEquals(result.classification, "legitimate");
});

Deno.test("missing CIK in facts is unresolved not misattribution", () => {
  const result = classifyHistoricalSecRow(
    row({
      dedupe_key: "sec:0001045810-26-000001:NVDA",
      symbol: "NVDA",
      facts: { form_type: "8-K", accession_number: "0001045810-26-000001" },
    }),
    map([["0001045810", [{ ticker: "NVDA", exchange: "Nasdaq" }]]]),
  );
  assertEquals(result.classification, "unresolved");
  assertEquals(result.reason_code, "MISSING_CIK");
});

Deno.test("explicit exchange evidence keeps one security legitimate", () => {
  const cikMap = map([
    [UBS_CIK, [
      { ticker: "UBS", exchange: "NYSE" },
      { ticker: "UBS^I", exchange: "NYSE" },
    ]],
  ]);
  const accession = "0001114446-26-000042";
  const facts = {
    form_type: "424B2",
    cik: UBS_CIK,
    accession_number: accession,
  };
  const structured = classifyHistoricalSecRow(
    row({
      dedupe_key: `sec:${accession}:UBS^I`,
      symbol: "UBS^I",
      company_name: "UBS AG (NYSE: UBS^I)",
      facts,
    }),
    cikMap,
  );
  const common = classifyHistoricalSecRow(
    row({ dedupe_key: `sec:${accession}:UBS`, symbol: "UBS", facts }),
    cikMap,
  );
  assertEquals(structured.classification, "legitimate");
  assertEquals(common.classification, "confirmed_misattribution");
});

Deno.test("summary counts classifications", () => {
  const summary = summarizeSecHistoricalClassifications([
    { dedupe_key: "a", symbol: "A", classification: "confirmed_misattribution", reason_code: "X", resolver_reason: null, form_type: null, cik: null, accession_number: null, cik_listing_count: 0, resolver_target_tickers: [] },
    { dedupe_key: "b", symbol: "B", classification: "legitimate", reason_code: "Y", resolver_reason: null, form_type: null, cik: null, accession_number: null, cik_listing_count: 0, resolver_target_tickers: [] },
  ]);
  assertEquals(summary.confirmed_misattribution, 1);
  assertEquals(summary.legitimate, 1);
});
