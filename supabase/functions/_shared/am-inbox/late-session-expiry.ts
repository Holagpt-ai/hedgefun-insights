import type { LateSessionSourceCategory } from "../config/late-session-source-categories.ts";
import { nextTradingDay } from "../markets/next-trading-day.ts";

export function firstAmSessionDateAfterSource(sourceSessionDate: string): string {
  return nextTradingDay(sourceSessionDate).date;
}

export function computeValidThroughSessionDate(
  sourceSessionDate: string,
  category: LateSessionSourceCategory,
): string {
  const firstNext = firstAmSessionDateAfterSource(sourceSessionDate);
  if (category === "DAY_TWO_WATCH") {
    return nextTradingDay(firstNext).date;
  }
  return firstNext;
}
