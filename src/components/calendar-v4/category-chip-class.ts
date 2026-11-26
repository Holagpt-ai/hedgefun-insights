import { CALENDAR_V4_LEGEND } from "@/config/calendar-v4";
import type { CalendarV4LegendCategory } from "@/config/calendar-v4";

const MAP = new Map(CALENDAR_V4_LEGEND.map((e) => [e.id, e.chipClass]));

export function chipClassForCategory(category: CalendarV4LegendCategory): string {
  return MAP.get(category) ?? "cal-chip--other";
}