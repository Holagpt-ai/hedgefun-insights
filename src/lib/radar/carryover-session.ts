/**
 * Last completed US equity session for Carryover Watch.
 * Uses the market calendar and America/New_York. The current premarket,
 * regular session, and after-hours window are not complete.
 */

import { MARKET_SESSIONS } from "@/config/inbox.config";
import {
  formatSessionDate,
  getEtParts,
  isTradingDay,
  previousTradingDay,
} from "@/lib/market-calendar";

const AFTER_HOURS_END_MINS =
  MARKET_SESSIONS.find((session) => session.id === "after-hours")?.countdownTargetMins ?? 20 * 60;

export interface CompletedUsSession {
  sessionDate: string;
  sessionLabel: string;
}

export function lastCompletedUsTradingSession(now: Date): CompletedUsSession {
  const et = getEtParts(now);
  const trading = isTradingDay(et.date, et.weekday);
  const sessionDate =
    trading && et.minutes >= AFTER_HOURS_END_MINS
      ? et.date
      : previousTradingDay(et.date).date;
  return {
    sessionDate,
    sessionLabel: formatSessionDate(sessionDate),
  };
}
