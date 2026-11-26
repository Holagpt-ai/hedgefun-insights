/** Muse Homepage V21 — section order, widgets, and static copy (no mock market numbers). */

export const HOMEPAGE_V21_HEADLINE = "Stock Market Intelligence for Every Investor";

/** Ten index proxy symbols — values are ETF prices, not cash index levels. */
export const HOMEPAGE_V21_INDEX_SYMBOLS = [
  "SPY",
  "QQQ",
  "DIA",
  "IWM",
  "VIXY",
  "GLD",
  "SLV",
  "IBIT",
  "BNO",
  "UNG",
] as const;

export const HOMEPAGE_V21_INDEX_PAGE_SIZE = 5;

export type HomepageCalendarTab = "catalyst" | "earnings" | "economic";

export const HOMEPAGE_V21_CALENDAR_TABS: { id: HomepageCalendarTab; label: string }[] = [
  { id: "catalyst", label: "Catalyst" },
  { id: "earnings", label: "Earnings" },
  { id: "economic", label: "Economic" },
];

export type HomepageMoversTab = "gainers" | "losers" | "active";

export const HOMEPAGE_V21_MOVERS_TABS: { id: HomepageMoversTab; label: string; href: string }[] = [
  { id: "gainers", label: "Gainers", href: "/markets/gainers" },
  { id: "losers", label: "Losers", href: "/markets/losers" },
  { id: "active", label: "Most Active", href: "/markets/active" },
];

/** Full calendar handoff query keys (Catalyst Calendar V4 consumer contract). */
export const HOMEPAGE_CALENDAR_QUERY = {
  date: "calDate",
  tab: "calTab",
} as const;

export const HOMEPAGE_V21_BASICS_HREF = "/articles";
export const HOMEPAGE_V21_AD_MIN_WIDTH_PX = 1024;