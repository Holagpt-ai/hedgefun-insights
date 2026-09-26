/**
 * Client mirror of supabase/functions/_shared/catalyst/intelligence-v2.ts
 * Keep in sync when changing normalization rules.
 */

import type { CatalystEventType } from "@/types/catalyst";

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
  published_at?: string | null;
  provider?: string | null;
}

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
