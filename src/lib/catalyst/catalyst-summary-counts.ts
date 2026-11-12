/**
 * Catalyst dashboard summary counts — independent of the bounded event feed page.
 * Upcoming Earnings must not be derived from feed rows capped at 500 (asc event_date
 * saturates on historical dates — Batch 229 / production defect Nov 12 2026).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalystEvent } from "@/types/catalyst";
import {
  catalystEventsFetchWindow,
  etStartOfDayMs,
  scheduledMomentMs,
} from "@/lib/catalyst/parsers";

const DAY_MS = 86_400_000;

/** Hard cap on rows scanned for client-side upcoming classification (fail-closed bound). */
export const CATALYST_UPCOMING_EARNINGS_SCAN_CAP = 5_000;

const UPCOMING_EARNINGS_SCAN_FIELDS =
  "id, event_type, event_time, event_date, published_at, verification_state";

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

export type UpcomingEarningsRow = Pick<
  CatalystEvent,
  "event_type" | "event_time" | "event_date" | "published_at" | "verification_state"
>;

/**
 * Scheduled upcoming earnings within `upcomingDays` ET calendar horizon.
 * Uses `scheduledMomentMs` only (never published_at) so announcement timestamps
 * cannot demote a future `event_date`. Date-only rows on today's ET calendar day
 * remain upcoming for the full session (incl. after-close). Timed rows use `nowMs`
 * as the lower bound.
 */
export function isUpcomingEarningsSummaryRow(
  row: UpcomingEarningsRow,
  nowMs: number,
  upcomingDays: number,
): boolean {
  if (row.event_type !== "earnings") return false;
  if (row.verification_state !== "provider_reported") return false;
  const scheduled = scheduledMomentMs(row);
  if (scheduled === null) return false;

  const todayStart = etStartOfDayMs(nowMs);
  const upcomingEnd = todayStart + (upcomingDays + 1) * DAY_MS;
  const lower = row.event_time ? nowMs : todayStart;
  return scheduled >= lower && scheduled < upcomingEnd;
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
  const { upcomingTo } = catalystEventsFetchWindow(nowMs, 3, upcomingDays);
  const todayEt = etCalendarDateFromMs(nowMs);
  const pageSize = 1_000;
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
        .lte("event_date", upcomingTo)
        .order("event_date", { ascending: true })
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
  try {
    let q = client
      .from("catalyst_events")
      .select("id", { count: "exact", head: true })
      .eq("verification_state", "provider_reported")
      .gte("published_at", since);

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
