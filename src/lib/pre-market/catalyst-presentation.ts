/**
 * Presentation-only catalyst relevance labels for AM Inbox.
 * Does not rewrite persisted provider rows or ingestion attribution.
 */

import { EARNINGS_CALENDAR_PROVIDER, etCalendarDateFromIso } from "@/lib/pre-market/builders";

export type CatalystPresentationClass =
  | "direct_catalyst"
  | "provider_associated"
  | "sector_related"
  | "commentary"
  | "legal_shareholder_notice";

export const CATALYST_PRESENTATION_LABEL: Record<CatalystPresentationClass, string> = {
  direct_catalyst: "Direct catalyst",
  provider_associated: "Provider associated",
  sector_related: "Sector related",
  commentary: "Commentary",
  legal_shareholder_notice: "Legal / shareholder notice",
};

export interface CatalystPresentationInput {
  title: string;
  provider: string;
  event_type: string;
  event_date: string;
  event_time?: string | null;
  published_at?: string | null;
  source_name?: string | null;
  attribution_class?: "direct" | "provider_associated" | "sector_related" | "unverified";
  attribution_reason?: string;
  ticker_specific?: boolean;
}

const LEGAL_TITLE: RegExp[] = [
  /\bclass[- ]actions?\b/i,
  /\bsecurities[- ](?:class[- ]action|fraud|litigation)\b/i,
  /\binvestors?\s+(?:who\s+(?:purchased|acquired)|losses?|loss\s+alert)\b/i,
  /\b(?:shareholders?|stockholders?)\s+(?:alert|lawsuit|class[- ]action|investigation)\b/i,
  /\blead\s+plaintiff\b/i,
  /\blaw\s+firm\b/i,
  /\bsecurities\s+law\b/i,
  /\b(?:remind(?:s|er)?|notifies)\s+investors?\b/i,
  /\binvestigation\s+(?:of|into)\b.{0,80}\b(?:securities|shareholders?|investors?)\b/i,
  /\bdeadline\b.{0,40}\b(?:investors?|shareholders?)\b/i,
];

const COMMENTARY_TITLE: RegExp[] = [
  /\bvs\.?\b/i,
  /\bwhich\s+stocks?\b/i,
  /\bis\s+.{0,80}\bstill\s+a\s+buy\b/i,
  /\bstill\s+a\s+buy\s*\??\s*$/i,
  /\bworth\s+(?:buying|a\s+buy)\b/i,
  /\bshould\s+you\s+(?:buy|sell|hold)\b/i,
  /\bbuy[, ]\s*hold[, ]\s*(?:or\s+)?sell\b/i,
];

function isEarningsCalendar(row: CatalystPresentationInput): boolean {
  return row.provider === EARNINGS_CALENDAR_PROVIDER && row.event_type === "earnings";
}

export function looksLikeLegalShareholderNotice(
  title: string,
  sourceName?: string | null,
): boolean {
  const blob = `${title} ${sourceName ?? ""}`;
  return LEGAL_TITLE.some((p) => p.test(blob));
}

export function looksLikeCommentary(title: string): boolean {
  return COMMENTARY_TITLE.some((p) => p.test(title));
}

/**
 * Conservative display class. Direct catalyst requires ticker-specific
 * persisted evidence plus a direct attribution class (or an earnings-calendar
 * record). Provider association alone is never enough.
 */
export function classifyCatalystPresentation(
  row: CatalystPresentationInput,
): CatalystPresentationClass {
  if (looksLikeLegalShareholderNotice(row.title, row.source_name)) {
    return "legal_shareholder_notice";
  }
  if (looksLikeCommentary(row.title)) return "commentary";
  if (row.attribution_class === "sector_related") return "sector_related";
  if (row.attribution_class === "provider_associated") return "provider_associated";
  if (isEarningsCalendar(row)) return "direct_catalyst";
  if (row.ticker_specific === true && row.attribution_class === "direct") {
    return "direct_catalyst";
  }
  return "provider_associated";
}

export function catalystPresentationLabel(row: CatalystPresentationInput): string {
  return CATALYST_PRESENTATION_LABEL[classifyCatalystPresentation(row)];
}

/**
 * News/catalyst "Today" uses the event/publication timestamp in Eastern Time.
 * Scheduled earnings-calendar rows keep the established event_date rule.
 */
export function catalystTodayCalendarDate(row: CatalystPresentationInput): string {
  if (isEarningsCalendar(row)) return row.event_date;
  const fromTime = etCalendarDateFromIso(row.event_time);
  if (fromTime) return fromTime;
  const fromPublished = etCalendarDateFromIso(row.published_at);
  if (fromPublished) return fromPublished;
  return row.event_date;
}

export function isCatalystPresentedToday(
  row: CatalystPresentationInput,
  etDate: string,
): boolean {
  if (!etDate) return false;
  return catalystTodayCalendarDate(row) === etDate;
}
