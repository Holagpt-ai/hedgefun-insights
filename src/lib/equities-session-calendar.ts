/**
 * Reusable U.S. equities session schedule.
 *
 * Exception days (closed / early-close) come from the provider-backed
 * `market_session_calendar` table. When that calendar is unavailable, readers
 * fall back to a normal 09:30 / 16:00 / 20:00 ET session rather than fabricating
 * holiday evidence.
 */

export const MS_PER_SECOND = 1_000;
export const MS_PER_MINUTE = 60_000;
export const MS_PER_HOUR = 3_600_000;

export const PREMARKET_START_MS = 4 * MS_PER_HOUR;
export const NORMAL_REGULAR_OPEN_MS = (9 * 60 + 30) * MS_PER_MINUTE;
export const NORMAL_REGULAR_CLOSE_MS = 16 * MS_PER_HOUR;
export const NORMAL_AFTER_HOURS_END_MS = 20 * MS_PER_HOUR;

export const NORMAL_REGULAR_OPEN_ET = "09:30:00";
export const NORMAL_REGULAR_CLOSE_ET = "16:00:00";
export const NORMAL_AFTER_HOURS_END_ET = "20:00:00";

export type CalendarMarketStatus = "open" | "closed" | "early_close";
export type CalendarExceptionStatus = "closed" | "early_close";
export type SessionKind = "pre-market" | "market" | "after-hours" | "closed";

export interface CalendarExceptionRow {
  session_date: string;
  market_status: CalendarExceptionStatus;
  regular_open_et: string;
  regular_close_et: string;
  after_hours_end_et: string;
  holiday_name: string | null;
}

export interface ResolvedSessionSchedule {
  sessionDate: string;
  marketStatus: CalendarMarketStatus;
  regularOpenMsOfDay: number;
  regularCloseMsOfDay: number;
  afterHoursEndMsOfDay: number;
  holidayName: string | null;
  /** `fallback` when the provider calendar was unavailable. */
  source: "calendar" | "fallback";
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ET_TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE_RE.test(value)) return false;
  const match = ISO_DATE_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return false;
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  if (!Number.isInteger(day) || day < 1 || day > 31) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

export function weekdayUtcNoon(isoDate: string): number | null {
  if (!isIsoDate(isoDate)) return null;
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).getUTCDay();
}

export function isWeekendIsoDate(isoDate: string): boolean {
  const weekday = weekdayUtcNoon(isoDate);
  return weekday === 0 || weekday === 6;
}

/**
 * Parse an Eastern wall-clock time to milliseconds since local midnight.
 * Accepts HH:MM, HH:MM:SS, and HH:MM:SS.mmm.
 */
export function parseEtTimeToMsOfDay(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const match = ET_TIME_RE.exec(raw.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? "0");
  const frac = match[4] ?? "0";
  const millisecond = Number(frac.padEnd(3, "0").slice(0, 3));
  if (
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour > 23 ||
    !Number.isInteger(minute) ||
    minute < 0 ||
    minute > 59 ||
    !Number.isInteger(second) ||
    second < 0 ||
    second > 59 ||
    !Number.isInteger(millisecond) ||
    millisecond < 0 ||
    millisecond > 999
  ) {
    return null;
  }
  return hour * MS_PER_HOUR + minute * MS_PER_MINUTE + second * MS_PER_SECOND +
    millisecond;
}

