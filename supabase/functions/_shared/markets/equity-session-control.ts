/**
 * Batch 215 — unified U.S. equity session control (23×5-ready).
 *
 * One schedule contract for the single unified equities scanner. Standard
 * hours (premarket 04:00, regular 09:30–16:00, after-hours to 20:00 ET) stay
 * the only scan-eligible sessions until the 23×5 overnight session is
 * explicitly activated. All wall-clock math is America/New_York via the
 * existing `easternParts` (DST handled by Intl), and holidays / early closes
 * come from the existing `market_session_calendar` exception rows.
 *
 * Futures (CME Sunday 18:00 – Friday 17:00 ET with a daily 17:00–18:00
 * break) follow a different calendar and MUST NOT drive this module. A
 * future futures module gets its own schedule; see `MarketCalendarId`.
 *
 * Proposed 23×5 equities schedule (not active by default):
 *   Sun 21:00            overnight week opens
 *   Sun–Thu 21:00–04:00  overnight (belongs to the NEXT trading day)
 *   Mon–Fri 04:00–09:30  premarket
 *   Mon–Fri 09:30–16:00  regular (early close per calendar)
 *   Mon–Fri 16:00–20:00  after-hours (earlier end per calendar)
 *   Mon–Thu 20:00–21:00  maintenance pause
 *   Fri 20:00 – Sun 21:00 weekend closure
 */

import {
  easternParts,
  MS_PER_HOUR,
  resolveSessionSchedule,
  sessionKindAtMsOfDay,
  weekdayUtcNoon,
  type CalendarExceptionRow,
  type ResolvedSessionSchedule,
} from "./session-schedule.ts";

/** Only the U.S. equities calendar is implemented. Futures stay separate. */
export type MarketCalendarId = "us_equities";

export const OVERNIGHT_OPEN_MS = 21 * MS_PER_HOUR;
export const OVERNIGHT_CLOSE_MS = 4 * MS_PER_HOUR;

export type EquitySessionPhase =
  | "overnight"
  | "pre-market"
  | "market"
  | "after-hours"
  | "maintenance_pause"
  | "weekend_closure"
  | "holiday_closure"
  /** Weekday off-hours while the 23×5 overnight session is not activated. */
  | "overnight_inactive";

export type ScanSkipReason =
  | "weekend_closure"
  | "holiday_closure"
  | "maintenance_pause"
  | "overnight_not_activated"
  | "overnight_pipeline_not_ready";

/**
 * Activation inputs. Every flag must be true for overnight scanning; the
 * calendar date alone never activates anything.
 */
export interface Equity23x5Activation {
  /** Owner authorization (explicit env flag). */
  ownerAuthorized: boolean;
  /** Confirmed participating-exchange go-live date (ET, YYYY-MM-DD); null = unconfirmed. */
  exchangeEffectiveDate: string | null;
  /** Market-data provider confirmed to deliver overnight trades/aggregates. */
  providerOvernightConfirmed: boolean;
}

export const EQUITY_23X5_DISABLED: Equity23x5Activation = {
  ownerAuthorized: false,
  exchangeEffectiveDate: null,
  providerOvernightConfirmed: false,
};

/**
 * Batch 221 implemented overnight volume / observation semantics in
 * `session-volume.ts` and `session-sync-context.ts`. Production scanning stays
 * off until owner activation **and** this flag is flipped after provider +
 * exchange prerequisites (never in code alone).
 */
export const OVERNIGHT_SCANNER_PIPELINE_READY = false;

export const ENV_23X5_OWNER_AUTHORIZED = "STOCKSIST_EQUITY_23X5_OWNER_AUTHORIZED";
export const ENV_23X5_EXCHANGE_EFFECTIVE_DATE = "STOCKSIST_EQUITY_23X5_EXCHANGE_EFFECTIVE_DATE";
export const ENV_23X5_PROVIDER_CONFIRMED = "STOCKSIST_EQUITY_23X5_PROVIDER_OVERNIGHT_CONFIRMED";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Reads activation from env. Anything other than an exact "true" / ISO date is disabled. */
export function read23x5Activation(env: (key: string) => string | undefined): Equity23x5Activation {
  const flag = (k: string) => (env(k) ?? "").trim() === "true";
  const date = (env(ENV_23X5_EXCHANGE_EFFECTIVE_DATE) ?? "").trim();
  return {
    ownerAuthorized: flag(ENV_23X5_OWNER_AUTHORIZED),
    exchangeEffectiveDate: ISO_DATE.test(date) ? date : null,
    providerOvernightConfirmed: flag(ENV_23X5_PROVIDER_CONFIRMED),
  };
}

