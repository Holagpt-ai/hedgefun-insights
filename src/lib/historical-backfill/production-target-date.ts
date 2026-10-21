/**
 * Validated historical catch-up target session (Batch 33).
 */

import { HISTORICAL_VERIFIED_EARLIEST_DAILY_DATE } from "@/config/historical-backfill.config";
import { isBackfillDate, addCalendarDays } from "@/lib/historical-backfill/dates";
import {
  getEtParts,
  isTradingDay,
  isMarketHoliday,
  isWeekendDate,
} from "@/lib/market-calendar";
import { lastCompletedUsTradingSession } from "@/lib/radar/carryover-session";

export type HistoricalTargetDateRejectReason =
  | "missing"
  | "malformed"
  | "weekend"
  | "holiday"
  | "future"
  | "incomplete_session"
  | "before_entitlement";

export type HistoricalTargetDateValidation =
  | { ok: true; targetSession: string; completedSession: string }
  | { ok: false; reason: HistoricalTargetDateRejectReason; detail: string };

function weekdayForDate(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function validateHistoricalCatchUpTargetSession(input: {
  raw: string | null | undefined;
  now: Date;
  entitlementStart?: string;
}): HistoricalTargetDateValidation {
  const entitlementStart = input.entitlementStart ?? HISTORICAL_VERIFIED_EARLIEST_DAILY_DATE;
  const raw = input.raw?.trim() ?? "";
  if (!raw) {
    return { ok: false, reason: "missing", detail: "HISTORICAL_CATCHUP_TARGET_SESSION is required" };
  }
  if (!isBackfillDate(raw)) {
    return { ok: false, reason: "malformed", detail: "Target must be YYYY-MM-DD" };
  }
  const weekday = weekdayForDate(raw);
  if (isWeekendDate(weekday)) {
    return { ok: false, reason: "weekend", detail: "Target cannot be a weekend" };
  }
  if (isMarketHoliday(raw)) {
    return { ok: false, reason: "holiday", detail: "Target cannot be a market holiday" };
  }
  if (!isTradingDay(raw, weekday)) {
    return { ok: false, reason: "holiday", detail: "Target is not a trading day" };
  }
  if (raw < entitlementStart) {
    return {
      ok: false,
      reason: "before_entitlement",
      detail: `Target must be on or after verified daily entitlement (${entitlementStart})`,
    };
  }

  const completed = lastCompletedUsTradingSession(input.now).sessionDate;
  if (raw > completed) {
    return {
      ok: false,
      reason: raw === getEtParts(input.now).date ? "incomplete_session" : "future",
      detail: `Target ${raw} is after the last completed session (${completed})`,
    };
  }

  return { ok: true, targetSession: raw, completedSession: completed };
}

/** Next calendar day after the latest stored session, never before globalFrom. */
export function resolveProviderStartDate(input: {
  globalDateFrom: string;
  latestStoredSession: string | null;
}): string {
  if (!input.latestStoredSession || !isBackfillDate(input.latestStoredSession)) {
    return input.globalDateFrom;
  }
  const next = addCalendarDays(input.latestStoredSession, 1);
  return next > input.globalDateFrom ? next : input.globalDateFrom;
}
