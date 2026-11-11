/**
 * Screener sync session context (ET calendar clock).
 * Used to apply extended-session field semantics without weakening truth-state.
 */

import {
  OVERNIGHT_SCANNER_PIPELINE_READY,
  resolveOvernightCycleAt,
} from "../markets/equity-session-control.ts";
import type { CalendarExceptionRow } from "../markets/session-schedule.ts";
import {
  easternParts,
  resolveScheduleAt,
  sessionKindAtMsOfDay,
  type SessionKind,
} from "../markets/session-schedule.ts";
export type SyncSessionKind = SessionKind;

/** Provider observation session — includes geometric overnight (21:00–04:00 ET). */
export type ObservationSessionKind = SyncSessionKind | "overnight";

export function resolveSyncSessionKind(nowMs: number): SyncSessionKind {
  const schedule = resolveScheduleAt(nowMs, null);
  const parts = easternParts(nowMs);
  if (!schedule || !parts) return "closed";
  return sessionKindAtMsOfDay(parts.msOfDay, schedule);
}

export function isExtendedSyncSession(kind: SyncSessionKind): boolean {
  return kind === "pre-market" || kind === "after-hours";
}

export function resolveObservationSessionKindAt(
  nowMs: number,
  exceptions: CalendarExceptionRow[] | null = null,
): ObservationSessionKind {
  const legacy = resolveSyncSessionKind(nowMs);
  if (legacy !== "closed") return legacy;
  if (resolveOvernightCycleAt(nowMs, exceptions)) return "overnight";
  return "closed";
}

export function isOvernightObservationKind(
  kind: ObservationSessionKind,
): kind is "overnight" {
  return kind === "overnight";
}

export function isExtendedOrOvernightObservationKind(
  kind: ObservationSessionKind,
): boolean {
  return kind === "pre-market" || kind === "after-hours" || kind === "overnight";
}

/**
 * When true, selection uses provider observation timestamps for volume / gap fields.
 * Overnight stays off until `overnightPipelineReady` (production constant false).
 */
export function resolveScannerObservationSessionFields(
  nowMs: number,
  exceptions: CalendarExceptionRow[] | null = null,
  overnightPipelineReady: boolean = OVERNIGHT_SCANNER_PIPELINE_READY,
): boolean {
  const legacy = resolveSyncSessionKind(nowMs);
  if (legacy === "pre-market" || legacy === "market" || legacy === "after-hours") {
    return true;
  }
  if (!overnightPipelineReady) return false;
  return resolveObservationSessionKindAt(nowMs, exceptions) === "overnight";
}

/** True only when the sync clock is in the geometric overnight window (not premarket/RTH/AH). */
export function syncAllowsOvernightObservationVolume(
  syncNowMs: number,
  exceptions: CalendarExceptionRow[] | null = null,
  overnightPipelineReady: boolean = OVERNIGHT_SCANNER_PIPELINE_READY,
): boolean {
  if (!overnightPipelineReady) return false;
  if (resolveSyncSessionKind(syncNowMs) !== "closed") return false;
  return resolveOvernightCycleAt(syncNowMs, exceptions) !== null;
}

/**
 * Observation kind used for qualification — overnight requires pipeline readiness
 * and an overnight sync clock (03:59 obs cannot qualify at 04:05 premarket).
 */
export function qualificationObservationKind(
  observationMs: number,
  syncNowMs: number,
  exceptions: CalendarExceptionRow[] | null = null,
  overnightPipelineReady: boolean = OVERNIGHT_SCANNER_PIPELINE_READY,
): ObservationSessionKind | null {
  const obsKind = resolveObservationSessionKindAt(observationMs, exceptions);
  if (obsKind === "overnight") {
    if (!syncAllowsOvernightObservationVolume(syncNowMs, exceptions, overnightPipelineReady)) {
      return null;
    }
    return "overnight";
  }
  if (obsKind === "closed") return null;
  return obsKind;
}
