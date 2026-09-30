/**
 * Lightweight catalyst relevance classification (not full Catalyst Intelligence).
 */

import {
  attributeSymbol,
  type AttributionClass,
  type AttributionInput,
  type AttributionResult,
} from "@/lib/catalyst/attribution";

export type CatalystRelevanceClass =
  | "DIRECT"
  | "PRIMARY"
  | "SECONDARY"
  | "SECTOR"
  | "MENTION"
  | "UNKNOWN";

export interface CatalystRelevanceResult {
  class: CatalystRelevanceClass;
  confidence: "high" | "medium" | "low";
  reason: string;
  tickerSpecific: boolean;
}

const DIRECT_EVENT_TYPES = new Set([
  "earnings",
  "sec_filing_news",
  "fda_biotech",
  "merger_acquisition",
  "product_contract",
  "legal",
]);

function mapAttributionClass(attribution: AttributionResult): CatalystRelevanceClass {
  switch (attribution.class) {
    case "direct":
      return "DIRECT";
    case "provider_associated":
      return attribution.ticker_specific ? "PRIMARY" : "SECONDARY";
    case "sector_related":
      return "SECTOR";
    case "unverified":
      return "MENTION";
    default:
      return "UNKNOWN";
  }
}

export function classifyCatalystRelevance(input: {
  attribution: AttributionInput;
  eventType?: string | null;
}): CatalystRelevanceResult {
  const attribution = attributeSymbol(input.attribution);
  let relevance = mapAttributionClass(attribution);

  if (
    input.eventType &&
    DIRECT_EVENT_TYPES.has(input.eventType) &&
    attribution.class === "direct"
  ) {
    relevance = "DIRECT";
  }

  if (relevance === "PRIMARY" && !attribution.ticker_specific) {
    relevance = "SECONDARY";
  }

  const confidence: CatalystRelevanceResult["confidence"] =
    relevance === "DIRECT" || relevance === "PRIMARY"
      ? "high"
      : relevance === "SECONDARY" || relevance === "SECTOR"
        ? "medium"
        : "low";

  return {
    class: relevance,
    confidence,
    reason: attribution.reason,
    tickerSpecific: attribution.ticker_specific,
  };
}

export function catalystRelevanceScoreWeight(relevance: CatalystRelevanceClass): number {
  switch (relevance) {
    case "DIRECT":
      return 1;
    case "PRIMARY":
      return 0.85;
    case "SECONDARY":
      return 0.55;
    case "SECTOR":
      return 0.35;
    case "MENTION":
      return 0.15;
    default:
      return 0;
  }
}

export type { AttributionClass, AttributionInput };
