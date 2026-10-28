/**
 * Session-aware Polygon snapshot volume for Edge screeners.
 * Regular session uses positive day.v; extended sessions use verified accumulation rules.
 */

import { resolveSyncSessionKind, type SyncSessionKind } from "./session-sync-context.ts";

export type VolumeTicker = {
  day?: { v?: unknown };
  min?: { av?: unknown; v?: unknown };
};

function safeNumber(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export type SessionVolumeContext = {
  extendedSession?: boolean;
  nowMs?: number;
};

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

function syncSessionKind(ctx: SessionVolumeContext): SyncSessionKind {
  if (ctx.nowMs !== undefined && Number.isFinite(ctx.nowMs)) {
    return resolveSyncSessionKind(ctx.nowMs);
  }
  return ctx.extendedSession ? "pre-market" : "market";
}

/**
 * Qualification / ranking volume for screener tabs.
 * Regular: day.v &gt; 0. Premarket: min.av &gt; 0. After-hours: verified increment only.
 */
export function sessionQualificationVolume(
  t: VolumeTicker,
  ctx: SessionVolumeContext = {},
): number | null {
  const extended = ctx.extendedSession === true;
  if (!extended) return regularSessionVolume(t);

  const kind = syncSessionKind(ctx);
  if (kind === "pre-market") return premarketAccumulatedVolume(t);
  if (kind === "after-hours") return afterHoursIncrementalVolume(t);
  return regularSessionVolume(t);
}

export function volumeContextFromMeta(meta: {
  extendedSession?: boolean;
  nowMs: number;
}): SessionVolumeContext {
  return {
    extendedSession: meta.extendedSession ?? false,
    nowMs: meta.nowMs,
  };
}

export function volumeContextFromOpts(opts?: {
  extendedSession?: boolean;
  nowMs?: number;
}): SessionVolumeContext {
  return {
    extendedSession: opts?.extendedSession ?? false,
    nowMs: opts?.nowMs,
  };
}
