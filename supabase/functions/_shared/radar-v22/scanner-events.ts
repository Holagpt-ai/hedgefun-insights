/**
 * Scanner events — shared by Fly worker, alerts, and frontend display.
 */

import { easternParts } from "../markets/session-schedule.ts";

export const SCANNER_EVENT_TYPES = [
  "HOD_BREAK",
  "HOD_MOMENTUM",
  "RUNNING_UP",
  "VWAP_RECLAIM",
  "GAP_CONTINUATION",
  "LATE_DAY_ACCELERATION",
  "VOLUME_EXPLOSION",
  "VWAP_LOSS",
] as const;

export type ScannerEventType = (typeof SCANNER_EVENT_TYPES)[number];

/** Primary-event priority (first wins). */
export const SCANNER_EVENT_PRIORITY: readonly ScannerEventType[] = [
  "HOD_BREAK",
  "HOD_MOMENTUM",
  "RUNNING_UP",
  "VWAP_RECLAIM",
  "GAP_CONTINUATION",
  "LATE_DAY_ACCELERATION",
  "VOLUME_EXPLOSION",
  "VWAP_LOSS",
];

export const SCANNER_EVENT_DISPLAY: Record<ScannerEventType, string> = {
  HOD_BREAK: "HOD BREAK",
  HOD_MOMENTUM: "HOD MOMENTUM",
  RUNNING_UP: "RUNNING UP",
  VWAP_RECLAIM: "VWAP RECLAIM",
  GAP_CONTINUATION: "GAP CONTINUATION",
  LATE_DAY_ACCELERATION: "LATE DAY ACCELERATION",
  VOLUME_EXPLOSION: "VOLUME EXPLOSION",
  VWAP_LOSS: "VWAP LOSS",
};

/** Regular session ~3:00–4:00 PM ET power-hour window. */
export const LATE_DAY_START_MS = 15 * 60 * 60 * 1000;
export const LATE_DAY_END_MS = 16 * 60 * 60 * 1000;

export type ScannerEventConfig = {
  minPrice: number;
  minVolumeVelocity: number;
  minSessionVolume: number;
  minVol60s: number;
  runningUpMinMove15Pct: number;
  runningUpMinMove60Pct: number;
  runningUpMinRvol5m: number;
  runningUpMinAccelerationPct: number;
  runningUpMaxDistanceFromHodPct: number;
  hodMomentumMaxDistancePct: number;
  hodMomentumMinRvol5m: number;
  hodMomentumMinAccelerationPct: number;
  volumeExplosionMinRvol5m: number;
  volumeExplosionMinAccelerationPct: number;
  volumeExplosionMinVelocity: number;
  volumeExplosionMinVolRatioPrior: number;
  hodBreakMaxDistancePct: number;
  hodBreakMinRvol5m: number;
  hodBreakMinAccelerationPct: number;
  vwapReclaimMinMove15Pct: number;
  vwapLossMinVol60s: number;
  gapContinuationMinGapPct: number;
  gapContinuationMinRvol5m: number;
  lateDayMinVelocity: number;
  lateDayMinAccelerationPct: number;
  lateDayMinMove60Pct: number;
  transitionPulseMs: number;
  eventCooldownMs: number;
};

