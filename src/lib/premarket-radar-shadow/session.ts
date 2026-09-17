/**
 * Session safety for the pre-market shadow evaluator.
 * Captures only 04:00–09:30 ET on a trading day. Never mixes prior-day RTH.
 */

import { etMidnightMs } from "@/lib/catalyst/parsers";
import {
  PREMARKET_START_MS,
  isWeekendIsoDate,
  resolveSessionSchedule,
  sessionKindAtMsOfDay,
  type CalendarExceptionRow,
} from "@/lib/equities-session-calendar";
import { isMarketHoliday, nextTradingDay } from "@/lib/market-calendar";
import { easternParts } from "@/lib/market-session";
import { easternDate } from "@/lib/radar-v22";
import type {
  CalendarSource,
  PremarketGate,
  PremarketWindow,
} from "./types";

/** Suggested capture slots as minutes from ET midnight. */
export const PREMARKET_CAPTURE_SLOTS_MINS = [
  4 * 60 + 15, // 04:15
  5 * 60, // 05:00
  6 * 60, // 06:00
  6 * 60 + 45, // 06:45
  7 * 60, // 07:00
  7 * 60 + 30, // 07:30
  8 * 60, // 08:00
  8 * 60 + 30, // 08:30
  9 * 60, // 09:00
  9 * 60 + 20, // 09:20
] as const;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatEtClock(nowMs: number): { sessionDate: string; etTimeLabel: string } {
  const sessionDate = easternDate(nowMs);
  const parts = easternParts(nowMs);
  if (!parts) return { sessionDate, etTimeLabel: `${sessionDate} ??:?? ET` };
  return {
    sessionDate,
    etTimeLabel: `${sessionDate} ${pad2(parts.hour)}:${pad2(parts.minute)} ET`,
  };
}

export function etWallMs(sessionDate: string, msOfDay: number): number | null {
  const midnight = etMidnightMs(sessionDate);
  if (midnight === null || !Number.isFinite(msOfDay)) return null;
  return midnight + msOfDay;
}

export function nextCaptureHint(nowMs: number): string {
  const { sessionDate } = formatEtClock(nowMs);
  const parts = easternParts(nowMs);
  if (!parts) return `npm run radar:premarket-shadow during 04:00–09:30 ET`;
  const schedule = resolveSessionSchedule(sessionDate, []);
  const inPremarket =
    schedule.marketStatus !== "closed" &&
    sessionKindAtMsOfDay(parts.msOfDay, schedule) === "pre-market";
  if (inPremarket) {
    const mins = parts.mins;
    const next = PREMARKET_CAPTURE_SLOTS_MINS.find((slot) => slot > mins);
    if (next !== undefined) {
      const hh = Math.floor(next / 60);
      const mm = next % 60;
      return `Next named slot ${sessionDate} ${pad2(hh)}:${pad2(mm)} ET. Re-run: npm run radar:premarket-shadow`;
    }
    return `Window ends 09:30 ET. Re-run: npm run radar:premarket-shadow`;
  }
  const todayOpen = etWallMs(sessionDate, PREMARKET_START_MS);
  if (todayOpen !== null && nowMs < todayOpen && schedule.marketStatus !== "closed" && !isWeekendIsoDate(sessionDate) && !isMarketHoliday(sessionDate)) {
    return `Next window ${sessionDate} 04:15 ET. npm run radar:premarket-shadow -- --schedule`;
  }
  const next = nextTradingDay(sessionDate);
  return `Next window ${next.date} 04:15 ET. npm run radar:premarket-shadow`;
}

