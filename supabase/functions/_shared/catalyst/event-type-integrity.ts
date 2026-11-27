import type { CatalystEventType } from "./contract.ts";
import type { AttributionClass } from "./attribution.ts";
import { isEditorialCatalystArticle } from "./editorial-source.ts";

const INFERRED_CORPORATE: Set<CatalystEventType> = new Set([
  "merger_acquisition",
  "earnings",
  "fda_biotech",
  "analyst_action",
  "product_contract",
  "corporate_action",
  "legal",
]);

const AUTHORITATIVE_PROVIDERS = new Set([
  "sec_edgar",
  "earnings_calendar",
  "company_ir",
  "COMPANY_IR",
]);

export function reconcileIngestCatalystEventType(input: {
  event_type: CatalystEventType;
  provider: string;
  source_name: string | null;
  title: string;
  attribution_class: AttributionClass;
  ticker_specific: boolean;
}): CatalystEventType {
  if (AUTHORITATIVE_PROVIDERS.has(input.provider)) return input.event_type;
  if (input.event_type === "sec_filing_news") return input.event_type;
  if (isEditorialCatalystArticle({ source_name: input.source_name, title: input.title })) {
    return "company_news";
  }
  const direct =
    input.attribution_class === "direct"
    || input.attribution_class === "provider_associated";
  if (INFERRED_CORPORATE.has(input.event_type) && !direct) {
    return "company_news";
  }
  if (INFERRED_CORPORATE.has(input.event_type) && !input.ticker_specific) {
    return "company_news";
  }
  return input.event_type;
}