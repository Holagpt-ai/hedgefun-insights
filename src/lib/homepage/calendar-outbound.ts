import { HOMEPAGE_CALENDAR_QUERY, type HomepageCalendarTab } from "@/config/homepage-v21";

export type HomepageCalendarOutbound =
  | { kind: "link"; href: string }
  | { kind: "info" };

/** Temporary public destinations until Catalyst Calendar V4 ships — no earnings mislabeling. */
export function buildHomepageCalendarOutbound(
  tab: HomepageCalendarTab,
  isoDate: string,
): HomepageCalendarOutbound {
  if (tab === "earnings") {
    const params = new URLSearchParams({ [HOMEPAGE_CALENDAR_QUERY.date]: isoDate });
    return { kind: "link", href: `/earnings?${params.toString()}` };
  }
  return { kind: "info" };
}