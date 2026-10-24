// Catalyst event visual system (pure).
// Maps live catalyst event types and historical corporate event types onto one
// restrained display category set. No data fetching, no side effects.

import type { CorporateEventType } from "@/config/security-intelligence.config";
import type { EpisodeTemporalRelationship } from "@/config/episode-event-linkage.config";
import type { CatalystEventType } from "@/types/catalyst";
import { classifySecFilingTaxonomy } from "@/lib/catalyst/sec-edgar-events";
import type { CatalystTaxonomyV2 } from "@/lib/catalyst/intelligence-v2";

export const CATALYST_DISPLAY_CATEGORIES = [
  "EARNINGS",
  "GUIDANCE",
  "SEC_FILING",
  "OFFERING",
  "FDA_REGULATORY",
  "CONTRACT_AWARD",
  "PARTNERSHIP",
  "M_AND_A",
  "SPLIT",
  "ANALYST_ACTION",
  "LEGAL",
  "MANAGEMENT",
  "CORPORATE_ACTION",
  "PRESS_RELEASE",
  "OTHER_VERIFIED_EVENT",
] as const;

export type CatalystDisplayCategory = (typeof CATALYST_DISPLAY_CATEGORIES)[number];

export const CATALYST_CATEGORY_LABEL: Record<CatalystDisplayCategory, string> = {
  EARNINGS: "Earnings",
  GUIDANCE: "Guidance",
  SEC_FILING: "SEC Filing",
  OFFERING: "Offering",
  FDA_REGULATORY: "FDA / Regulatory",
  CONTRACT_AWARD: "Contract Award",
  PARTNERSHIP: "Partnership",
  M_AND_A: "M&A",
  SPLIT: "Split",
  ANALYST_ACTION: "Analyst Action",
  LEGAL: "Legal",
  MANAGEMENT: "Management",
  CORPORATE_ACTION: "Corporate Action",
  PRESS_RELEASE: "Press Release",
  OTHER_VERIFIED_EVENT: "Other Verified Event",
};

/**
 * Restrained tone system: only high-signal categories get an accent, everything
 * else stays neutral so the dashboard does not become a color chart.
 */
export function catalystCategoryBadgeClass(category: CatalystDisplayCategory): string {
  switch (category) {
    case "EARNINGS":
    case "GUIDANCE":
      return "border-accent-blue/40 bg-accent-blue/10 text-accent-blue";
    case "FDA_REGULATORY":
    case "M_AND_A":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300";
    case "OFFERING":
    case "LEGAL":
      return "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300";
    default:
      return "border-border bg-muted/50 text-muted-foreground";
  }
}

const LIVE_TYPE_CATEGORY: Record<CatalystEventType, CatalystDisplayCategory> = {
  earnings: "EARNINGS",
  fda_biotech: "FDA_REGULATORY",
  merger_acquisition: "M_AND_A",
  analyst_action: "ANALYST_ACTION",
  sec_filing_news: "SEC_FILING",
  corporate_action: "CORPORATE_ACTION",
  product_contract: "PARTNERSHIP",
  legal: "LEGAL",
  company_news: "PRESS_RELEASE",
};

export function liveEventCategory(type: CatalystEventType): CatalystDisplayCategory {
  return LIVE_TYPE_CATEGORY[type] ?? "OTHER_VERIFIED_EVENT";
}

function taxonomyToDisplayCategory(tax: CatalystTaxonomyV2): CatalystDisplayCategory {
  switch (tax) {
    case "EARNINGS":
      return "EARNINGS";
    case "GUIDANCE":
      return "GUIDANCE";
    case "SEC_FILING":
      return "SEC_FILING";
    case "OFFERING":
      return "OFFERING";
    case "FDA_REGULATORY":
      return "FDA_REGULATORY";
    case "CONTRACT_PARTNERSHIP":
      return "PARTNERSHIP";
    case "M_AND_A":
      return "M_AND_A";
    case "MANAGEMENT":
      return "MANAGEMENT";
    case "LEGAL":
      return "LEGAL";
    case "PRODUCT_LAUNCH":
      return "PARTNERSHIP";
    default:
      return "OTHER_VERIFIED_EVENT";
  }
}

/** SEC rows use form/items taxonomy; others use legacy event_type mapping. */
export function catalystDisplayCategoryFromEvent(input: {
  event_type: CatalystEventType;
  provider?: string | null;
  title?: string;
  description?: string | null;
  facts?: Record<string, unknown> | null;
}): CatalystDisplayCategory {
  if (input.provider === "sec_edgar" && input.event_type === "sec_filing_news") {
    return taxonomyToDisplayCategory(
      classifySecFilingTaxonomy(input.title ?? "", input.description, input.facts),
    );
  }
  return liveEventCategory(input.event_type);
}

/** Display label for scanner, radar, and Catalyst tab rows (SEC taxonomy-aware). */
export function catalystDisplayLabelFromEvent(input: {
  event_type: CatalystEventType;
  provider?: string | null;
  title?: string;
  description?: string | null;
  facts?: Record<string, unknown> | null;
}): string {
  const category = catalystDisplayCategoryFromEvent(input);
  return CATALYST_CATEGORY_LABEL[category];
}

const HISTORICAL_TYPE_CATEGORY: Partial<Record<CorporateEventType, CatalystDisplayCategory>> = {
  EARNINGS: "EARNINGS",
  GUIDANCE: "GUIDANCE",
  SEC_FILING: "SEC_FILING",
  OFFERING: "OFFERING",
  FINANCING: "OFFERING",
  FDA_EVENT: "FDA_REGULATORY",
  CLINICAL_EVENT: "FDA_REGULATORY",
  REGULATORY_EVENT: "FDA_REGULATORY",
  CONTRACT: "CONTRACT_AWARD",
  ORDER: "CONTRACT_AWARD",
  PARTNERSHIP: "PARTNERSHIP",
  M_AND_A: "M_AND_A",
  ACQUISITION: "M_AND_A",
  SPLIT: "SPLIT",
  REVERSE_SPLIT: "SPLIT",
  ANALYST_ACTION: "ANALYST_ACTION",
  LITIGATION: "LEGAL",
  BANKRUPTCY: "LEGAL",
  MANAGEMENT_HIRE: "MANAGEMENT",
  MANAGEMENT_DEPARTURE: "MANAGEMENT",
  CORPORATE_ACTION: "CORPORATE_ACTION",
  DIVIDEND: "CORPORATE_ACTION",
  BUYBACK: "CORPORATE_ACTION",
  OWNERSHIP_CHANGE: "CORPORATE_ACTION",
  PRESS_RELEASE: "PRESS_RELEASE",
};

export function historicalEventCategory(type: CorporateEventType): CatalystDisplayCategory {
  return HISTORICAL_TYPE_CATEGORY[type] ?? "OTHER_VERIFIED_EVENT";
}

/** Non-causal temporal wording for prior linked events. */
export const TEMPORAL_RELATIONSHIP_LABEL: Record<EpisodeTemporalRelationship, string> = {
  EVENT_SAME_SESSION: "Event published earlier that session",
  EVENT_PRECEDES_EPISODE: "Event published before the episode",
  EVENT_FOLLOWS_EPISODE: "Event followed the episode",
  TEMPORALLY_ASSOCIATED: "Temporally associated",
};
