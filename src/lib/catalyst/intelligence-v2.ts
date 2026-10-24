/**
 * Client mirror of supabase/functions/_shared/catalyst/intelligence-v2.ts
 * Keep in sync when changing normalization rules.
 */

import type { CatalystEventType } from "@/types/catalyst";
import { classifySecFilingTaxonomy } from "@/lib/catalyst/sec-edgar-events";

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

export interface CatalystRowLike {
  symbol: string;
  title: string;
  event_type: CatalystEventType | string;
  verification_state?: string;
  event_date: string;
  event_time?: string | null;
  published_at?: string | null;
  provider?: string | null;
  description?: string | null;
  facts?: Record<string, unknown> | null;
}

export const FRESHNESS_BREAKING_MS = 6 * 60 * 60 * 1000;
export const FRESHNESS_CURRENT_MS = 72 * 60 * 60 * 1000;
export const FRESHNESS_PRIOR_SESSION_MS = 7 * 24 * 60 * 60 * 1000;

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

export function mapToTaxonomyV2(
  eventType: string,
  title: string,
  description?: string | null,
  facts?: Record<string, unknown> | null,
): CatalystTaxonomyV2 {
  const text = `${title} ${description ?? ""}`;
  if (eventType === "fda_biotech") return "FDA_REGULATORY";
  if (eventType === "merger_acquisition") return "M_AND_A";
  if (eventType === "sec_filing_news") {
    return classifySecFilingTaxonomy(title, description, facts);
  }
  if (eventType === "legal") return "LEGAL";
  if (eventType === "earnings") {
    return /\b(?:guidance|outlook|forecast)\b/i.test(text) ? "GUIDANCE" : "EARNINGS";
  }
  if (eventType === "product_contract") {
    return /\b(?:launch|unveil|debuts?|introduces?)\b/i.test(text)
      ? "PRODUCT_LAUNCH"
      : "CONTRACT_PARTNERSHIP";
  }
  return "OTHER_VERIFIED";
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

/** Watchlist Finnhub news quality → three-state availability. */
export function watchlistNewsCatalystAvailability(
  quality: "ok" | "missing" | "none_qualifying",
): CatalystAvailability {
  if (quality === "missing") return "unavailable";
  if (quality === "none_qualifying") return "none";
  return "verified";
}
