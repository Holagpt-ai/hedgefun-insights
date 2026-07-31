// Earnings countdown helpers for Watchlist — provider-reported Catalyst events only.
// Scheduled timing uses event_time / event_date (never published_at). Never infers BMO/AMC.

import type { CatalystEvent } from "@/types/catalyst";
import { scheduledMomentMs } from "@/lib/catalyst/parsers";

export const EARNINGS_UPCOMING_MS = 7 * 86_400_000;
export const EARNINGS_RECENT_MS = 72 * 60 * 60 * 1000;

export type EarningsKind = "upcoming" | "recent";

export interface EarningsBadge {
  event: CatalystEvent;
  kind: EarningsKind;
  sortMs: number;
  /** Date-based label only — never fabricates BMO/AMC/time. */
  label: string;
}

function etCalendarDateKey(ms: number): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms));
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const mo = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${mo}-${d}`;
}

function calendarDayDiffEt(fromMs: number, toMs: number): number {
  const a = etCalendarDateKey(fromMs);
  const b = etCalendarDateKey(toMs);
  // Parse YYYY-MM-DD as UTC noon to avoid DST edge on day math.
  const aMs = Date.parse(`${a}T12:00:00Z`);
  const bMs = Date.parse(`${b}T12:00:00Z`);
  if (!Number.isFinite(aMs) || !Number.isFinite(bMs)) return 0;
  return Math.round((bMs - aMs) / 86_400_000);
}

export function formatEarningsCountdownLabel(
  kind: EarningsKind,
  sortMs: number,
  nowMs: number = Date.now(),
): string {
  if (kind === "upcoming") {
    const days = calendarDayDiffEt(nowMs, sortMs);
    if (days <= 0) return "Earnings Today";
    if (days === 1) return "Earnings Tomorrow";
    return `Earnings in ${days}d`;
  }
  const daysAgo = Math.max(0, calendarDayDiffEt(sortMs, nowMs));
  if (daysAgo <= 0) return "Reported today";
  return `Reported ${daysAgo}d ago`;
}

/**
 * Classify a verified earnings row for Watchlist badges.
 * Upcoming: scheduled within next 7 calendar days.
 * Recent: scheduled within past 72 hours.
 * Never uses published_at for eligibility.
 */
export function classifyEarningsEvent(
  row: Pick<CatalystEvent, "event_type" | "event_time" | "event_date" | "verification_state">,
  nowMs: number,
): { kind: EarningsKind; sortMs: number } | null {
  if (row.event_type !== "earnings") return null;
  if (row.verification_state !== "provider_reported") return null;
  const scheduled = scheduledMomentMs(row);
  if (scheduled === null) return null;

  if (scheduled >= nowMs && scheduled <= nowMs + EARNINGS_UPCOMING_MS) {
    return { kind: "upcoming", sortMs: scheduled };
  }
  if (scheduled < nowMs && scheduled >= nowMs - EARNINGS_RECENT_MS) {
    return { kind: "recent", sortMs: scheduled };
  }
  return null;
}

function shouldReplaceEarnings(
  prev: EarningsBadge,
  nextKind: EarningsKind,
  nextSortMs: number,
  nextId: string,
): boolean {
  if (prev.kind === "upcoming" && nextKind === "upcoming") {
    if (nextSortMs !== prev.sortMs) return nextSortMs < prev.sortMs;
    return nextId < prev.event.id;
  }
  if (prev.kind === "recent" && nextKind === "upcoming") return true;
  if (prev.kind === "recent" && nextKind === "recent") {
    if (nextSortMs !== prev.sortMs) return nextSortMs > prev.sortMs;
    return nextId < prev.event.id;
  }
  return false;
}

/**
 * Deterministically pick the nearest eligible verified earnings event per symbol.
 */
export function selectNearestEarnings(
  events: readonly CatalystEvent[],
  requestedSymbols: readonly string[],
  nowMs: number = Date.now(),
): Map<string, EarningsBadge> {
  const wanted = new Set(
    requestedSymbols.map((s) => s.trim().toUpperCase()).filter(Boolean),
  );
  const bySym = new Map<string, EarningsBadge>();

  for (const raw of events) {
    const sym = (raw.symbol ?? "").trim().toUpperCase();
    if (!sym || !wanted.has(sym)) continue;
    const classified = classifyEarningsEvent(raw, nowMs);
    if (!classified) continue;

    const next: EarningsBadge = {
      event: raw,
      kind: classified.kind,
      sortMs: classified.sortMs,
      label: formatEarningsCountdownLabel(classified.kind, classified.sortMs, nowMs),
    };
    const prev = bySym.get(sym);
    if (!prev || shouldReplaceEarnings(prev, next.kind, next.sortMs, raw.id)) {
      bySym.set(sym, next);
    }
  }
  return bySym;
}

/** True when badge is upcoming earnings within 7 days (summary / filter). */
export function isEarningsWithin7Days(badge: EarningsBadge | null | undefined): boolean {
  return !!badge && badge.kind === "upcoming";
}