/** Overnight is in effect for `tradeDate` only when every prerequisite holds. */
export function isOvernightActiveFor(activation: Equity23x5Activation, tradeDate: string): boolean {
  return (
    activation.ownerAuthorized &&
    activation.providerOvernightConfirmed &&
    activation.exchangeEffectiveDate !== null &&
    tradeDate >= activation.exchangeEffectiveDate
  );
}

export interface EquitySessionState {
  phase: EquitySessionPhase;
  /** ET calendar date of the wall clock. */
  etDate: string;
  /**
   * Trading cycle this instant belongs to. Overnight from Sunday 21:00 is
   * Monday's cycle; Monday 21:00 is Tuesday's. Null when closed.
   */
  tradeDate: string | null;
  /** Legacy session kind for existing scanner semantics ("closed" for overnight / closures). */
  legacySessionKind: "pre-market" | "market" | "after-hours" | "closed";
  calendarSource: "calendar" | "fallback";
  holidayName: string | null;
  scanEligible: boolean;
  skipReason: ScanSkipReason | null;
}

function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function isTradingDay(schedule: ResolvedSessionSchedule): boolean {
  return schedule.marketStatus !== "closed";
}

function overnightGeometricTradeDate(
  parts: NonNullable<ReturnType<typeof easternParts>>,
  msOfDay: number,
): string | null {
  if (msOfDay < OVERNIGHT_CLOSE_MS) return parts.date;
  if (msOfDay >= OVERNIGHT_OPEN_MS) return addDaysIso(parts.date, 1);
  return null;
}

/**
 * Geometric overnight window (21:00–04:00 ET) mapped to its trading cycle
 * date. Independent of 23×5 activation — used for observation volume semantics.
 */
export function resolveOvernightCycleAt(
  nowMs: number,
  exceptions: CalendarExceptionRow[] | null,
): { tradeDate: string; etDate: string } | null {
  const parts = easternParts(nowMs);
  if (!parts) return null;
  const today = resolveSessionSchedule(parts.date, exceptions);
  const ms = parts.msOfDay;

  const overnightTradeDate = overnightGeometricTradeDate(parts, ms);

  if (!overnightTradeDate) return null;

  const cycle = overnightTradeDate === parts.date
    ? today
    : resolveSessionSchedule(overnightTradeDate, exceptions);
  const cycleDow = weekdayUtcNoon(overnightTradeDate) ?? 0;
  const cycleIsWeekday = cycleDow >= 1 && cycleDow <= 5;
  if (!cycleIsWeekday || !isTradingDay(cycle)) return null;

  return { tradeDate: overnightTradeDate, etDate: parts.date };
}

export interface ResolveEquitySessionInput {
  nowMs: number;
  /** `null` = calendar unavailable (weekday holidays then cannot be confirmed). */
  exceptions: CalendarExceptionRow[] | null;
  activation?: Equity23x5Activation;
  /** Test seam; production always uses OVERNIGHT_SCANNER_PIPELINE_READY. */
  overnightPipelineReady?: boolean;
}

