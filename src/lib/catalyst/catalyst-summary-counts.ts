/**
 * Catalyst dashboard summary counts — independent of the bounded event feed page.
 * Upcoming Earnings must not be derived from feed rows capped at 500 (asc event_date
 * saturates on historical dates — Batch 229 / production defect Nov 12 2026).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalystEvent, CatalystTimeOfDay } from "@/types/catalyst";
import {
  etMidnightMs,
  etStartOfDayMs,
  scheduledMomentMs,
} from "@/lib/catalyst/parsers";
import {
  NORMAL_AFTER_HOURS_END_MS,
  NORMAL_REGULAR_CLOSE_MS,
  NORMAL_REGULAR_OPEN_MS,
} from "@/lib/equities-session-calendar";
import { easternParts } from "@/lib/market-session";

/** Hard cap on rows scanned for client-side upcoming classification (fail-closed bound). */
export const CATALYST_UPCOMING_EARNINGS_SCAN_CAP = 5_000;
export const CATALYST_UPCOMING_EARNINGS_PAGE_SIZE = 1_000;

const UPCOMING_EARNINGS_SCAN_FIELDS =
  "id, event_type, event_time, event_date, time_of_day, published_at, verification_state";

export function etCalendarDateFromMs(nowMs: number): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(nowMs));
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const mo = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${mo}-${d}`;
}

/** Add whole ET calendar days to a YYYY-MM-DD key (DST-safe via noon stepping). */
export function addEtCalendarDays(dateEt: string, days: number): string {
  const midnight = etMidnightMs(dateEt);
  if (midnight === null) return dateEt;
  const noon = midnight + 12 * 3_600_000;
  return etCalendarDateFromMs(noon + days * 86_400_000);
}

export function upcomingEarningsHorizonEndEt(nowMs: number, upcomingDays: number): string {
  const today = etCalendarDateFromMs(nowMs);
  return addEtCalendarDays(today, upcomingDays);
}

export function isEventDateWithinUpcomingHorizon(
  eventDate: string,
  nowMs: number,
  upcomingDays: number,
): boolean {
  const today = etCalendarDateFromMs(nowMs);
  const lastInclusive = upcomingEarningsHorizonEndEt(nowMs, upcomingDays);
  return eventDate >= today && eventDate <= lastInclusive;
}

export type UpcomingEarningsRow = Pick<
  CatalystEvent,
  | "id"
  | "event_type"
  | "event_time"
  | "event_date"
  | "time_of_day"
  | "published_at"
  | "verification_state"
>;

/**
 * True while the provider-scheduled reporting window for today's ET calendar row
 * has not ended. Never uses `published_at` and never infers that earnings were
 * released merely because a window elapsed.
 */
export function isEarningsReportingWindowStillOpen(
  row: Pick<UpcomingEarningsRow, "event_date" | "event_time" | "time_of_day">,
  nowMs: number,
): boolean {
  const eventDate = row.event_date;
  if (!eventDate) return false;
  const today = etCalendarDateFromMs(nowMs);
  if (eventDate > today) return true;
  if (eventDate < today) return false;

  if (row.event_time) {
    const t = Date.parse(row.event_time);
    return Number.isFinite(t) && t > nowMs;
  }

  const parts = easternParts(nowMs);
  if (!parts) return false;

  const tod: CatalystTimeOfDay | null = row.time_of_day ?? null;
  switch (tod) {
    case "before_open":
      return parts.msOfDay < NORMAL_REGULAR_OPEN_MS;
    case "after_close":
      return parts.msOfDay < NORMAL_AFTER_HOURS_END_MS;
    case "during":
      return parts.msOfDay < NORMAL_REGULAR_CLOSE_MS;
    case "unknown":
    default:
      return true;
  }
}

/**
 * Scheduled upcoming earnings within `upcomingDays` ET calendar horizon.
 */
export function isUpcomingEarningsSummaryRow(
  row: UpcomingEarningsRow,
  nowMs: number,
  upcomingDays: number,
): boolean {
  if (row.event_type !== "earnings") return false;
  if (row.verification_state !== "provider_reported") return false;
  if (!row.event_date) return false;
  if (!isEventDateWithinUpcomingHorizon(row.event_date, nowMs, upcomingDays)) return false;
  if (scheduledMomentMs(row) === null) return false;
  return isEarningsReportingWindowStillOpen(row, nowMs);
}

export function countUpcomingEarningsInRows(
  rows: readonly UpcomingEarningsRow[],
  nowMs: number,
  upcomingDays: number,
): number {
  let n = 0;
  for (const row of rows) {
    if (isUpcomingEarningsSummaryRow(row, nowMs, upcomingDays)) n += 1;
  }
  return n;
}

export type CatalystUpcomingEarningsCountResult = {
  count: number;
  truncated: boolean;
  error?: string;
};

/**
 * Bounded scan of earnings rows by `event_date` window, then classify client-side.
 */
export async function fetchCatalystUpcomingEarningsCount(
  client: SupabaseClient,
  args: {
    nowMs?: number;
    upcomingDays?: number;
    symbol?: string | null;
  } = {},
): Promise<CatalystUpcomingEarningsCountResult> {
  const nowMs = args.nowMs ?? Date.now();
  const upcomingDays = args.upcomingDays ?? 30;
  const todayEt = etCalendarDateFromMs(nowMs);
  const horizonEndEt = upcomingEarningsHorizonEndEt(nowMs, upcomingDays);
  const pageSize = CATALYST_UPCOMING_EARNINGS_PAGE_SIZE;
  let total = 0;
  let truncated = false;

  try {
    for (let offset = 0; offset < CATALYST_UPCOMING_EARNINGS_SCAN_CAP; offset += pageSize) {
      let q = client
        .from("catalyst_events")
        .select(UPCOMING_EARNINGS_SCAN_FIELDS)
        .eq("event_type", "earnings")
        .eq("verification_state", "provider_reported")
        .gte("event_date", todayEt)
        .lte("event_date", horizonEndEt)
        .order("event_date", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1);

      const sym = args.symbol?.trim().toUpperCase();
      if (sym) q = q.eq("symbol", sym);

      const { data, error } = await q;
      if (error) return { count: 0, truncated: false, error: error.message };
      const rows = (data ?? []) as UpcomingEarningsRow[];
      total += countUpcomingEarningsInRows(rows, nowMs, upcomingDays);
      if (rows.length < pageSize) break;
      if (offset + pageSize >= CATALYST_UPCOMING_EARNINGS_SCAN_CAP) {
        truncated = true;
        break;
      }
    }
    return { count: total, truncated };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { count: 0, truncated: false, error: msg };
  }
}

export type CatalystLast24CountResult = {
  count: number;
  error?: string;
};

/** Published in the last 24h — uses `published_at`, not feed row cap. */
export async function fetchCatalystPublishedLast24Count(
  client: SupabaseClient,
  args: { nowMs?: number; symbol?: string | null } = {},
): Promise<CatalystLast24CountResult> {
  const nowMs = args.nowMs ?? Date.now();
  const since = new Date(nowMs - 24 * 3_600_000).toISOString();
  const until = new Date(nowMs).toISOString();
  try {
    let q = client
      .from("catalyst_events")
      .select("id", { count: "exact", head: true })
      .eq("verification_state", "provider_reported")
      .gte("published_at", since)
      .lte("published_at", until);

    const sym = args.symbol?.trim().toUpperCase();
    if (sym) q = q.eq("symbol", sym);

    const { count, error } = await q;
    if (error) return { count: 0, error: error.message };
    return { count: count ?? 0 };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { count: 0, error: msg };
  }
}
