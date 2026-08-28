/**
 * AM Intelligence Brief V2 evaluation window.
 * Dispatcher uses America/New_York local minutes and fail-closes outside this range.
 * Inclusive: 4:00 AM ET through 9:30 AM ET.
 */

export const AM_EVAL_START_MIN = 4 * 60; // 240
export const AM_EVAL_END_MIN = 9 * 60 + 30; // 570 inclusive

export interface EtClock {
  date: string;
  weekday: string;
  hour: number;
  minute: number;
  minutes: number;
}

function parseHour(raw: string): number {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return 0;
  // Some Intl implementations emit "24" for midnight.
  if (n === 24) return 0;
  return n;
}

/** Deterministic America/New_York wall-clock from an instant. */
export function etClock(now: Date = new Date()): EtClock {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const weekday = get("weekday");
  const hour = parseHour(get("hour"));
  const minute = parseInt(get("minute"), 10);
  const safeMinute = Number.isFinite(minute) ? minute : 0;
  return {
    date: `${year}-${month}-${day}`,
    weekday,
    hour,
    minute: safeMinute,
    minutes: hour * 60 + safeMinute,
  };
}

export function isAmEvaluationWindow(minutesFromMidnightEt: number): boolean {
  return minutesFromMidnightEt >= AM_EVAL_START_MIN && minutesFromMidnightEt <= AM_EVAL_END_MIN;
}

export function isAmEvaluationInstant(now: Date): boolean {
  return isAmEvaluationWindow(etClock(now).minutes);
}

export function isWeekendWeekday(weekday: string): boolean {
  return weekday === "Sat" || weekday === "Sun";
}
