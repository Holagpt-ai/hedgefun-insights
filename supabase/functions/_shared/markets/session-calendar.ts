/**
 * Validate Polygon /v1/marketstatus/upcoming and map NYSE/NASDAQ exception
 * dates into market_session_calendar rows. Fail closed on malformed or
 * contradictory provider evidence. Never logs credentials.
 */

import {
  type CalendarExceptionRow,
  easternParts,
  formatMsOfDayAsEtTime,
  isIsoDate,
  NORMAL_AFTER_HOURS_END_ET,
  NORMAL_REGULAR_CLOSE_ET,
  NORMAL_REGULAR_OPEN_ET,
  parseEtTimeToMsOfDay,
} from "./session-schedule.ts";

export const CALENDAR_EXCHANGES: ReadonlySet<string> = new Set([
  "NYSE",
  "NASDAQ",
]);
export const CALENDAR_STATUSES: ReadonlySet<string> = new Set([
  "closed",
  "early-close",
]);
export const CALENDAR_SOURCE = "polygon_marketstatus_upcoming";

/** Persisted calendar row contract sent to replace_market_session_calendar_exceptions_v1. */
export type PersistedCalendarExceptionRow = CalendarExceptionRow & {
  source: string;
};

export function stampCalendarSource(
  row: CalendarExceptionRow,
): PersistedCalendarExceptionRow {
  return { ...row, source: CALENDAR_SOURCE };
}

export function stampCalendarSourceRows(
  rows: CalendarExceptionRow[],
): PersistedCalendarExceptionRow[] {
  return rows.map(stampCalendarSource);
}

export type UpcomingVenueRow = {
  exchange: string;
  date: string;
  status: "closed" | "early-close";
  name: string | null;
  open: string | null;
  close: string | null;
};

export type CalendarParseResult =
  | { ok: true; rows: PersistedCalendarExceptionRow[] }
  | { ok: false; reason: "malformed" | "contradictory" };

function optionalString(value: unknown): { ok: boolean; value: string | null } {
  if (value === null || value === undefined || value === "") {
    return { ok: true, value: null };
  }
  if (typeof value !== "string") return { ok: false, value: null };
  const trimmed = value.trim();
  return { ok: true, value: trimmed.length > 0 ? trimmed : null };
}

/**
 * Convert a provider open/close value into an ET HH:MM:SS clock.
 * Accepts "13:00", "13:00:00", or an ISO-8601 timestamp.
 */
export function providerClockToEtTime(raw: string): string | null {
  const asClock = parseEtTimeToMsOfDay(raw);
  if (asClock !== null) {
    return formatMsOfDayAsEtTime(asClock);
  }
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;
  const parts = easternParts(ms);
  if (!parts) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}

function parseVenueRow(raw: unknown): UpcomingVenueRow | "skip" | "malformed" {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return "malformed";
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.exchange !== "string" || !o.exchange.trim()) return "malformed";
  const exchange = o.exchange.trim().toUpperCase();
  if (!CALENDAR_EXCHANGES.has(exchange)) return "skip";
  if (!isIsoDate(o.date)) return "malformed";
  if (typeof o.status !== "string") return "malformed";
  const status = o.status.trim().toLowerCase();
  if (status !== "closed" && status !== "early-close") return "malformed";
  const name = optionalString(o.name);
  const open = optionalString(o.open);
  const close = optionalString(o.close);
  if (!name.ok || !open.ok || !close.ok) return "malformed";
  if (status === "early-close" && close.value === null) return "malformed";
  if (open.value !== null && providerClockToEtTime(open.value) === null) {
    return "malformed";
  }
  if (close.value !== null && providerClockToEtTime(close.value) === null) {
    return "malformed";
  }
  return {
    exchange,
    date: o.date,
    status,
    name: name.value,
    open: open.value,
    close: close.value,
  };
}

