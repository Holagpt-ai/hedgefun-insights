import type { HomepageCalendarTab } from "@/config/homepage-v21";
import type { CalendarV4LegendCategory } from "@/config/calendar-v4";

export type CalendarV4Impact = "high" | "medium" | "low" | "unknown";

export type CalendarV4EventStatus = "scheduled" | "reported" | "cancelled" | "unknown";

/** Normalized calendar row — shared by homepage widget and `/calendar`. */
export interface CalendarV4Event {
  eventId: string;
  dedupeKey: string | null;
  securityId: string | null;
  symbols: string[];
  companyName: string | null;
  feedType: HomepageCalendarTab | "catalyst";
  legendCategory: CalendarV4LegendCategory;
  title: string;
  description: string | null;
  eventDate: string;
  eventTime: string | null;
  publishedAt: string | null;
  status: CalendarV4EventStatus;
  impact: CalendarV4Impact;
  hasImpactEvidence: boolean;
  source: string;
  sourceUrl: string | null;
  retrievedAt: string | null;
  provider: string;
  aiSummaryId: string | null;
}