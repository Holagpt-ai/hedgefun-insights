import { HOMEPAGE_CALENDAR_QUERY, type HomepageCalendarTab } from "@/config/homepage-v21";
import { CALENDAR_V4_QUERY, calendarTabToPrimaryFilter, type CalendarV4PrimaryFilter, type CalendarV4View } from "@/config/calendar-v4";

export interface CalendarDeepLinkInput {
  isoDate: string;
  tab: HomepageCalendarTab;
  view?: CalendarV4View;
  filter?: CalendarV4PrimaryFilter;
  eventId?: string;
}

export function buildCalendarV4Href(input: CalendarDeepLinkInput): string {
  const params = new URLSearchParams({
    [HOMEPAGE_CALENDAR_QUERY.date]: input.isoDate,
    [HOMEPAGE_CALENDAR_QUERY.tab]: input.tab,
    [CALENDAR_V4_QUERY.filter]: input.filter ?? calendarTabToPrimaryFilter(input.tab),
  });
  if (input.view) params.set(CALENDAR_V4_QUERY.view, input.view);
  if (input.eventId) params.set(CALENDAR_V4_QUERY.event, input.eventId);
  return `/calendar?${params.toString()}`;
}

/** @deprecated Use `buildCalendarV4Href` — kept for callers migrating from earnings handoff. */
export function buildCalendarDeepLink(isoDate: string, tab: HomepageCalendarTab): string {
  return buildCalendarV4Href({ isoDate, tab });
}