/**
 * Session-aware Polygon snapshot volume for Edge screeners.
 * Volume source follows the verified provider observation session (min.t / updated),
 * not the sync execution clock alone.
 */

import { resolveSyncSessionKind, type SyncSessionKind } from "./session-sync-context.ts";
import { surveillanceTradingDateFromMs } from "./screener-session.ts";

export type VolumeTicker = {
  updated?: unknown;
  lastTrade?: { t?: unknown };
  min?: { av?: unknown; v?: unknown; t?: unknown };
  day?: { v?: unknown };
};

/** Align with selection.ts provider freshness skew. */
export const PROVIDER_FUTURE_SKEW_MS = 5 * 60_000;

function safeNumber(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export type SessionVolumeContext = {
  /** Server clock extended sync (pre-market / after-hours). */
  extendedSession?: boolean;
  /** Live surveillance sync: resolve volume from each ticker's observation session. */
  observationSessionVolume?: boolean;
  nowMs?: number;
};

function usesObservationVolumeResolution(ctx: SessionVolumeContext): boolean {
  return ctx.observationSessionVolume === true || ctx.extendedSession === true;
}

function positiveFinite(value: unknown): number | null {
  const n = safeNumber(value);
  return n !== null && n > 0 ? n : null;
}

/** Regular session: positive day.v only (0 is unavailable, not verified zero). */
export function regularSessionVolume(t: VolumeTicker): number | null {
  return positiveFinite(t?.day?.v);
}

/** Premarket: cumulative min.av only — never substitute one-minute min.v. */
export function premarketAccumulatedVolume(t: VolumeTicker): number | null {
  return positiveFinite(t?.min?.av);
}

/**
 * After-hours incremental volume when the provider regular-session day.v baseline
 * is available on the same snapshot. If min.av does not exceed day.v, AH volume
 * is treated as unavailable (not fabricated).
 */
export function afterHoursIncrementalVolume(t: VolumeTicker): number | null {
  const accumulated = positiveFinite(t?.min?.av);
  const regularTotal = regularSessionVolume(t);
  if (accumulated === null || regularTotal === null) return null;
  if (accumulated <= regularTotal) return null;
  return accumulated - regularTotal;
}

function parseUpdatedFieldToMs(raw: unknown, nowMs: number): number | null {
  if (!Number.isFinite(nowMs)) return null;
  if (raw === undefined || raw === null) return null;

  let nanos: number;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || !Number.isInteger(raw)) return null;
    nanos = raw;
  } else if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.length > 22 || !/^\d+$/.test(trimmed)) return null;
    nanos = Number(trimmed);
    if (!Number.isFinite(nanos)) return null;
  } else {
    return null;
  }

  if (!(nanos > 0)) return null;
  const ms = Math.trunc(nanos / 1_000_000);
  if (!(ms > 0) || !Number.isFinite(ms)) return null;
  if (ms > nowMs + PROVIDER_FUTURE_SKEW_MS) return null;
  return ms;
}

/** Polygon min.t / lastTrade.t (ms or ns). */
export function parseProviderTimestampMs(
  raw: unknown,
  nowMs: number,
): number | null {
  if (!Number.isFinite(nowMs)) return null;
  const n = safeNumber(raw);
  if (n === null || !(n > 0)) return null;

  let ms: number;
  if (n >= 1e15) ms = Math.trunc(n / 1_000_000);
  else if (n >= 1e11) ms = Math.trunc(n);
  else ms = Math.trunc(n * 1_000);

  if (!(ms > 0) || !Number.isFinite(ms)) return null;
  if (ms > nowMs + PROVIDER_FUTURE_SKEW_MS) return null;
  const parsed = new Date(ms).getTime();
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

/**
 * Verified observation instant for volume session classification.
 * Prefers min.t (same bar as min.av), then updated; rejects contradictory pairs.
 */
export function resolveVerifiedObservationMs(
  t: VolumeTicker,
  nowMs: number,
): number | null {
  const minMs = t.min?.t !== undefined && t.min?.t !== null
    ? parseProviderTimestampMs(t.min.t, nowMs)
    : null;
  const updatedMs = t.updated !== undefined && t.updated !== null
    ? parseUpdatedFieldToMs(t.updated, nowMs)
    : null;

  if (minMs !== null && updatedMs !== null) {
    const kindMin = resolveSyncSessionKind(minMs);
    const kindUpdated = resolveSyncSessionKind(updatedMs);
    if (kindMin !== kindUpdated) return null;
  }

  if (minMs !== null) return minMs;
  if (updatedMs !== null) return updatedMs;

  if (t.lastTrade?.t !== undefined && t.lastTrade?.t !== null) {
    return parseProviderTimestampMs(t.lastTrade.t, nowMs);
  }
  return null;
}

export function resolveObservationSessionKind(
  t: VolumeTicker,
  nowMs: number,
): SyncSessionKind | null {
  const observationMs = resolveVerifiedObservationMs(t, nowMs);
  if (observationMs === null) return null;
  return resolveSyncSessionKind(observationMs);
}

function volumeForObservationSession(
  t: VolumeTicker,
  kind: SyncSessionKind,
): number | null {
  if (kind === "pre-market") return premarketAccumulatedVolume(t);
  if (kind === "market") return regularSessionVolume(t);
  if (kind === "after-hours") return afterHoursIncrementalVolume(t);
  return null;
}

function isCurrentSurveillanceObservation(
  observationMs: number,
  syncNowMs: number,
): boolean {
  const syncDate = surveillanceTradingDateFromMs(syncNowMs);
  const obsDate = surveillanceTradingDateFromMs(observationMs);
  return syncDate !== null && obsDate !== null && syncDate === obsDate;
}

/**
 * Qualification / ranking volume for screener tabs.
 * Extended sync uses provider observation session; regular sync uses day.v.
 */
/** Extended last / gap semantics when observation is pre-market or after-hours. */
export function extendedQuoteSemanticsForObservation(
  t: VolumeTicker,
  nowMs: number,
): boolean | null {
  const kind = resolveObservationSessionKind(t, nowMs);
  if (kind === null) return null;
  return kind === "pre-market" || kind === "after-hours";
}

export function sessionQualificationVolume(
  t: VolumeTicker,
  ctx: SessionVolumeContext = {},
): number | null {
  if (!usesObservationVolumeResolution(ctx)) return regularSessionVolume(t);

  const nowMs = ctx.nowMs;
  if (nowMs === undefined || !Number.isFinite(nowMs)) return null;

  const observationMs = resolveVerifiedObservationMs(t, nowMs);
  if (observationMs === null) return null;
  if (!isCurrentSurveillanceObservation(observationMs, nowMs)) return null;

  const kind = resolveSyncSessionKind(observationMs);
  return volumeForObservationSession(t, kind);
}

export function volumeContextFromMeta(meta: {
  extendedSession?: boolean;
  observationSessionFields?: boolean;
  nowMs: number;
}): SessionVolumeContext {
  return {
    extendedSession: meta.extendedSession ?? false,
    observationSessionVolume: meta.observationSessionFields ?? false,
    nowMs: meta.nowMs,
  };
}

export function volumeContextFromOpts(opts?: {
  extendedSession?: boolean;
  observationSessionFields?: boolean;
  nowMs?: number;
}): SessionVolumeContext {
  return {
    extendedSession: opts?.extendedSession ?? false,
    observationSessionVolume: opts?.observationSessionFields ?? false,
    nowMs: opts?.nowMs,
  };
}
