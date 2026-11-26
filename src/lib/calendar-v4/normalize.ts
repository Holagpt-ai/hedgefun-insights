import type { CatalystEvent } from "@/types/catalyst";
import type { CalendarV4LegendCategory } from "@/config/calendar-v4";
import type { HomepageCalendarTab } from "@/config/homepage-v21";
import { catalystFeedCategoryForEvent } from "@/lib/catalyst/catalyst-filters";
import { isHighSignalCatalystEvent } from "@/lib/catalyst/catalyst-discovery-priority";
import type { CalendarV4Event, CalendarV4EventStatus, CalendarV4Impact } from "@/lib/calendar-v4/contract";
import type { EconomicCalendarRow } from "@/lib/calendar-v4/economic-types";

function impactFromFacts(event: CatalystEvent): { impact: CalendarV4Impact; evidence: boolean } {
  const facts = event.facts ?? {};
  const raw = typeof facts.impact === "string" ? facts.impact.toLowerCase() : "";
  if (raw === "high" || raw === "medium" || raw === "low") {
    return { impact: raw, evidence: true };
  }
  if (isHighSignalCatalystEvent(event)) {
    return { impact: "high", evidence: true };
  }
  return { impact: "unknown", evidence: false };
}

function statusForCatalyst(event: CatalystEvent, etToday: string): CalendarV4EventStatus {
  if (event.event_date > etToday) return "scheduled";
  if (event.event_date < etToday) return "reported";
  const canceled =
    typeof event.facts?.status === "string" && event.facts.status.toLowerCase() === "cancelled";
  return canceled ? "cancelled" : "scheduled";
}

function legendFromCatalyst(event: CatalystEvent): CalendarV4LegendCategory {
  if (event.event_type === "earnings") return "earnings";
  const category = catalystFeedCategoryForEvent(event);
  switch (category) {
    case "FDA_REGULATORY":
      return "fda_regulatory";
    case "LEGAL":
      return "legal";
    case "M_AND_A":
      return "motion_mna";
    case "SEC_FILING":
      return "sec_filing";
    case "CONTRACT_AWARD":
    case "PARTNERSHIP":
    case "PRESS_RELEASE":
      return "product";
    case "CORPORATE_ACTION":
      return "dividends";
    case "ANALYST_ACTION":
      return "sentiment";
    default:
      return "other";
  }
}

export function catalystToCalendarV4Event(
  event: CatalystEvent,
  etToday: string,
  retrievedAt: string | null,
): CalendarV4Event {
  const { impact, evidence } = impactFromFacts(event);
  const feedType: HomepageCalendarTab | "catalyst" =
    event.event_type === "earnings" ? "earnings" : "catalyst";
  return {
    eventId: event.id,
    dedupeKey: event.dedupe_key ?? null,
    securityId: typeof event.facts?.security_id === "string" ? event.facts.security_id : null,
    symbols: [event.symbol, ...(event.related_symbols ?? [])].filter(Boolean),
    companyName: event.company_name,
    feedType,
    legendCategory: legendFromCatalyst(event),
    title: event.title,
    description: event.description,
    eventDate: event.event_date,
    eventTime: event.event_time,
    publishedAt: event.published_at,
    status: statusForCatalyst(event, etToday),
    impact,
    hasImpactEvidence: evidence,
    source: event.source_name,
    sourceUrl: event.source_url,
    retrievedAt,
    provider: event.provider,
    aiSummaryId: typeof event.facts?.ai_summary_id === "string" ? event.facts.ai_summary_id : null,
  };
}

function economicImportanceToImpact(importance: string | null | undefined): CalendarV4Impact {
  const v = (importance ?? "").toLowerCase();
  if (v === "high" || v === "3") return "high";
  if (v === "medium" || v === "2") return "medium";
  if (v === "low" || v === "1") return "low";
  return "unknown";
}

export function economicToCalendarV4Event(row: EconomicCalendarRow, etToday: string): CalendarV4Event {
  const impact = economicImportanceToImpact(row.importance);
  const status: CalendarV4EventStatus =
    row.event_date > etToday ? "scheduled" : row.event_date < etToday ? "reported" : "scheduled";
  return {
    eventId: row.id,
    dedupeKey: row.dedupe_key ?? null,
    securityId: null,
    symbols: [],
    companyName: null,
    feedType: "economic",
    legendCategory: "economic",
    title: row.event_name,
    description: row.description,
    eventDate: row.event_date,
    eventTime: row.event_time,
    publishedAt: row.actual_reported_at,
    status,
    impact,
    hasImpactEvidence: impact !== "unknown",
    source: row.source ?? "Macro calendar",
    sourceUrl: row.source_url,
    retrievedAt: row.fetched_at,
    provider: row.provider ?? "economic",
    aiSummaryId: null,
  };
}

export function dedupeCalendarEvents(events: CalendarV4Event[]): CalendarV4Event[] {
  const seen = new Set<string>();
  const out: CalendarV4Event[] = [];
  for (const e of events) {
    const key = e.dedupeKey ?? e.eventId;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}