export const DEFAULT_SCANNER_EVENT_CONFIG: ScannerEventConfig = {
  minPrice: 0.25,
  minVolumeVelocity: 25_000,
  minSessionVolume: 100_000,
  minVol60s: 50_000,
  runningUpMinMove15Pct: 0.15,
  runningUpMinMove60Pct: 0.35,
  runningUpMinRvol5m: 1.5,
  runningUpMinAccelerationPct: 15,
  runningUpMaxDistanceFromHodPct: 8,
  hodMomentumMaxDistancePct: 1.5,
  hodMomentumMinRvol5m: 1.25,
  hodMomentumMinAccelerationPct: 10,
  volumeExplosionMinRvol5m: 3,
  volumeExplosionMinAccelerationPct: 25,
  volumeExplosionMinVelocity: 40_000,
  volumeExplosionMinVolRatioPrior: 2,
  hodBreakMaxDistancePct: 0.75,
  hodBreakMinRvol5m: 1.25,
  hodBreakMinAccelerationPct: 8,
  vwapReclaimMinMove15Pct: 0.1,
  vwapLossMinVol60s: 40_000,
  gapContinuationMinGapPct: 2,
  gapContinuationMinRvol5m: 1.25,
  lateDayMinVelocity: 35_000,
  lateDayMinAccelerationPct: 12,
  lateDayMinMove60Pct: 0.2,
  transitionPulseMs: 15_000,
  eventCooldownMs: 5 * 60_000,
};

export type ScannerEventEvalInput = {
  eventNowMs: number;
  lastPrice: number | null;
  move15sPct: number | null;
  move60sPct: number | null;
  move15Complete: boolean;
  move60Complete: boolean;
  volumeVelocity: number | null;
  rvol5m: number | null;
  volumeAccelerationPct: number | null;
  /** Percent below session HOD (0 = at high). */
  distanceFromHodPct: number | null;
  sessionVolume: number | null;
  volumeRatioPrior: number | null;
  vol60s: number;
  vwapSide: "above" | "below" | "unknown";
  lastHodBreakMs: number | null;
  lastVwapReclaimMs: number | null;
  lastVwapLossMs: number | null;
  previousClose: number | null;
  sessionOpen: number | null;
  gapPercent: number | null;
};

export type ScannerEventQualification = Record<ScannerEventType, boolean>;

function finite(n: number | null | undefined): n is number {
  return n !== null && n !== undefined && Number.isFinite(n);
}

function recentPulse(
  timestampMs: number | null,
  eventNowMs: number,
  windowMs: number,
): boolean {
  if (timestampMs === null) return false;
  const age = eventNowMs - timestampMs;
  return age >= 0 && age <= windowMs;
}

export function isLateDayRegularWindow(eventNowMs: number): boolean {
  const parts = easternParts(eventNowMs);
  if (!parts) return false;
  return parts.msOfDay >= LATE_DAY_START_MS && parts.msOfDay <= LATE_DAY_END_MS;
}

function liquidityOk(input: ScannerEventEvalInput, cfg: ScannerEventConfig): boolean {
  if (!finite(input.lastPrice) || !(input.lastPrice >= cfg.minPrice)) return false;
  if (!finite(input.volumeVelocity) || !(input.volumeVelocity >= cfg.minVolumeVelocity)) {
    return false;
  }
  if (finite(input.sessionVolume) && input.sessionVolume < cfg.minSessionVolume) {
    return false;
  }
  if (!(input.vol60s >= cfg.minVol60s)) return false;
  return true;
}

function positiveMove(input: ScannerEventEvalInput, cfg: ScannerEventConfig): boolean {
  const m15 = input.move15Complete && finite(input.move15sPct) &&
    input.move15sPct >= cfg.runningUpMinMove15Pct;
  const m60 = input.move60Complete && finite(input.move60sPct) &&
    input.move60sPct >= cfg.runningUpMinMove60Pct;
  return m15 || m60;
}

function elevatedParticipation(
  input: ScannerEventEvalInput,
  minRvol: number,
  minAccel: number,
): boolean {
  const rvol = finite(input.rvol5m) && input.rvol5m >= minRvol;
  const accel = finite(input.volumeAccelerationPct) &&
    input.volumeAccelerationPct >= minAccel;
  return rvol || accel;
}

