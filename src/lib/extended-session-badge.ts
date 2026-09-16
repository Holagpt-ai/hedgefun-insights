/**
 * Sidebar extended-session badge state.
 * Session truth comes from resolveMarketClock (America/New_York, weekends, holidays).
 * Display labels stay separate from session determination.
 */

import { resolveMarketClock } from "@/lib/market-calendar";

export type ExtendedSessionBadgeState = "pre_market" | "after_hours" | null;

export const EXTENDED_SESSION_BADGE_POLL_MS = 30_000;

export const EXTENDED_SESSION_BADGE_LABELS = {
  pre_market: "PRE-MKT",
  after_hours: "AFTER-HRS",
} as const;

export const EXTENDED_SESSION_BADGE_TOOLTIPS = {
  pre_market: "Pre-market session · 4:00 AM–9:30 AM ET",
  after_hours: "After-hours session · 4:00 PM–8:00 PM ET",
} as const;

export function getExtendedSessionBadgeState(
  now: Date = new Date(),
): ExtendedSessionBadgeState {
  const sessionId = resolveMarketClock(now).sessionId;
  if (sessionId === "pre-market") return "pre_market";
  if (sessionId === "after-hours") return "after_hours";
  return null;
}

export function extendedSessionBadgeLabel(
  state: Exclude<ExtendedSessionBadgeState, null>,
): string {
  return EXTENDED_SESSION_BADGE_LABELS[state];
}

export function extendedSessionBadgeTooltip(
  state: Exclude<ExtendedSessionBadgeState, null>,
): string {
  return EXTENDED_SESSION_BADGE_TOOLTIPS[state];
}