export function resolvePremarketGate(
  nowMs: number,
  exceptions: CalendarExceptionRow[] | null,
): PremarketGate {
  const { sessionDate, etTimeLabel } = formatEtClock(nowMs);
  const parts = easternParts(nowMs);
  const hint = nextCaptureHint(nowMs);
  if (!parts) {
    return {
      ok: false,
      reason: "not_applicable",
      sessionDate,
      etTimeLabel,
      detail: "Eastern wall-clock could not be resolved.",
      nextCaptureHint: hint,
    };
  }

  let calendarSource: CalendarSource;
  let schedule = resolveSessionSchedule(sessionDate, exceptions ?? []);
  if (exceptions !== null) {
    calendarSource = "market_session_calendar";
  } else {
    calendarSource = "weekend_fallback_calendar_unavailable";
    if (isMarketHoliday(sessionDate)) {
      calendarSource = "static_holiday_list_calendar_unavailable";
      schedule = {
        sessionDate,
        marketStatus: "closed",
        regularOpenMsOfDay: schedule.regularOpenMsOfDay,
        regularCloseMsOfDay: schedule.regularCloseMsOfDay,
        afterHoursEndMsOfDay: schedule.afterHoursEndMsOfDay,
        holidayName: "static_holiday_list",
        source: "fallback",
      };
    }
  }

  if (isWeekendIsoDate(sessionDate) && schedule.marketStatus === "closed") {
    return {
      ok: false,
      reason: "weekend",
      sessionDate,
      etTimeLabel,
      detail: "Weekend — US equity pre-market is closed.",
      nextCaptureHint: hint,
    };
  }

  if (schedule.marketStatus === "closed") {
    const holiday = schedule.holidayName ? ` (${schedule.holidayName})` : "";
    return {
      ok: false,
      reason: schedule.holidayName || isMarketHoliday(sessionDate) ? "holiday" : "closed_day",
      sessionDate,
      etTimeLabel,
      detail: `Market closed${holiday}. Shadow capture is not applicable.`,
      nextCaptureHint: hint,
    };
  }

  const kind = sessionKindAtMsOfDay(parts.msOfDay, schedule);
  if (kind !== "pre-market") {
    return {
      ok: false,
      reason: "outside_window",
      sessionDate,
      etTimeLabel,
      detail: `Current session is ${kind}. Pre-market shadow captures only 04:00–09:30 ET.`,
      nextCaptureHint: hint,
    };
  }

  const windowStartMs = etWallMs(sessionDate, PREMARKET_START_MS);
  const windowEndExclusiveMs = etWallMs(sessionDate, schedule.regularOpenMsOfDay);
  if (windowStartMs === null || windowEndExclusiveMs === null) {
    return {
      ok: false,
      reason: "not_applicable",
      sessionDate,
      etTimeLabel,
      detail: "Could not resolve 04:00 / 09:30 ET bounds.",
      nextCaptureHint: hint,
    };
  }

  const window: PremarketWindow = {
    sessionDate,
    etTimeLabel,
    captureMs: nowMs,
    windowStartMs,
    windowEndExclusiveMs,
    schedule,
    calendarSource,
  };
  return { ok: true, window };
}

export function closedPremarketGate(
  gate: PremarketGate,
): Extract<PremarketGate, { ok: false }> | null {
  if ("reason" in gate) return gate;
  return null;
}

export function openPremarketWindow(gate: PremarketGate): PremarketWindow | null {
  if ("window" in gate) return gate.window;
  return null;
}

export function nextSlotWaitMs(nowMs: number): number | null {
  const gate = resolvePremarketGate(nowMs, []);
  const parts = easternParts(nowMs);
  if (!parts) return null;
  const { sessionDate } = formatEtClock(nowMs);
  if (gate.ok) {
    const next = PREMARKET_CAPTURE_SLOTS_MINS.find((slot) => slot > parts.mins);
    if (next === undefined) return null;
    const target = etWallMs(sessionDate, next * 60_000);
    if (target === null || target <= nowMs) return null;
    return target - nowMs;
  }
  const open = etWallMs(sessionDate, PREMARKET_CAPTURE_SLOTS_MINS[0] * 60_000);
  if (open !== null && nowMs < open && !isWeekendIsoDate(sessionDate) && !isMarketHoliday(sessionDate)) {
    return open - nowMs;
  }
  const nextDay = nextTradingDay(sessionDate);
  const nextOpen = etWallMs(nextDay.date, PREMARKET_CAPTURE_SLOTS_MINS[0] * 60_000);
  if (nextOpen === null || nextOpen <= nowMs) return null;
  return nextOpen - nowMs;
}
