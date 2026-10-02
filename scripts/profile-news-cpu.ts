/**
 * Offline NEWS attribution profiler.
 * Uses a 20_000-row synthetic universe (loadCompanyUniverse MAX_ROWS).
 * Names are not a production snapshot; cardinality and name shape match the loader.
 */
import { buildCompanyUniverse } from "../supabase/functions/_shared/catalyst-intelligence/company-universe.ts";
import { buildAttributionIndex } from "../supabase/functions/_shared/catalyst-intelligence/attribution-index.ts";
import { attributeCandidate } from "../supabase/functions/_shared/catalyst-intelligence/attribution.ts";
import type { NormalizedEventCandidate } from "../supabase/functions/_shared/catalyst-intelligence/types.ts";

const N = 20_000;
const stems = ["acme", "north", "pacific", "stryker", "nanobiotix", "namib", "acuity", "bonduelle", "apex", "woods"];
const suffixes = ["Inc.", "Corporation", "Company", "Holdings", "Group", "LLC", "Ltd.", "plc"];

function rows() {
  const out: { ticker: string; name: string }[] = [];
  out.push({ ticker: "SYK", name: "Stryker Corporation" });
  out.push({ ticker: "NBTX", name: "Nanobiotix SA" });
  out.push({ ticker: "NAMM", name: "Namib Minerals" });
  out.push({ ticker: "AYI", name: "Acuity Brands, Inc." });
  out.push({ ticker: "MMM", name: "3M Company" });
  out.push({ ticker: "FOR", name: "Forestar Group Inc." });
  out.push({ ticker: "ALL", name: "Allstate Corporation" });
  out.push({ ticker: "ARE", name: "Alexandria Real Estate Equities Inc." });
  out.push({ ticker: "NOW", name: "ServiceNow Inc." });
  for (let i = out.length; i < N; i++) {
    const stem = stems[i % stems.length];
    const suffix = suffixes[i % suffixes.length];
    out.push({ ticker: `T${i.toString(36).toUpperCase()}`, name: `${stem} ${i} ${suffix}` });
  }
  return out;
}

function candidate(title: string, summary: string | null): NormalizedEventCandidate {
  return {
    raw: {
      sourceId: "s",
      sourceType: "NEWS_PR",
      externalId: null,
      canonicalUrl: null,
      publishedAt: null,
      discoveredAt: new Date().toISOString(),
      title,
      summary,
      contentHash: "h",
      metadata: {},
    },
    title,
    summary,
    suggestedType: null,
    subtype: null,
    scheduledStart: null,
    scheduledEnd: null,
    scheduledDate: null,
    isAnnouncement: true,
    evidenceTier: "TIER_2_STRONG_SECONDARY",
    metadata: {},
  };
}

const t0 = performance.now();
const universe = buildCompanyUniverse(rows());
const tUniverse = performance.now();
const index = buildAttributionIndex(universe);
const tIndex = performance.now();
const ctx = {
  sourceTicker: null,
  sourceCompanyName: null,
  sourceCik: null,
  sourceType: "NEWS_PR",
  companies: universe,
  attributionIndex: index,
};
const first = attributeCandidate(
  candidate("ASHTON WOODS USA L.L.C. ANNOUNCES QUARTERLY RESULTS CONFERENCE CALL", "The company will host a conference call."),
  ctx,
);
const tFirst = performance.now();
const titles = [
  "Stryker Corporation reports results",
  "Nanobiotix reports clinical progress",
  "Bonduelle announces quarterly results",
  "Issuer update",
  "Acuity Brands announces dividend",
  "Namib Minerals updates production",
  "Clinical update",
  "ForFarmers N.V. announces joint venture update",
];
for (let i = 0; i < 8; i++) {
  attributeCandidate(candidate(titles[i % titles.length], "Results are strong for the quarter and all are now ready."), ctx);
}
const tEight = performance.now();
let aliases = 0;
for (const company of universe) aliases += company.aliases?.length ?? 0;
console.log(JSON.stringify({
  universe_rows: universe.length,
  alias_count: aliases,
  build_universe_ms: Math.round(tUniverse - t0),
  build_index_ms: Math.round(tIndex - tUniverse),
  first_item_ms: Math.round(tFirst - tIndex),
  next_eight_ms: Math.round(tEight - tFirst),
  first_decision: { status: first.status, ticker: first.ticker, note: first.note },
}, null, 2));
