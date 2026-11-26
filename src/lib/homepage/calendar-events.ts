import type { CatalystEvent } from "@/types/catalyst";
import type { HomepageCalendarTab } from "@/config/homepage-v21";

/** Normalized homepage calendar row — shared contract for Catalyst Calendar V4. */
export interface HomepageCalendarEvent {
  eventId: string;
  type: HomepageCalendarTab | "catalyst";
  title: string;
  symbols: string[];
  eventDate: string;
  eventTime: string | null;
  impact: "high" | "medium" | "low" | "unknown";
  source: string;
  status: "scheduled" | "reported" | "unknown";
}

function impactFromEvent(event: CatalystEvent): HomepageCalendarEvent["impact"] {
  const facts = event.facts ?? {};
  const raw = typeof facts.impact === "string" ? facts.impact.toLowerCase() : "";
  if (raw === "high" || raw === "medium" || raw === "low") return raw;
  return "unknown";
}

export function catalystToHomepageEvent(event: CatalystEvent, tab: HomepageCalendarTab): HomepageCalendarEvent {
  const reported = event.published_at && event.event_date <= new Date().toISOString().slice(0, 10);
  return {
    eventId: event.id,
    type: tab,
    title: event.title,
    symbols: [event.symbol, ...(event.related_symbols ?? [])].filter(Boolean),
    eventDate: event.event_date,
    eventTime: event.event_time,
    impact: impactFromEvent(event),
    source: event.source_name,
    status: reported ? "reported" : "scheduled",
  };
}

export function filterCatalystEventsForDay(
  events: CatalystEvent[] | undefined,
  isoDate: string,
  tab: HomepageCalendarTab,
): HomepageCalendarEvent[] {
  if (!events?.length) return [];
  const dayRows = events.filter((e) => e.event_date === isoDate);
  if (tab === "earnings") {
    return dayRows
      .filter((e) => e.event_type === "earnings")
      .map((e) => catalystToHomepageEvent(e, "earnings"));
  }
  if (tab === "catalyst") {
    return dayRows
      .filter((e) => e.event_type !== "earnings")
      .map((e) => catalystToHomepageEvent(e, "catalyst"));
  }
  return [];
}

export function buildCalendarDeepLink(isoDate: string, tab: HomepageCalendarTab): string {
  const params = new URLSearchParams({
    calDate: isoDate,
    calTab: tab,
  });
  return `/earnings?${params.toString()}`;
}