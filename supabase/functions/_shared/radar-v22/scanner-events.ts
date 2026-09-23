/**
 * Scanner Phase 2 — event detection (RUNNING_UP, HOD_MOMENTUM, VOLUME_EXPLOSION).
 * Shared by the Fly worker and frontend display/trigger adapters.
 */

export const SCANNER_EVENT_TYPES = [
  "HOD_MOMENTUM",
  "RUNNING_UP",
  "VOLUME_EXPLOSION",
] as const;

export type ScannerEventType = (typeof SCANNER_EVENT_TYPES)[number];

/** Primary-event priority (first wins). */
export const SCANNER_EVENT_PRIORITY: readonly ScannerEventType[] = [
  "HOD_MOMENTUM",
  "RUNNING_UP",
  "VOLUME_EXPLOSION",
];

export const SCANNER_EVENT_DISPLAY: Record<ScannerEventType, string> = {
  HOD_MOMENTUM: "HOD MOMENTUM",
  RUNNING_UP: "RUNNING UP",
  VOLUME_EXPLOSION: "VOLUME EXPLOSION",
};

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
  eventCooldownMs: 5 * 60_000,
};

export type ScannerEventEvalInput = {
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
};

export type ScannerEventQualification = Record<ScannerEventType, boolean>;

function finite(n: number | null | undefined): n is number {
  return n !== null && n !== undefined && Number.isFinite(n);
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
    HOD_MOMENTUM: qualifyHodMomentum(input, cfg),
    RUNNING_UP: qualifyRunningUp(input, cfg),
    VOLUME_EXPLOSION: qualifyVolumeExplosion(input, cfg),
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
