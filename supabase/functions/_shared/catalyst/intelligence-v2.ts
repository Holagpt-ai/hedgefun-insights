/**
 * Catalyst Intelligence V2 — deterministic normalization, provenance,
 * dedupe, freshness, and availability. No opaque ML scores.
 */

import type { CatalystEventType } from "./contract.ts";
import { isHttpsUrl, normalizeTitleForHash } from "./contract.ts";

/** Normalized taxonomy (single system; maps from legacy event_type + title). */
export type CatalystTaxonomyV2 =
  | "EARNINGS"
  | "GUIDANCE"
  | "SEC_FILING"
  | "OFFERING"
  | "FDA_REGULATORY"
  | "CONTRACT_PARTNERSHIP"
  | "M_AND_A"
  | "MANAGEMENT"
  | "PRODUCT_LAUNCH"
  | "LEGAL"
  | "MACRO_SECTOR"
  | "OTHER_VERIFIED";

export type CatalystAvailability = "verified" | "none" | "unavailable";

export type CatalystFreshnessClass =
  | "breaking"
  | "current"
  | "prior_session"
  | "historical"
  | "stale_for_display";

export type CatalystAuthorityTier = "authoritative" | "market_news" | "secondary";

export interface CatalystRowLike {
  id?: string;
  dedupe_key?: string;
  symbol: string;
  title: string;
  event_type: CatalystEventType | string;
  verification_state?: string;
  event_date: string;
  event_time?: string | null;
  published_at?: string | null;
  source_name?: string | null;
  source_url?: string | null;
  provider?: string | null;
  description?: string | null;
  updated_at?: string | null;
}

export interface CatalystProvenanceV2 {
  source_name: string | null;
  source_url: string | null;
  published_at: string | null;
  fetched_at: string | null;
  symbol: string;
  event_type: string;
  taxonomy_v2: CatalystTaxonomyV2;
  original_title: string;
  verification_state: "provider_reported" | "unknown";
  authority_tier: CatalystAuthorityTier;
  freshness_class: CatalystFreshnessClass;
}

export interface CatalystDisplayContractV2 {
  id: string | null;
  symbol: string;
  title: string;
  taxonomy_v2: CatalystTaxonomyV2;
  event_date: string;
  published_at: string | null;
  source_name: string | null;
  source_url: string | null;
  provider: string | null;
  provenance: CatalystProvenanceV2;
  availability: "verified";
}

export const FRESHNESS_BREAKING_MS = 6 * 60 * 60 * 1000;
export const FRESHNESS_CURRENT_MS = 72 * 60 * 60 * 1000;
export const FRESHNESS_PRIOR_SESSION_MS = 7 * 24 * 60 * 60 * 1000;
export const DEDUPE_PUBLICATION_WINDOW_MS = 6 * 60 * 60 * 1000;
export const MAX_DEDUPED_EVENTS = 500;

const GUIDANCE_RE = /\b(?:guidance|outlook|forecast|raises?\s+guidance|lowers?\s+guidance)\b/i;
const OFFERING_RE = /\b(?:secondary\s+offering|public\s+offering|equity\s+offering|registered\s+direct)\b/i;
const MANAGEMENT_RE = /\b(?:ceo|cfo|chief\s+|appoints?|resigns?|steps\s+down|board\s+of\s+directors)\b/i;
const MACRO_RE = /\b(?:fed\b|fomc|inflation|cpi\b|jobs\s+report|treasury\s+yields?|sector\s+rotation)\b/i;

export function mapToTaxonomyV2(
  eventType: string,
  title: string,
  description?: string | null,
): CatalystTaxonomyV2 {
  const text = `${title} ${description ?? ""}`;
  if (eventType === "fda_biotech") return "FDA_REGULATORY";
  if (eventType === "merger_acquisition") return "M_AND_A";
  if (eventType === "sec_filing_news") return "SEC_FILING";
  if (eventType === "legal") return "LEGAL";
  if (eventType === "analyst_action") return "OTHER_VERIFIED";
  if (eventType === "product_contract") {
    if (/\b(?:launch|unveil|debuts?|introduces?)\b/i.test(text)) return "PRODUCT_LAUNCH";
    return "CONTRACT_PARTNERSHIP";
  }
  if (eventType === "corporate_action") {
    if (OFFERING_RE.test(text)) return "OFFERING";
    return "OTHER_VERIFIED";
  }
  if (eventType === "earnings") {
    if (GUIDANCE_RE.test(text)) return "GUIDANCE";
    return "EARNINGS";
  }
  if (MANAGEMENT_RE.test(text)) return "MANAGEMENT";
  if (MACRO_RE.test(text)) return "MACRO_SECTOR";
  return "OTHER_VERIFIED";
}