export function qualifyRunningUp(
  input: ScannerEventEvalInput,
  cfg: ScannerEventConfig = DEFAULT_SCANNER_EVENT_CONFIG,
): boolean {
  if (!liquidityOk(input, cfg)) return false;
  if (!positiveMove(input, cfg)) return false;
  if (
    finite(input.move60Complete ? input.move60sPct : null) &&
    input.move60sPct !== null &&
    input.move60sPct < -0.25
  ) {
    return false;
  }
  if (
    finite(input.distanceFromHodPct) &&
    input.distanceFromHodPct > cfg.runningUpMaxDistanceFromHodPct
  ) {
    return false;
  }
  return elevatedParticipation(
    input,
    cfg.runningUpMinRvol5m,
    cfg.runningUpMinAccelerationPct,
  );
}

export function qualifyHodMomentum(
  input: ScannerEventEvalInput,
  cfg: ScannerEventConfig = DEFAULT_SCANNER_EVENT_CONFIG,
): boolean {
  if (!liquidityOk(input, cfg)) return false;
  if (!finite(input.distanceFromHodPct)) return false;
  if (input.distanceFromHodPct > cfg.hodMomentumMaxDistancePct) return false;
  if (!positiveMove(input, cfg)) return false;
  return elevatedParticipation(
    input,
    cfg.hodMomentumMinRvol5m,
    cfg.hodMomentumMinAccelerationPct,
  );
}

export function qualifyHodBreak(
  input: ScannerEventEvalInput,
  cfg: ScannerEventConfig = DEFAULT_SCANNER_EVENT_CONFIG,
): boolean {
  if (!liquidityOk(input, cfg)) return false;
  if (
    !recentPulse(input.lastHodBreakMs, input.eventNowMs, cfg.transitionPulseMs)
  ) {
    return false;
  }
  if (
    !finite(input.distanceFromHodPct) ||
    input.distanceFromHodPct > cfg.hodBreakMaxDistancePct
  ) {
    return false;
  }
  if (!positiveMove(input, cfg)) return false;
  return elevatedParticipation(
    input,
    cfg.hodBreakMinRvol5m,
    cfg.hodBreakMinAccelerationPct,
  );
}

export function qualifyVwapReclaim(
  input: ScannerEventEvalInput,
  cfg: ScannerEventConfig = DEFAULT_SCANNER_EVENT_CONFIG,
): boolean {
  if (!liquidityOk(input, cfg)) return false;
  if (input.vwapSide !== "above") return false;
  if (
    !recentPulse(input.lastVwapReclaimMs, input.eventNowMs, cfg.transitionPulseMs)
  ) {
    return false;
  }
  const m15 = input.move15Complete && finite(input.move15sPct) &&
    input.move15sPct >= cfg.vwapReclaimMinMove15Pct;
  const m60 = input.move60Complete && finite(input.move60sPct) &&
    input.move60sPct >= cfg.vwapReclaimMinMove15Pct;
  if (!m15 && !m60) return false;
  return elevatedParticipation(input, 1, cfg.runningUpMinAccelerationPct);
}

export function qualifyVwapLoss(
  input: ScannerEventEvalInput,
  cfg: ScannerEventConfig = DEFAULT_SCANNER_EVENT_CONFIG,
): boolean {
  if (!finite(input.lastPrice) || !(input.lastPrice >= cfg.minPrice)) return false;
  if (input.vwapSide !== "below") return false;
  if (
    !recentPulse(input.lastVwapLossMs, input.eventNowMs, cfg.transitionPulseMs)
  ) {
    return false;
  }
  if (!(input.vol60s >= cfg.vwapLossMinVol60s)) return false;
  return finite(input.volumeVelocity) &&
    input.volumeVelocity >= cfg.minVolumeVelocity;
}

export function qualifyGapContinuation(
  input: ScannerEventEvalInput,
  cfg: ScannerEventConfig = DEFAULT_SCANNER_EVENT_CONFIG,
): boolean {
  if (!liquidityOk(input, cfg)) return false;
  if (!finite(input.gapPercent) || input.gapPercent < cfg.gapContinuationMinGapPct) {
    return false;
  }
  if (!positiveMove(input, cfg)) return false;
  if (
    finite(input.rvol5m) && input.rvol5m >= cfg.gapContinuationMinRvol5m
  ) {
    return true;
  }
  return finite(input.volumeAccelerationPct) &&
    input.volumeAccelerationPct >= cfg.runningUpMinAccelerationPct;
}

