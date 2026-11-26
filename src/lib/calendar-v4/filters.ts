import type { CalendarV4LegendCategory, CalendarV4PrimaryFilter } from "@/config/calendar-v4";
import type { CalendarV4Event } from "@/lib/calendar-v4/contract";

export function applyCalendarPrimaryFilter(
  events: CalendarV4Event[],
  filter: CalendarV4PrimaryFilter,
  watchlistSymbols: ReadonlySet<string> | null,
): CalendarV4Event[] {
  switch (filter) {
    case "all":
      return events;
    case "earnings":
      return events.filter((e) => e.feedType === "earnings" || e.legendCategory === "earnings");
    case "macro":
      return events.filter((e) => e.feedType === "economic");
    case "high_impact":
      return events.filter((e) => e.hasImpactEvidence && e.impact === "high");
    case "watchlist": {
      if (!watchlistSymbols?.size) return [];
      return events.filter((e) =>
        e.symbols.some((s) => watchlistSymbols.has(s.toUpperCase())),
      );
    }
    default:
      return events;
  }
}

export function filterCalendarByTickerSearch(events: CalendarV4Event[], query: string): CalendarV4Event[] {
  const q = query.trim().toUpperCase();
  if (!q) return events;
  return events.filter(
    (e) =>
      e.symbols.some((s) => s.toUpperCase().includes(q)) ||
      e.title.toUpperCase().includes(q) ||
      (e.companyName ?? "").toUpperCase().includes(q),
  );
}

export function eventsForDay(events: CalendarV4Event[], iso: string): CalendarV4Event[] {
  return events.filter((e) => e.eventDate === iso);
}

export function countHighImpact(events: CalendarV4Event[]): number {
  return events.filter((e) => e.hasImpactEvidence && e.impact === "high").length;
}

export function applyLegendCategoryFilter(
  events: CalendarV4Event[],
  hidden: ReadonlySet<CalendarV4LegendCategory>,
): CalendarV4Event[] {
  if (!hidden.size) return events;
  return events.filter((e) => !hidden.has(e.legendCategory));
}