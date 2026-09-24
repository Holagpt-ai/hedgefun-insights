import type { CorporateEventType } from "@/config/security-intelligence.config";
import type { CatalystEventType } from "@/types/catalyst";
import type { SecurityId } from "@/types/security-identity";

export interface CatalystCorporateEventDraft {
  securityId: SecurityId;
  observedSymbol: string | null;
  eventType: CorporateEventType;
  eventAt: string;
  publishedAt: string;
  title: string;
  summary: string | null;
  source: string;
  sourceUrl: string | null;
  providerEventId: string;
}

const CATALYST_TO_CORPORATE: Record<CatalystEventType, CorporateEventType> = {
  earnings: "EARNINGS",
  fda_biotech: "FDA_EVENT",
  merger_acquisition: "M_AND_A",
  analyst_action: "ANALYST_ACTION",
  sec_filing_news: "SEC_FILING",
  corporate_action: "CORPORATE_ACTION",
  product_contract: "CONTRACT",
  legal: "LITIGATION",
  company_news: "PRESS_RELEASE",
};

export function mapCatalystEventTypeToCorporate(
  catalystType: CatalystEventType,
): CorporateEventType {
  return CATALYST_TO_CORPORATE[catalystType] ?? "OTHER";
}

/** Build a corporate_events row draft from a live catalyst feed row (no network I/O). */
export function catalystRowToCorporateEventDraft(input: {
  securityId: SecurityId;
  dedupeKey: string;
  symbol: string;
  eventType: CatalystEventType;
  eventDate: string;
  eventTime: string | null;
  title: string;
  description: string | null;
  sourceName: string;
  sourceUrl: string | null;
  provider: string;
  publishedAt: string | null;
}): CatalystCorporateEventDraft | null {
  const title = input.title.trim();
  if (!title) return null;
  const publishedAt = input.publishedAt?.trim() || input.eventTime?.trim() || `${input.eventDate}T21:00:00.000Z`;
  const parsedPublished = Date.parse(publishedAt);
  if (!Number.isFinite(parsedPublished)) return null;
  const eventAt = input.eventTime?.trim() || publishedAt;
  const parsedEventAt = Date.parse(eventAt);
  if (!Number.isFinite(parsedEventAt)) return null;

  return {
    securityId: input.securityId,
    observedSymbol: input.symbol.trim().toUpperCase() || null,
    eventType: mapCatalystEventTypeToCorporate(input.eventType),
    eventAt: new Date(parsedEventAt).toISOString(),
    publishedAt: new Date(parsedPublished).toISOString(),
    title,
    summary: input.description?.trim() || null,
    source: input.provider || input.sourceName,
    sourceUrl: input.sourceUrl,
    providerEventId: input.dedupeKey,
  };
}