function venueToException(
  row: UpcomingVenueRow,
): PersistedCalendarExceptionRow | null {
  const holidayName = row.name;
  if (row.status === "closed") {
    return {
      session_date: row.date,
      market_status: "closed",
      regular_open_et: NORMAL_REGULAR_OPEN_ET,
      regular_close_et: NORMAL_REGULAR_CLOSE_ET,
      after_hours_end_et: NORMAL_AFTER_HOURS_END_ET,
      holiday_name: holidayName,
      source: CALENDAR_SOURCE,
    };
  }

  if (row.close === null) return null;
  const closeEt = providerClockToEtTime(row.close);
  if (closeEt === null) return null;
  const openEt = row.open
    ? providerClockToEtTime(row.open) ?? NORMAL_REGULAR_OPEN_ET
    : NORMAL_REGULAR_OPEN_ET;
  const openMs = parseEtTimeToMsOfDay(openEt);
  const closeMs = parseEtTimeToMsOfDay(closeEt);
  const ahMs = parseEtTimeToMsOfDay(NORMAL_AFTER_HOURS_END_ET);
  if (openMs === null || closeMs === null || ahMs === null) return null;
  if (!(openMs < closeMs && closeMs < ahMs)) return null;
  return {
    session_date: row.date,
    market_status: "early_close",
    regular_open_et: openEt,
    regular_close_et: closeEt,
    after_hours_end_et: NORMAL_AFTER_HOURS_END_ET,
    holiday_name: holidayName,
    source: CALENDAR_SOURCE,
  };
}

function sameException(
  a: CalendarExceptionRow,
  b: CalendarExceptionRow,
): boolean {
  if (
    a.session_date !== b.session_date ||
    a.market_status !== b.market_status ||
    a.regular_open_et !== b.regular_open_et ||
    a.regular_close_et !== b.regular_close_et ||
    a.after_hours_end_et !== b.after_hours_end_et
  ) {
    return false;
  }
  if (
    a.holiday_name &&
    b.holiday_name &&
    a.holiday_name !== b.holiday_name
  ) {
    return false;
  }
  return true;
}

function mergeException(
  a: PersistedCalendarExceptionRow,
  b: PersistedCalendarExceptionRow,
): PersistedCalendarExceptionRow {
  return stampCalendarSource({
    ...a,
    holiday_name: a.holiday_name ?? b.holiday_name,
  });
}

/**
 * Parse `/v1/marketstatus/upcoming`. NYSE and NASDAQ must each report exactly
 * once per exception date and must agree. Other venues are ignored.
 */
export function parseUpcomingMarketStatus(
  body: unknown,
  asOfDate: string,
): CalendarParseResult {
  if (!Array.isArray(body)) return { ok: false, reason: "malformed" };
  if (!isIsoDate(asOfDate)) return { ok: false, reason: "malformed" };

  const venueRows: UpcomingVenueRow[] = [];
  for (const raw of body) {
    const parsed = parseVenueRow(raw);
    if (parsed === "malformed") return { ok: false, reason: "malformed" };
    if (parsed === "skip") continue;
    venueRows.push(parsed);
  }

  const byDate = new Map<string, UpcomingVenueRow[]>();
  for (const row of venueRows) {
    const list = byDate.get(row.date) ?? [];
    list.push(row);
    byDate.set(row.date, list);
  }

  const exceptions: PersistedCalendarExceptionRow[] = [];
  for (const [date, list] of byDate) {
    if (date < asOfDate) continue;
    const nyse = list.filter((r) => r.exchange === "NYSE");
    const nasdaq = list.filter((r) => r.exchange === "NASDAQ");
    if (nyse.length !== 1 || nasdaq.length !== 1) {
      return { ok: false, reason: "contradictory" };
    }
    const nyseRow = venueToException(nyse[0]);
    const nasdaqRow = venueToException(nasdaq[0]);
    if (!nyseRow || !nasdaqRow) return { ok: false, reason: "malformed" };
    if (!sameException(nyseRow, nasdaqRow)) {
      return { ok: false, reason: "contradictory" };
    }
    exceptions.push(mergeException(nyseRow, nasdaqRow));
  }

  exceptions.sort((a, b) => a.session_date.localeCompare(b.session_date));
  return { ok: true, rows: exceptions };
}
