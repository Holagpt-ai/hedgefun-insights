import { easternParts } from "@/lib/market-session";

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isBackfillDate(value: string): boolean {
  const match = ISO_DATE_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1970 || year > 2100) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

export function addCalendarDays(isoDate: string, days: number): string {
  const match = ISO_DATE_RE.exec(isoDate);
  if (!match) throw new Error("addCalendarDays requires a calendar date");
  const probe = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  probe.setUTCDate(probe.getUTCDate() + days);
  return probe.toISOString().slice(0, 10);
}

export function chunkInclusiveDates(
  dateFrom: string,
  dateTo: string,
  chunkDays: number,
): Array<{ dateFrom: string; dateTo: string }> {
  if (chunkDays < 1) throw new Error("chunkDays must be positive");
  const chunks: Array<{ dateFrom: string; dateTo: string }> = [];
  let cursor = dateFrom;
  while (cursor <= dateTo) {
    const end = addCalendarDays(cursor, chunkDays - 1);
    const dateToChunk = end < dateTo ? end : dateTo;
    chunks.push({ dateFrom: cursor, dateTo: dateToChunk });
    cursor = addCalendarDays(dateToChunk, 1);
  }
  return chunks;
}

export function utcDateFromUnixMs(ms: number): string | null {
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

/** 09:30 and 16:00 America/New_York on a session date, as UTC timestamps. */
export function etSessionBounds(isoDate: string): { open: string; close: string } | null {
  const open = etWallClockToUtc(isoDate, 9, 30);
  const close = etWallClockToUtc(isoDate, 16, 0);
  if (!open || !close) return null;
  return { open, close };
}

function etWallClockToUtc(isoDate: string, hour: number, minute: number): string | null {
  const match = ISO_DATE_RE.exec(isoDate);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  let guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = easternParts(guess);
    if (!parts) return null;
    const desired = Date.UTC(year, month - 1, day, hour, minute, 0);
    const actual = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      parts.millisecond,
    );
    const delta = desired - actual;
    if (delta === 0) break;
    guess += delta;
  }
  const parts = easternParts(guess);
  if (!parts || parts.year !== year || parts.month !== month || parts.day !== day || parts.hour !== hour || parts.minute !== minute) {
    return null;
  }
  return new Date(guess).toISOString();
}
