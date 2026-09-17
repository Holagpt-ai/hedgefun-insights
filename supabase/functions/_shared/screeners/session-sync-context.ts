/**
 * Screener sync session context (ET calendar clock).
 * Used to apply extended-session field semantics without weakening truth-state.
 */

import {
  easternParts,
  resolveScheduleAt,
  sessionKindAtMsOfDay,
  type SessionKind,
} from "../markets/session-schedule.ts";

export type SyncSessionKind = SessionKind;

export function resolveSyncSessionKind(nowMs: number): SyncSessionKind {
  const schedule = resolveScheduleAt(nowMs, null);
  const parts = easternParts(nowMs);
  if (!schedule || !parts) return "closed";
  return sessionKindAtMsOfDay(parts.msOfDay, schedule);
}

export function isExtendedSyncSession(kind: SyncSessionKind): boolean {
  return kind === "pre-market" || kind === "after-hours";
}
