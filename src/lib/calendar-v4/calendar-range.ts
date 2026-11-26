import { monthBounds } from "@/hooks/useHomepageCalendarMonth";
import { PUBLIC_CATALYST_MAX_RANGE_DAYS } from "@/lib/catalyst/public-catalyst-calendar";

function isoMs(iso: string): number {
  return Date.parse(`${iso}T12:00:00Z`);
}

function addDays(iso: string, days: number): string {
  const d = new Date(isoMs(iso));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Mon–Fri window starting on the selected anchor (ET labels applied in UI). */
export function fiveWeekdayRange(anchorIso: string): { from: string; to: string } {
  return { from: anchorIso, to: addDays(anchorIso, 4) };
}

/** Union of visible month and week snapshot window, capped for the public RPC. */
export function calendarCatalystQueryRange(
  year: number,
  month: number,
  selectedIso: string,
): { from: string; to: string } {
  const monthR = monthBounds(year, month);
  const weekR = fiveWeekdayRange(selectedIso);
  let from = monthR.from < weekR.from ? monthR.from : weekR.from;
  let to = monthR.to > weekR.to ? monthR.to : weekR.to;
  const days = Math.round((isoMs(to) - isoMs(from)) / 86_400_000) + 1;
  if (days > PUBLIC_CATALYST_MAX_RANGE_DAYS) {
    from = monthR.from;
    to = monthR.to;
  }
  return { from, to };
}