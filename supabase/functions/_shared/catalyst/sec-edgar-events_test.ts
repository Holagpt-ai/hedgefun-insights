import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildSecRelevanceSignals,
  classifySecFilingTaxonomy,
  dedupeKeyForSecRow,
  isEligibleSecEdgarForScannerSurfacing,
  parseSecEdgarFacts,
  resolveSecFilingTimestamps,
  secAttributionConfidence,
} from "./sec-edgar-events.ts";

const NOW = Date.parse("2026-10-23T18:00:00.000Z");

function secRow(overrides: Record<string, unknown> = {}) {
  return {
    symbol: "AAA",
    title: "AAA filed Form 8-K",
    event_type: "sec_filing_news",
    verification_state: "provider_reported",
    event_date: "2026-10-23",
    published_at: "2026-10-23T16:00:00.000Z",
    provider: "sec_edgar",
    dedupe_key: "sec:0000123456-26-000001:AAA",
    facts: {
      form_type: "8-K",
      filing_date: "2026-10-22",
      accepted_at: "2026-10-23T16:00:00.000Z",
      accession_number: "0000123456-26-000001",
      sec_items: ["2.02"],
      attribution_level: "security",
    },
    ...overrides,
  };
}

Deno.test("attribution_invalidated rows fail scanner SEC surfacing eligibility", () => {
  const row = secRow({ verification_state: "attribution_invalidated" });
  assertEquals(isEligibleSecEdgarForScannerSurfacing(row, NOW), false);
});

Deno.test("stale SEC filings are not scanner enrichment candidates", () => {
  const row = secRow({
    published_at: "2026-06-01T12:00:00.000Z",
    event_date: "2026-06-01",
  });
  assertEquals(isEligibleSecEdgarForScannerSurfacing(row, NOW), false);
});

Deno.test("8-K item 2.02 maps to earnings taxonomy without sentiment", () => {
  assertEquals(
    classifySecFilingTaxonomy("AAA filed Form 8-K", "Items 2.02", secRow().facts as Record<string, unknown>),
    "EARNINGS",
  );
  assertEquals(classifySecFilingTaxonomy("AAA filed Form 8-K", null, { form_type: "8-K" }), "SEC_FILING");
});

Deno.test("offering forms map to OFFERING taxonomy", () => {
  assertEquals(classifySecFilingTaxonomy("x", null, { form_type: "424B5" }), "OFFERING");
});

Deno.test("filing date vs acceptance timestamp are distinguished", () => {
  const ts = resolveSecFilingTimestamps(secRow());
  assertEquals(ts.filing_date, "2026-10-22");
  assertEquals(ts.accepted_at, "2026-10-23T16:00:00.000Z");
});

Deno.test("attribution confidence from stored facts", () => {
  assertEquals(secAttributionConfidence(secRow().facts as Record<string, unknown>).confidence, "high");
  assertEquals(
    secAttributionConfidence({ attribution_level: "issuer_unattributed" }).confidence,
    "medium",
  );
});

Deno.test("dedupe key prefers sec accession composite", () => {
  assertEquals(dedupeKeyForSecRow(secRow()), "sec:0000123456-26-000001:AAA");
});

Deno.test("relevance signals omit fabricated market reaction", () => {
  const signals = buildSecRelevanceSignals(secRow(), NOW);
  const reaction = signals.find((s) => s.id === "market_reaction");
  assert(reaction);
  assertEquals(reaction.available, false);
});

Deno.test("parseSecEdgarFacts normalizes form type", () => {
  const p = parseSecEdgarFacts({ form_type: "8-k", sec_items: ["5.02"] });
  assertEquals(p.form_type, "8-K");
  assertEquals(p.sec_items, ["5.02"]);
});
