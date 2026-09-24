/**
 * Screener generation ↔ equities surveillance session alignment (browser).
 * Mirrors supabase/functions/_shared/screeners/screener-session.ts.
 */

import {
  PREMARKET_START_MS,
  type SessionKind,
} from "@/lib/equities-session-calendar";
import { easternParts, resolveMarketSessionAt } from "@/lib/market-session";
import { parseTimestampMs } from "@/lib/screeners/contract";

export type ScreenerGenerationSessionAlignment =
  | "current"
  | "previous_during_live"
  | "not_applicable";

function easternDateFromParts(parts: {
  year: number;
  month: number;
  day: number;
}): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function previousIsoDate(isoDate: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const [year, month, day] = isoDate.split("-").map(Number);
  const prev = new Date(Date.UTC(year, month - 1, day) - 24 * 3_600_000);
  const y = prev.getUTCFullYear();
  const m = String(prev.getUTCMonth() + 1).padStart(2, "0");
  const d = String(prev.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Trading/surveillance date: rolls at 04:00 ET, not midnight. */
export function surveillanceTradingDateFromMs(nowMs: number): string | null {
  const parts = easternParts(nowMs);
  if (!parts) return null;
  const date = easternDateFromParts(parts);
  if (parts.msOfDay >= PREMARKET_START_MS) return date;
  return previousIsoDate(date);
}

export function isLiveSurveillanceSessionKind(
  kind: SessionKind | string | null | undefined,
): boolean {
  return kind === "pre-market" || kind === "market" || kind === "after-hours";
}

export function resolveConsumerSessionKind(nowMs: number): SessionKind {
  return resolveMarketSessionAt(nowMs) as SessionKind;
}

export function assessScreenerGenerationSession(input: {
  nowMs: number;
  referenceIso: string | null | undefined;
  sessionKind?: SessionKind;
}): ScreenerGenerationSessionAlignment {
  const kind = input.sessionKind ?? resolveConsumerSessionKind(input.nowMs);
  if (!isLiveSurveillanceSessionKind(kind)) return "not_applicable";

  const currentSurveillance = surveillanceTradingDateFromMs(input.nowMs);
  const refMs = parseTimestampMs(input.referenceIso ?? null);
  if (currentSurveillance === null || refMs === null) {
    return "previous_during_live";
  }

  const refSurveillance = surveillanceTradingDateFromMs(refMs);
  if (refSurveillance === null || refSurveillance !== currentSurveillance) {
    return "previous_during_live";
  }
  return "current";
}

export function isPreviousSessionSnapshotDuringLiveSession(input: {
  nowMs: number;
  referenceIso: string | null | undefined;
  sessionKind?: SessionKind;
}): boolean {
  return assessScreenerGenerationSession(input) === "previous_during_live";
}

/**
 * During live surveillance the persisted feed `session_kind` must match the
 * ET calendar clock. Prevents relabeling a prior sub-session snapshot (e.g.
 * after-hours) as the current pre-market board.
 */
export function feedSessionMatchesConsumerClock(
  feedSession: string | null | undefined,
  nowMs: number,
): boolean {
  const expected = resolveConsumerSessionKind(nowMs);
  if (!isLiveSurveillanceSessionKind(expected)) return true;
  if (!feedSession || !isLiveSurveillanceSessionKind(feedSession)) return false;
  return feedSession === expected;
}
