import { HOMEPAGE_CALENDAR_QUERY, type HomepageCalendarTab } from "@/config/homepage-v21";
import { CALENDAR_V4_QUERY, calendarTabToPrimaryFilter } from "@/config/calendar-v4";

export type HomepageCalendarOutbound =
  | { kind: "link"; href: string }
  | { kind: "info" };

export function buildHomepageCalendarOutbound(
  tab: HomepageCalendarTab,
  isoDate: string,
): HomepageCalendarOutbound {
  if (tab === "earnings") {
    const params = new URLSearchParams({ [HOMEPAGE_CALENDAR_QUERY.date]: isoDate });
    return { kind: "link", href: `/earnings?${params.toString()}` };
  }
  const params = new URLSearchParams({
    [HOMEPAGE_CALENDAR_QUERY.date]: isoDate,
    [HOMEPAGE_CALENDAR_QUERY.tab]: tab,
    [CALENDAR_V4_QUERY.filter]: calendarTabToPrimaryFilter(tab),
  });
  return { kind: "link", href: `/calendar?${params.toString()}` };
}