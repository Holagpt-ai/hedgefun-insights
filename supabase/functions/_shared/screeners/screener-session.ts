/**
 * Screener generation ↔ equities surveillance session alignment.
 *
 * Surveillance trading date rolls at 04:00 ET (same authority as Radar V2).
 * During live pre-market / RTH / after-hours, a persisted generation whose
 * reference timestamp belongs to a prior surveillance date must not be treated
 * as the current-session scanner universe.
 */

import {
  easternParts,
  isIsoDate,
  MS_PER_HOUR,
  PREMARKET_START_MS,
  type SessionKind,
} from "../markets/session-schedule.ts";
import { resolveSyncSessionKind } from "./session-sync-context.ts";

export type ScreenerGenerationSessionAlignment =
  | "current"
  | "previous_during_live"
  | "not_applicable";

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
export function surveillanceTradingDateFromMs(nowMs: number): string | null {
  const parts = easternParts(nowMs);
  if (!parts) return null;
  if (parts.msOfDay >= PREMARKET_START_MS) return parts.date;
  return previousIsoDate(parts.date);
}

export function isLiveSurveillanceSessionKind(kind: SessionKind): boolean {
  return kind === "pre-market" || kind === "market" || kind === "after-hours";
}

function parseReferenceMs(referenceIso: string | null | undefined): number | null {
  if (typeof referenceIso !== "string" || referenceIso.trim() === "") {
    return null;
  }
  const ms = Date.parse(referenceIso);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Compare a generation reference timestamp (synced_at or provider_as_of_max)
 * against the consumer clock. Closed sessions defer to legacy stale-age rules.
 */
export function assessScreenerGenerationSession(input: {
  nowMs: number;
  referenceIso: string | null | undefined;
  sessionKind?: SessionKind;
}): ScreenerGenerationSessionAlignment {
  const kind = input.sessionKind ?? resolveSyncSessionKind(input.nowMs);
  if (!isLiveSurveillanceSessionKind(kind)) return "not_applicable";

  const currentSurveillance = surveillanceTradingDateFromMs(input.nowMs);
  const refMs = parseReferenceMs(input.referenceIso);
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