export function qualifyLateDayAcceleration(
  input: ScannerEventEvalInput,
  cfg: ScannerEventConfig = DEFAULT_SCANNER_EVENT_CONFIG,
): boolean {
  if (!isLateDayRegularWindow(input.eventNowMs)) return false;
  if (!liquidityOk(input, cfg)) return false;
  const m60 = input.move60Complete && finite(input.move60sPct) &&
    input.move60sPct >= cfg.lateDayMinMove60Pct;
  if (!m60) return false;
  const velOk = finite(input.volumeVelocity) &&
    input.volumeVelocity >= cfg.lateDayMinVelocity;
  const accelOk = finite(input.volumeAccelerationPct) &&
    input.volumeAccelerationPct >= cfg.lateDayMinAccelerationPct;
  return velOk || accelOk;
}

export function qualifyVolumeExplosion(
  input: ScannerEventEvalInput,
  cfg: ScannerEventConfig = DEFAULT_SCANNER_EVENT_CONFIG,
): boolean {
  if (!finite(input.lastPrice) || !(input.lastPrice >= cfg.minPrice)) return false;
  if (!finite(input.rvol5m) || !(input.rvol5m >= cfg.volumeExplosionMinRvol5m)) {
    return false;
  }
  const accelOk = finite(input.volumeAccelerationPct) &&
    input.volumeAccelerationPct >= cfg.volumeExplosionMinAccelerationPct;
  const velOk = finite(input.volumeVelocity) &&
    input.volumeVelocity >= cfg.volumeExplosionMinVelocity;
  if (accelOk || velOk) return true;
  return finite(input.volumeRatioPrior) &&
    input.volumeRatioPrior >= cfg.volumeExplosionMinVolRatioPrior &&
    finite(input.volumeVelocity) &&
    input.volumeVelocity >= cfg.minVolumeVelocity;
}

export function evaluateScannerEventQualification(
  input: ScannerEventEvalInput,
  cfg: ScannerEventConfig = DEFAULT_SCANNER_EVENT_CONFIG,
): ScannerEventQualification {
  return {
    HOD_BREAK: qualifyHodBreak(input, cfg),
    HOD_MOMENTUM: qualifyHodMomentum(input, cfg),
    RUNNING_UP: qualifyRunningUp(input, cfg),
    VWAP_RECLAIM: qualifyVwapReclaim(input, cfg),
    GAP_CONTINUATION: qualifyGapContinuation(input, cfg),
    LATE_DAY_ACCELERATION: qualifyLateDayAcceleration(input, cfg),
    VOLUME_EXPLOSION: qualifyVolumeExplosion(input, cfg),
    VWAP_LOSS: qualifyVwapLoss(input, cfg),
  };
}

export type ScannerEventSnapshot = {
  type: ScannerEventType;
  triggered_at: string;
  active: boolean;
};

export function pickPrimaryScannerEvent(
  active: readonly ScannerEventSnapshot[],
  priority: readonly ScannerEventType[] = SCANNER_EVENT_PRIORITY,
): ScannerEventSnapshot | null {
  const byType = new Map(active.filter((e) => e.active).map((e) => [e.type, e]));
  for (const type of priority) {
    const hit = byType.get(type);
    if (hit) return hit;
  }
  return null;
}

export function isScannerEventType(value: unknown): value is ScannerEventType {
  return typeof value === "string" &&
    (SCANNER_EVENT_TYPES as readonly string[]).includes(value);
}

export function computeGapPercent(
  sessionOpen: number | null,
  previousClose: number | null,
): number | null {
  if (!finite(sessionOpen) || !finite(previousClose) || previousClose <= 0) {
    return null;
  }
  return ((sessionOpen - previousClose) / previousClose) * 100;
}
