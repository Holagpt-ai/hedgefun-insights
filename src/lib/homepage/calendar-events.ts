import type { CatalystEvent } from "@/types/catalyst";
import { HOMEPAGE_CALENDAR_QUERY, type HomepageCalendarTab } from "@/config/homepage-v21";

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

function eventStatus(event: CatalystEvent, etToday: string): HomepageCalendarEvent["status"] {
  if (event.event_date > etToday) return "scheduled";
  if (event.event_date < etToday) return "reported";
  return "scheduled";
}

export function catalystToHomepageEvent(
  event: CatalystEvent,
  tab: HomepageCalendarTab,
  etToday: string,
): HomepageCalendarEvent {
  return {
    eventId: event.id,
    type: tab,
    title: event.title,
    symbols: [event.symbol, ...(event.related_symbols ?? [])].filter(Boolean),
    eventDate: event.event_date,
    eventTime: event.event_time,
    impact: impactFromEvent(event),
    source: event.source_name,
    status: eventStatus(event, etToday),
  };
}

export function filterCatalystEventsForDay(
  events: CatalystEvent[] | undefined,
  isoDate: string,
  tab: HomepageCalendarTab,
  etToday: string,
): HomepageCalendarEvent[] {
  if (!events?.length) return [];
  const dayRows = events.filter((e) => e.event_date === isoDate);
  if (tab === "earnings") {
    return dayRows
      .filter((e) => e.event_type === "earnings")
      .map((e) => catalystToHomepageEvent(e, "earnings", etToday));
  }
  if (tab === "catalyst") {
    return dayRows
      .filter((e) => e.event_type !== "earnings")
      .map((e) => catalystToHomepageEvent(e, "catalyst", etToday));
  }
  return [];
}

export { buildCalendarV4Href as buildCalendarDeepLink } from "@/lib/calendar-v4/deep-link";
export { buildHomepageCalendarOutbound } from "@/lib/homepage/calendar-outbound";