export function authorityTierForProvider(provider: string | null | undefined): CatalystAuthorityTier {
  const p = (provider ?? "").toLowerCase();
  if (p === "sec_edgar" || p === "earnings_calendar") return "authoritative";
  if (p === "polygon" || p === "finnhub") return "market_news";
  return "secondary";
}

function authorityRank(tier: CatalystAuthorityTier): number {
  if (tier === "authoritative") return 3;
  if (tier === "market_news") return 2;
  return 1;
}

function eventMomentMs(row: CatalystRowLike): number | null {
  if (row.published_at) {
    const t = Date.parse(row.published_at);
    if (Number.isFinite(t)) return t;
  }
  if (row.event_time) {
    const t = Date.parse(row.event_time);
    if (Number.isFinite(t)) return t;
  }
  if (row.event_date) {
    const t = Date.parse(`${row.event_date}T12:00:00.000Z`);
    if (Number.isFinite(t)) return t;
  }
  return null;
}

export function classifyFreshnessV2(row: CatalystRowLike, nowMs: number): CatalystFreshnessClass {
  const m = eventMomentMs(row);
  if (m === null) return "historical";
  const age = nowMs - m;
  if (age < 0) return "current";
  if (age <= FRESHNESS_BREAKING_MS) return "breaking";
  if (age <= FRESHNESS_CURRENT_MS) return "current";
  if (age <= FRESHNESS_PRIOR_SESSION_MS) return "prior_session";
  if (age <= 30 * 24 * 60 * 60 * 1000) return "historical";
  return "stale_for_display";
}

export function buildProvenanceV2(
  row: CatalystRowLike,
  fetchedAtIso: string,
  nowMs: number = Date.parse(fetchedAtIso),
): CatalystProvenanceV2 {
  const taxonomy_v2 = mapToTaxonomyV2(row.event_type, row.title, row.description);
  return {
    source_name: row.source_name ?? null,
    source_url: row.source_url && isHttpsUrl(row.source_url) ? row.source_url : null,
    published_at: row.published_at ?? null,
    fetched_at: fetchedAtIso,
    symbol: row.symbol.trim().toUpperCase(),
    event_type: row.event_type,
    taxonomy_v2,
    original_title: row.title,
    verification_state: row.verification_state === "provider_reported"
      ? "provider_reported"
      : "unknown",
    authority_tier: authorityTierForProvider(row.provider),
    freshness_class: classifyFreshnessV2(row, nowMs),
  };
}

export function toDisplayContractV2(
  row: CatalystRowLike & { id?: string },
  fetchedAtIso: string,
): CatalystDisplayContractV2 | null {
  if (row.verification_state && row.verification_state !== "provider_reported") return null;
  if (!row.symbol?.trim() || !row.title?.trim() || !row.event_date) return null;
  const provenance = buildProvenanceV2(row, fetchedAtIso);
  if (provenance.verification_state !== "provider_reported") return null;
  return {
    id: row.id ?? null,
    symbol: provenance.symbol,
    title: row.title.trim(),
    taxonomy_v2: provenance.taxonomy_v2,
    event_date: row.event_date,
    published_at: row.published_at ?? null,
    source_name: provenance.source_name,
    source_url: provenance.source_url,
    provider: row.provider ?? null,
    provenance,
    availability: "verified",
  };
}

export function resolveCatalystAvailability(input: {
  queryError: boolean;
  providerFailures?: readonly string[];
  verifiedCount: number;
}): CatalystAvailability {
  if (input.queryError) return "unavailable";
  if (input.verifiedCount > 0) return "verified";
  if ((input.providerFailures?.length ?? 0) > 0) return "unavailable";
  return "none";
}

