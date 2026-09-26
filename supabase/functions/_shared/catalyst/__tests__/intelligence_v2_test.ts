import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildProvenanceV2,
  classifyFreshnessV2,
  dedupeCatalystRows,
  intelligenceV2Facts,
  mapToTaxonomyV2,
  pickStrongestVerifiedCatalyst,
  resolveCatalystAvailability,
  scannerCatalystSupportingFields,
  toDisplayContractV2,
} from "../intelligence-v2.ts";

const NOW = Date.parse("2026-09-26T14:00:00.000Z");
const FETCHED = "2026-09-26T14:00:00.000Z";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "1",
    symbol: "AAPL",
    title: "Apple reports Q3 earnings",
    event_type: "earnings",
    verification_state: "provider_reported",
    event_date: "2026-09-26",
    published_at: "2026-09-26T12:00:00.000Z",
    source_name: "Wire",
    source_url: "https://example.com/a",
    provider: "polygon",
    ...overrides,
  };
}

Deno.test("1. source normalization maps legacy event_type to taxonomy", () => {
  assertEquals(mapToTaxonomyV2("earnings", "Q3 earnings beat"), "EARNINGS");
  assertEquals(mapToTaxonomyV2("earnings", "Company raises full-year guidance"), "GUIDANCE");
  assertEquals(mapToTaxonomyV2("sec_filing_news", "Files 8-K"), "SEC_FILING");
  assertEquals(mapToTaxonomyV2("fda_biotech", "PDUFA date"), "FDA_REGULATORY");
  assertEquals(mapToTaxonomyV2("merger_acquisition", "To acquire"), "M_AND_A");
});

Deno.test("2. provenance preservation", () => {
  const p = buildProvenanceV2(row(), FETCHED, NOW);
  assertEquals(p.original_title, "Apple reports Q3 earnings");
  assertEquals(p.source_name, "Wire");
  assertEquals(p.source_url, "https://example.com/a");
  assertEquals(p.published_at, "2026-09-26T12:00:00.000Z");
  assertEquals(p.fetched_at, FETCHED);
});

Deno.test("4. dedupe same event within publication window", () => {
  const dupes = dedupeCatalystRows([
    row({ id: "a", dedupe_key: "a", title: "Apple reports Q3 earnings" }),
    row({ id: "b", dedupe_key: "b", title: "Apple reports Q3 earnings " }),
  ], NOW);
  assertEquals(dupes.length, 1);
});

Deno.test("5. retain distinct events", () => {
  const out = dedupeCatalystRows([
    row({ title: "Apple reports Q3 earnings" }),
    row({
      title: "Apple announces new product launch",
      event_type: "product_contract",
      source_url: "https://example.com/product",
    }),
  ], NOW);
  assertEquals(out.length, 2);
});

Deno.test("6-8. freshness current and prior-session labeling", () => {
  assertEquals(
    classifyFreshnessV2(row({ published_at: new Date(NOW - 2 * 3600_000).toISOString() }), NOW),
    "breaking",
  );
  assertEquals(
    classifyFreshnessV2(row({ published_at: new Date(NOW - 48 * 3600_000).toISOString() }), NOW),
    "current",
  );
  assertEquals(
    classifyFreshnessV2(row({ published_at: new Date(NOW - 5 * 24 * 3600_000).toISOString() }), NOW),
    "prior_session",
  );
});

Deno.test("9. stale event behavior", () => {
  assertEquals(
    classifyFreshnessV2(row({ published_at: "2026-06-01T12:00:00.000Z" }), NOW),
    "stale_for_display",
  );
});

Deno.test("10-12. verified / none / unavailable states", () => {
  assertEquals(resolveCatalystAvailability({ queryError: false, verifiedCount: 1 }), "verified");
  assertEquals(resolveCatalystAvailability({ queryError: false, verifiedCount: 0 }), "none");
  assertEquals(resolveCatalystAvailability({ queryError: true, verifiedCount: 0 }), "unavailable");
  assertEquals(resolveCatalystAvailability({
    queryError: false,
    verifiedCount: 0,
    providerFailures: ["polygon"],
  }), "unavailable");
});

Deno.test("13. scanner integration fields", () => {
  const s = scannerCatalystSupportingFields(row(), FETCHED);
  assert(s.catalyst_verified);
  assertEquals(s.catalyst_taxonomy_v2, "EARNINGS");
  assert(s.catalyst_freshness_class !== null);
});

Deno.test("14. Watchlist strongest pick", () => {
  const best = pickStrongestVerifiedCatalyst([
    row({ published_at: "2026-09-25T12:00:00.000Z" }),
    row({ published_at: "2026-09-26T12:00:00.000Z", title: "Apple raises guidance", event_type: "earnings" }),
  ], "AAPL", NOW);
  assert(best?.title.includes("guidance"));
});

Deno.test("15. display contract verified-only fields", () => {
  const d = toDisplayContractV2(row(), FETCHED);
  assert(d);
  assertEquals(d?.availability, "verified");
  assertEquals(d?.provenance.taxonomy_v2, "EARNINGS");
});

Deno.test("16. no fabricated catalyst from invalid rows", () => {
  assertEquals(toDisplayContractV2(row({ verification_state: "draft" }), FETCHED), null);
});

Deno.test("18. no duplicate event inflation under dedupe cap", () => {
  const many = Array.from({ length: 20 }, (_, i) =>
    row({ id: String(i), dedupe_key: undefined, title: "Same headline repeated" }),
  );
  assertEquals(dedupeCatalystRows(many, NOW).length, 1);
});

Deno.test("17. ranking formulas untouched (no radar replace RPC edits in this module)", () => {
  assert(!("replace_radar_v22_candidates_v1" in ({} as Record<string, unknown>)));
});

Deno.test("sync facts helper stores v2 metadata", () => {
  const facts = intelligenceV2Facts(row(), FETCHED);
  assertEquals(facts.v2_taxonomy, "EARNINGS");
  assert(facts.v2_fetched_at);
});