export function resolveEquitySession(input: ResolveEquitySessionInput): EquitySessionState | null {
  const parts = easternParts(input.nowMs);
  if (!parts) return null;
  const activation = input.activation ?? EQUITY_23X5_DISABLED;
  const pipelineReady = input.overnightPipelineReady ?? OVERNIGHT_SCANNER_PIPELINE_READY;
  const today = resolveSessionSchedule(parts.date, input.exceptions);
  const ms = parts.msOfDay;
  const dow = weekdayUtcNoon(parts.date) ?? 0; // 0 = Sunday

  const base = {
    etDate: parts.date,
    calendarSource: today.source,
    holidayName: today.holidayName,
  };

  // 1. Standard sessions (04:00 → after-hours end) on trading days.
  const legacy = sessionKindAtMsOfDay(ms, today);
  if (legacy !== "closed") {
    return {
      ...base,
      phase: legacy,
      tradeDate: parts.date,
      legacySessionKind: legacy,
      scanEligible: true,
      skipReason: null,
    };
  }

  const overnightCycle = resolveOvernightCycleAt(input.nowMs, input.exceptions);
  if (overnightCycle) {
    const overnightTradeDate = overnightCycle.tradeDate;
    const cycle = resolveSessionSchedule(overnightTradeDate, input.exceptions);
    if (isOvernightActiveFor(activation, overnightTradeDate)) {
      return {
        ...base,
        holidayName: cycle.holidayName,
        phase: "overnight",
        tradeDate: overnightTradeDate,
        legacySessionKind: "closed",
        scanEligible: pipelineReady,
        skipReason: pipelineReady ? null : "overnight_pipeline_not_ready",
      };
    }
    return {
      ...base,
      phase: "overnight_inactive",
      tradeDate: null,
      legacySessionKind: "closed",
      scanEligible: false,
      skipReason: "overnight_not_activated",
    };
  }

  const overnightTarget = overnightGeometricTradeDate(parts, ms);
  if (overnightTarget) {
    const cycle = overnightTarget === parts.date
      ? today
      : resolveSessionSchedule(overnightTarget, input.exceptions);
    const cycleDow = weekdayUtcNoon(overnightTarget) ?? 0;
    const cycleIsWeekday = cycleDow >= 1 && cycleDow <= 5;
    if (cycleIsWeekday && !isTradingDay(cycle)) {
      return {
        ...base,
        holidayName: cycle.holidayName,
        phase: "holiday_closure",
        tradeDate: null,
        legacySessionKind: "closed",
        scanEligible: false,
        skipReason: "holiday_closure",
      };
    }
  }

  // 3. Between 04:00 and 21:00 but outside today's sessions.
  if (dow === 0 || dow === 6) {
    return { ...base, phase: "weekend_closure", tradeDate: null, legacySessionKind: "closed", scanEligible: false, skipReason: "weekend_closure" };
  }
  if (!isTradingDay(today)) {
    return { ...base, phase: "holiday_closure", tradeDate: null, legacySessionKind: "closed", scanEligible: false, skipReason: "holiday_closure" };
  }
  // After today's after-hours end (20:00, or earlier on an early close).
  if (dow === 5) {
    return { ...base, phase: "weekend_closure", tradeDate: null, legacySessionKind: "closed", scanEligible: false, skipReason: "weekend_closure" };
  }
  const tomorrow = resolveSessionSchedule(addDaysIso(parts.date, 1), input.exceptions);
  if (!isTradingDay(tomorrow)) {
    return {
      ...base,
      holidayName: tomorrow.holidayName,
      phase: "holiday_closure",
      tradeDate: null,
      legacySessionKind: "closed",
      scanEligible: false,
      skipReason: "holiday_closure",
    };
  }
  const tomorrowIso = addDaysIso(parts.date, 1);
  if (isOvernightActiveFor(activation, tomorrowIso)) {
    return { ...base, phase: "maintenance_pause", tradeDate: null, legacySessionKind: "closed", scanEligible: false, skipReason: "maintenance_pause" };
  }
  return { ...base, phase: "overnight_inactive", tradeDate: null, legacySessionKind: "closed", scanEligible: false, skipReason: "overnight_not_activated" };
}

// ---------------------------------------------------------------------------
// Calendar loading (service-role Edge reads of market_session_calendar).
// ---------------------------------------------------------------------------

export function parseCalendarExceptionRow(raw: Record<string, unknown>): CalendarExceptionRow | null {
  if (typeof raw.session_date !== "string") return null;
  if (raw.market_status !== "closed" && raw.market_status !== "early_close") return null;
  if (
    typeof raw.regular_open_et !== "string" ||
    typeof raw.regular_close_et !== "string" ||
    typeof raw.after_hours_end_et !== "string"
  ) {
    return null;
  }
  const holiday = raw.holiday_name;
  if (holiday !== null && holiday !== undefined && typeof holiday !== "string") return null;
  return {
    session_date: raw.session_date,
    market_status: raw.market_status,
    regular_open_et: raw.regular_open_et,
    regular_close_et: raw.regular_close_et,
    after_hours_end_et: raw.after_hours_end_et,
    holiday_name: (holiday as string | null | undefined) ?? null,
  };
}

type CalendarSelectClient = {
  from: (table: string) => {
    select: (cols: string) => PromiseLike<{ data: unknown; error: unknown }>;
  };
};

/**
 * Returns exception rows, or `null` when the calendar cannot be read (the
 * caller then cannot confirm weekday holidays and must not skip on them).
 */
export async function loadEquityCalendarExceptions(sb: unknown): Promise<CalendarExceptionRow[] | null> {
  try {
    const res = await (sb as CalendarSelectClient)
      .from("market_session_calendar")
      .select("session_date,market_status,regular_open_et,regular_close_et,after_hours_end_et,holiday_name");
    if (res.error || !Array.isArray(res.data)) return null;
    const out: CalendarExceptionRow[] = [];
    for (const item of res.data) {
      if (item && typeof item === "object") {
        const parsed = parseCalendarExceptionRow(item as Record<string, unknown>);
        if (parsed) out.push(parsed);
      }
    }
    return out;
  } catch {
    return null;
  }
}