/** Deterministic dedupe: same symbol + near-identical title within publication window. */
export function dedupeCatalystRows<T extends CatalystRowLike>(
  rows: readonly T[],
  nowMs: number,
): T[] {
  const sorted = [...rows].sort((a, b) => {
    const ta = eventMomentMs(a) ?? 0;
    const tb = eventMomentMs(b) ?? 0;
    if (tb !== ta) return tb - ta;
    const aa = authorityTierForProvider(a.provider);
    const ab = authorityTierForProvider(b.provider);
    if (authorityRank(ab) !== authorityRank(aa)) return authorityRank(ab) - authorityRank(aa);
    return a.symbol.localeCompare(b.symbol);
  });

  const kept: T[] = [];
  const indexByKey = new Map<string, number>();

  for (const row of sorted) {
    if (kept.length >= MAX_DEDUPED_EVENTS) break;
    const sym = row.symbol.trim().toUpperCase();
    const titleKey = normalizeTitleForHash(row.title);
    const moment = eventMomentMs(row) ?? nowMs;
    const bucket = Math.floor(moment / DEDUPE_PUBLICATION_WINDOW_MS);
    const key = `${sym}|${titleKey}|${bucket}`;
    const urlKey = row.source_url && isHttpsUrl(row.source_url)
      ? row.source_url.trim().toLowerCase()
      : "";
    const urlDedupe = urlKey ? `${sym}|${urlKey}` : null;

    if (row.dedupe_key) {
      const dk = `dk:${row.dedupe_key}`;
      if (indexByKey.has(dk)) continue;
    }

    if (urlDedupe && indexByKey.has(urlDedupe)) {
      if (row.dedupe_key) indexByKey.set(`dk:${row.dedupe_key}`, indexByKey.get(urlDedupe)!);
      continue;
    }

    const existingIdx = indexByKey.get(key);
    if (existingIdx !== undefined) {
      const existing = kept[existingIdx];
      const better = authorityRank(authorityTierForProvider(row.provider)) >
          authorityRank(authorityTierForProvider(existing.provider))
        ? row
        : existing;
      kept[existingIdx] = better;
      if (row.dedupe_key) indexByKey.set(`dk:${row.dedupe_key}`, existingIdx);
      continue;
    }

    indexByKey.set(key, kept.length);
    if (urlDedupe) indexByKey.set(urlDedupe, kept.length);
    if (row.dedupe_key) indexByKey.set(`dk:${row.dedupe_key}`, kept.length);
    kept.push(row);
  }
  return kept;
}

export function pickStrongestVerifiedCatalyst<T extends CatalystRowLike>(
  rows: readonly T[],
  symbol: string,
  nowMs: number,
): T | null {
  const sym = symbol.trim().toUpperCase();
  const candidates = dedupeCatalystRows(
    rows.filter((r) =>
      r.verification_state === "provider_reported" &&
      r.symbol.trim().toUpperCase() === sym
    ),
    nowMs,
  );
  if (candidates.length === 0) return null;
  return candidates[0] ?? null;
}

/** Flat facts extension (sanitizeFacts-safe — no forbidden keys). */
export function intelligenceV2Facts(
  row: CatalystRowLike,
  fetchedAtIso: string,
): Record<string, string> {
  const p = buildProvenanceV2(row, fetchedAtIso);
  return {
    v2_taxonomy: p.taxonomy_v2,
    v2_authority_tier: p.authority_tier,
    v2_freshness_class: p.freshness_class,
    v2_fetched_at: fetchedAtIso,
  };
}

export function scannerCatalystSupportingFields(
  row: CatalystRowLike | null,
  fetchedAtIso: string,
): {
  catalyst_verified: boolean;
  catalyst_taxonomy_v2: CatalystTaxonomyV2 | null;
  catalyst_freshness_class: CatalystFreshnessClass | null;
  catalyst_source_name: string | null;
} {
  if (!row || row.verification_state !== "provider_reported") {
    return {
      catalyst_verified: false,
      catalyst_taxonomy_v2: null,
      catalyst_freshness_class: null,
      catalyst_source_name: null,
    };
  }
  const p = buildProvenanceV2(row, fetchedAtIso);
  return {
    catalyst_verified: true,
    catalyst_taxonomy_v2: p.taxonomy_v2,
    catalyst_freshness_class: p.freshness_class,
    catalyst_source_name: p.source_name,
  };
}
