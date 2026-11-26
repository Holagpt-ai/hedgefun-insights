import { MARKET_EARLY_CLOSES, marketHolidayName } from "@/lib/market-calendar";
import type { CatalystEvent } from "@/types/catalyst";
import type { HomepageCalendarTab } from "@/config/homepage-v21";

export interface CalendarMonthCell {
  iso: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
  holidayName: string | null;
  earlyClose: boolean;
}

export function buildMonthGrid(year: number, month: number, todayIso: string): CalendarMonthCell[] {
  const first = new Date(year, month - 1, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;
  const cells: CalendarMonthCell[] = [];

  for (let i = 0; i < totalCells; i++) {
    const dayOffset = i - startDow + 1;
    const d = new Date(year, month - 1, dayOffset);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const inMonth = d.getMonth() === month - 1;
    const dow = d.getDay();
    cells.push({
      iso,
      day: d.getDate(),
      inMonth,
      isToday: iso === todayIso,
      isWeekend: dow === 0 || dow === 6,
      holidayName: inMonth ? marketHolidayName(iso) : null,
      earlyClose: inMonth ? iso in MARKET_EARLY_CLOSES && !marketHolidayName(iso) : false,
    });
  }

  return cells;
}

export function eventCountForDay(
  events: CatalystEvent[] | undefined,
  iso: string,
  tab: HomepageCalendarTab,
): number {
  if (!events?.length) return 0;
  const day = events.filter((e) => e.event_date === iso);
  if (tab === "earnings") return day.filter((e) => e.event_type === "earnings").length;
  if (tab === "catalyst") return day.filter((e) => e.event_type !== "earnings").length;
  return 0;
}

export function etTodayParts(): { year: number; month: number; iso: string } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const d = parts.find((p) => p.type === "day")?.value;
  return { year: y, month: m, iso: `${y}-${m}-${d}` };
}