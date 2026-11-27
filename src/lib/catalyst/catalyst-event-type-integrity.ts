import type { CatalystEventType } from "@/types/catalyst";
import { isEditorialCatalystArticle } from "@/lib/catalyst/editorial-source";
import {
  isAuthoritativeIssuerProvider,
  isDirectIssuerCatalyst,
} from "@/lib/catalyst/presentation";

const INFERRED_CORPORATE_EVENT_TYPES = new Set<CatalystEventType>([
  "merger_acquisition",
  "earnings",
  "fda_biotech",
  "analyst_action",
  "product_contract",
  "corporate_action",
  "legal",
]);

/**
 * Headline classifier output must not present as a verified corporate event class
 * for editorial/third-party publishers or non-direct issuer attribution.
 */
export function reconcileCatalystEventTypeForPresentation(input: {
  event_type: CatalystEventType;
  provider?: string | null;
  source_name?: string | null;
  title?: string | null;
  attribution_class?: "direct" | "provider_associated" | "sector_related" | "unverified" | null;
  ticker_specific?: boolean | null;
}): CatalystEventType {
  if (isAuthoritativeIssuerProvider(input.provider)) {
    return input.event_type;
  }
  if (input.event_type === "sec_filing_news") {
    return "sec_filing_news";
  }
  if (isEditorialCatalystArticle(input)) {
    return "company_news";
  }
  if (
    INFERRED_CORPORATE_EVENT_TYPES.has(input.event_type)
    && !isDirectIssuerCatalyst(input)
  ) {
    return "company_news";
  }
  return input.event_type;
}