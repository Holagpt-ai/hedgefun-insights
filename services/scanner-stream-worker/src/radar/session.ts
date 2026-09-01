/**
 * Radar V2.2 surveillance-session helpers (Sprint 2).
 *
 * Session boundary authority is the ET market-calendar clock, using the
 * same calendar *data* (open/close/AH-end, holidays, weekends, early close)
 * as `session-schedule.ts`, but Radar-specific HALF-OPEN classification:
 *
 *   PREMARKET   [04:00 ET, regularOpenEt)
 *   RTH         [regularOpenEt, regularCloseEt)
 *   AFTER_HOURS [regularCloseEt, afterHoursEndEt)
 *   CLOSED      [afterHoursEndEt, next 04:00 ET) plus weekends/holidays
 *
 * Do NOT use the shared inclusive `sessionKindAtMsOfDay` here. Other
 * Stocksist products (AH movers, market-session, AM shadow) depend on
 * inclusive close / inclusive AH-end.
 *
 * Second aggregates: Polygon/Massive A.* carry both `s` (window start) and
 * `e` (window end), with tests requiring e > s and fixtures using e = s+1000.
 * That is a 1-second window [s, e). Engine *session state* is classified from
 * evaluate() wall ET time, not from bar s/e. When Sprint 3 attributes a bar
 * to a session, use start `s` — never end `e` — because the last RTH second
 * has e === regularCloseEt and would otherwise land in AFTER_HOURS.
 *
 * The surveillance date rolls at 04:00 ET, not at ET midnight.
 * 00:00–03:59.999 ET still belongs to the previous calendar date's CLOSED window.
 */
import type {
  CalendarExceptionRow,
  ResolvedSessionSchedule,
  SessionKind,
} from "../../../../supabase/functions/_shared/markets/session-schedule.ts";
import {
  easternParts,
  isIsoDate,
  MS_PER_HOUR,
  PREMARKET_START_MS,
  resolveScheduleAt,
  sessionKindAtMsOfDay,
} from "../../../../supabase/functions/_shared/markets/session-schedule.ts";

export type RadarSessionKind = SessionKind;

export type SessionTransition =
  | "hard_reset"
  | "soft_pm_rth"
  | "soft_rth_ah"
  | "park_closed";

export function previousIsoDate(isoDate: string): string | null {
  if (!isIsoDate(isoDate)) return null;
  const [year, month, day] = isoDate.split("-").map(Number);
  const prev = new Date(Date.UTC(year, month - 1, day) - 24 * MS_PER_HOUR);
  const y = prev.getUTCFullYear();
  const m = String(prev.getUTCMonth() + 1).padStart(2, "0");
  const d = String(prev.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Trading/surveillance date: rolls at 04:00 ET, not midnight. */
export function surveillanceDateAt(ms: number): string | null {
  const parts = easternParts(ms);
  if (!parts) return null;
  if (parts.msOfDay >= PREMARKET_START_MS) return parts.date;
  return previousIsoDate(parts.date);
}

/**
 * Radar-only half-open session kind from ms-of-ET-day + resolved calendar.
 * Shared `sessionKindAtMsOfDay` remains inclusive and is not used here.
 */
export function radarSessionKindAtMsOfDay(
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
    msOfDay < schedule.regularCloseMsOfDay
  ) {
    return "market";
  }
  if (
    msOfDay >= schedule.regularCloseMsOfDay &&
    msOfDay < schedule.afterHoursEndMsOfDay
  ) {
    return "after-hours";
  }
  return "closed";
}

export function radarSessionKindAt(
  ms: number,
  exceptions: CalendarExceptionRow[] | null,
): SessionKind {
  const schedule = resolveScheduleAt(ms, exceptions);
  const parts = easternParts(ms);
  if (!schedule || !parts) return "closed";
  return radarSessionKindAtMsOfDay(parts.msOfDay, schedule);
}

/**
 * Inclusive shared-calendar kind. Used only for RADAR_SENTINEL_ENABLED=false
 * so legacy RTH gating/reporting is unchanged.
 */
export function inclusiveSessionKindAt(
  ms: number,
  exceptions: CalendarExceptionRow[] | null,
): SessionKind {
  const schedule = resolveScheduleAt(ms, exceptions);
  const parts = easternParts(ms);
  if (!schedule || !parts) return "closed";
  return sessionKindAtMsOfDay(parts.msOfDay, schedule);
}

export function isLiveSurveillanceKind(kind: SessionKind): boolean {
  return kind === "pre-market" || kind === "market" || kind === "after-hours";
}

/**
 * Absolute ET instant of the current sub-session's half-open start,
 * derived from the bar/event timestamp (use bar start `s`).
 */
export function subsessionStartMsAt(
  ms: number,
  exceptions: CalendarExceptionRow[] | null,
): number | null {
  const parts = easternParts(ms);
  const schedule = resolveScheduleAt(ms, exceptions);
  if (!parts || !schedule) return null;
  const kind = radarSessionKindAtMsOfDay(parts.msOfDay, schedule);
  if (kind === "closed") return null;
  const openMsOfDay = kind === "pre-market"
    ? PREMARKET_START_MS
    : kind === "market"
    ? schedule.regularOpenMsOfDay
    : schedule.regularCloseMsOfDay;
  return ms - parts.msOfDay + openMsOfDay;
}

export function softTransitionOf(
  from: SessionKind | null,
  to: SessionKind,
): "soft_pm_rth" | "soft_rth_ah" | null {
  if (from === "pre-market" && to === "market") return "soft_pm_rth";
  if (from === "market" && to === "after-hours") return "soft_rth_ah";
  return null;
}

/**
 * Hard-reset when live surveillance begins on a new 04:00 trading date.
 * CLOSED (weekend/holiday/overnight) never hard-resets by itself.
 * ET midnight is not a reset: 00:00–03:59 still maps to the previous
 * surveillance date.
 */
export function shouldHardResetSurveillance(opts: {
  lastSurveillanceDate: string | null;
  surveillanceDate: string;
  kind: SessionKind;
}): boolean {
  if (opts.lastSurveillanceDate === null) return false;
  if (opts.lastSurveillanceDate === opts.surveillanceDate) return false;
  return isLiveSurveillanceKind(opts.kind);
}