export function formatMsOfDayAsEtTime(msOfDay: number): string | null {
  if (!Number.isFinite(msOfDay) || msOfDay < 0 || msOfDay >= 24 * MS_PER_HOUR) {
    return null;
  }
  const hour = Math.floor(msOfDay / MS_PER_HOUR);
  const minute = Math.floor((msOfDay % MS_PER_HOUR) / MS_PER_MINUTE);
  const second = Math.floor((msOfDay % MS_PER_MINUTE) / MS_PER_SECOND);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hour)}:${pad(minute)}:${pad(second)}`;
}

export function fallbackOpenSchedule(sessionDate: string): ResolvedSessionSchedule {
  return {
    sessionDate,
    marketStatus: "open",
    regularOpenMsOfDay: NORMAL_REGULAR_OPEN_MS,
    regularCloseMsOfDay: NORMAL_REGULAR_CLOSE_MS,
    afterHoursEndMsOfDay: NORMAL_AFTER_HOURS_END_MS,
    holidayName: null,
    source: "fallback",
  };
}

function exceptionToSchedule(row: CalendarExceptionRow): ResolvedSessionSchedule | null {
  if (!isIsoDate(row.session_date)) return null;
  const open = parseEtTimeToMsOfDay(row.regular_open_et);
  const close = parseEtTimeToMsOfDay(row.regular_close_et);
  const ahEnd = parseEtTimeToMsOfDay(row.after_hours_end_et);
  if (open === null || close === null || ahEnd === null) return null;
  if (!(open < close && close < ahEnd)) return null;
  if (row.market_status !== "closed" && row.market_status !== "early_close") {
    return null;
  }
  return {
    sessionDate: row.session_date,
    marketStatus: row.market_status,
    regularOpenMsOfDay: open,
    regularCloseMsOfDay: close,
    afterHoursEndMsOfDay: ahEnd,
    holidayName: row.holiday_name,
    source: "calendar",
  };
}

/**
 * Resolve the session schedule for an Eastern calendar date.
 *
 * `exceptions === null` means the calendar is unavailable → normal fallback.
 * A loaded calendar (including an empty list) treats weekends and known
 * holidays as closed, early-close rows as early close, and other weekdays
 * as a normal 09:30/16:00/20:00 ET session.
 */
export function resolveSessionSchedule(
  sessionDate: string,
  exceptions: CalendarExceptionRow[] | null,
): ResolvedSessionSchedule {
  if (!isIsoDate(sessionDate)) {
    return fallbackOpenSchedule(sessionDate);
  }
  if (exceptions === null) {
    return fallbackOpenSchedule(sessionDate);
  }

  const match = exceptions.find((row) => row.session_date === sessionDate);
  if (match) {
    const resolved = exceptionToSchedule(match);
    if (resolved) return resolved;
    return fallbackOpenSchedule(sessionDate);
  }

  if (isWeekendIsoDate(sessionDate)) {
    return {
      sessionDate,
      marketStatus: "closed",
      regularOpenMsOfDay: NORMAL_REGULAR_OPEN_MS,
      regularCloseMsOfDay: NORMAL_REGULAR_CLOSE_MS,
      afterHoursEndMsOfDay: NORMAL_AFTER_HOURS_END_MS,
      holidayName: null,
      source: "calendar",
    };
  }

  return {
    ...fallbackOpenSchedule(sessionDate),
    source: "calendar",
  };
}

export function sessionKindAtMsOfDay(
  msOfDay: number,
  schedule: ResolvedSessionSchedule,
): SessionKind {
  if (!Number.isFinite(msOfDay) || msOfDay < 0) return "closed";
  if (schedule.marketStatus === "closed") return "closed";
  if (msOfDay >= PREMARKET_START_MS && msOfDay < schedule.regularOpenMsOfDay) {
    return "pre-market";
  }
  if (
    msOfDay >= schedule.regularOpenMsOfDay &&
    msOfDay <= schedule.regularCloseMsOfDay
  ) {
    return "market";
  }
  if (
    msOfDay > schedule.regularCloseMsOfDay &&
    msOfDay <= schedule.afterHoursEndMsOfDay
  ) {
    return "after-hours";
  }
  return "closed";
}

/** After-hours is strictly after regular close, through 20:00:00.000 ET inclusive. */
export function isWithinAfterHoursWindow(
  msOfDay: number,
  schedule: ResolvedSessionSchedule,
): boolean {
  if (!Number.isFinite(msOfDay)) return false;
  if (schedule.marketStatus === "closed") return false;
  return (
    msOfDay > schedule.regularCloseMsOfDay &&
    msOfDay <= schedule.afterHoursEndMsOfDay
  );
}
