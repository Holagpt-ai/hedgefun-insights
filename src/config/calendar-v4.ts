import type { HomepageCalendarTab } from "@/config/homepage-v21";

/** Full calendar query params (extends homepage `calDate` / `calTab`). */
export const CALENDAR_V4_QUERY = {
  date: "calDate",
  tab: "calTab",
  filter: "calFilter",
  view: "calView",
  event: "calEvent",
  q: "q",
} as const;

export type CalendarV4View = "month" | "list";

export const CALENDAR_V4_PRIMARY_FILTERS = [
  "all",
  "watchlist",
  "earnings",
  "macro",
  "high_impact",
] as const;

export type CalendarV4PrimaryFilter = (typeof CALENDAR_V4_PRIMARY_FILTERS)[number];

export const CALENDAR_V4_PRIMARY_FILTER_LABEL: Record<CalendarV4PrimaryFilter, string> = {
  all: "All",
  watchlist: "Watchlist",
  earnings: "Earnings",
  macro: "Macro",
  high_impact: "High Impact",
};

/** Maps homepage tab → default primary filter on `/calendar`. */
export function calendarTabToPrimaryFilter(tab: HomepageCalendarTab): CalendarV4PrimaryFilter {
  if (tab === "earnings") return "earnings";
  if (tab === "economic") return "macro";
  return "all";
}

export type CalendarV4LegendCategory =
  | "earnings"
  | "economic"
  | "fda_regulatory"
  | "legal"
  | "product"
  | "motion_mna"
  | "dividends"
  | "lockup"
  | "sec_filing"
  | "sentiment"
  | "other";

export const CALENDAR_V4_LEGEND: {
  id: CalendarV4LegendCategory;
  label: string;
  chipClass: string;
}[] = [
  { id: "earnings", label: "Earnings", chipClass: "cal-chip--earnings" },
  { id: "economic", label: "Economic", chipClass: "cal-chip--economic" },
  { id: "fda_regulatory", label: "FDA / Regulatory", chipClass: "cal-chip--fda" },
  { id: "legal", label: "Legal", chipClass: "cal-chip--legal" },
  { id: "product", label: "Product", chipClass: "cal-chip--product" },
  { id: "motion_mna", label: "M&A", chipClass: "cal-chip--ma" },
  { id: "dividends", label: "Dividends", chipClass: "cal-chip--dividend" },
  { id: "lockup", label: "Lockups", chipClass: "cal-chip--lockup" },
  { id: "sec_filing", label: "SEC filings", chipClass: "cal-chip--sec" },
  { id: "sentiment", label: "Sentiment", chipClass: "cal-chip--sentiment" },
  { id: "other", label: "Other", chipClass: "cal-chip--other" },
];

export const CALENDAR_V4_PAGE_TITLE = "Catalyst Calendar";
export const CALENDAR_V4_META_DESCRIPTION =
  "Browse scheduled earnings, macro releases, and verified market catalysts on Stocksist. Month and list views with filters, charts, and AI context where cached.";