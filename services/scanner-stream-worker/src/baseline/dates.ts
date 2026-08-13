import {
  type CalendarExceptionRow,
  easternParts,
  isIsoDate,
  isWeekendIsoDate,
  resolveSessionSchedule,
} from "../../../../supabase/functions/_shared/markets/session-schedule.ts";

export type BaselineWindow = {
  periodStart: string;
  periodEnd: string;
};

const WALK_BACK_LIMIT = 21;

export function addCalendarDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day + days));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${
    pad(dt.getUTCDate())
  }`;
}

export function periodStartFromEnd(
  periodEnd: string,
  lookbackCalendarDays: number,
): string {
  return addCalendarDays(periodEnd, -(lookbackCalendarDays - 1));
}

export function lastCompletedRegularSessionDate(
  nowMs: number,
  exceptions: CalendarExceptionRow[] | null,
): string | null {
  const parts = easternParts(nowMs);
  if (!parts || !isIsoDate(parts.date)) return null;

  let date = parts.date;
  for (let i = 0; i < WALK_BACK_LIMIT; i++) {
    if (isWeekendIsoDate(date)) {
      date = addCalendarDays(date, -1);
      continue;
    }
    const schedule = resolveSessionSchedule(date, exceptions);
    if (schedule.marketStatus === "closed") {
      date = addCalendarDays(date, -1);
      continue;
    }
    const isToday = date === parts.date;
    if (isToday && parts.msOfDay <= schedule.regularCloseMsOfDay) {
      date = addCalendarDays(date, -1);
      continue;
    }
    return date;
  }
  return null;
}

export function resolveBaselineWindow(
  nowMs: number,
  exceptions: CalendarExceptionRow[] | null,
  lookbackCalendarDays: number,
): BaselineWindow | null {
  const periodEnd = lastCompletedRegularSessionDate(nowMs, exceptions);
  if (!periodEnd) return null;
  return {
    periodStart: periodStartFromEnd(periodEnd, lookbackCalendarDays),
    periodEnd,
  };
}

export function weekdayDatesInclusive(start: string, end: string): string[] {
  if (!isIsoDate(start) || !isIsoDate(end) || start > end) return [];
  const dates: string[] = [];
  let date = start;
  while (date <= end) {
    if (!isWeekendIsoDate(date)) dates.push(date);
    date = addCalendarDays(date, 1);
  }
  return dates;
}
