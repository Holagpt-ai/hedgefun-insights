/**
 * Daily RVOL 20D — Deno/shared copy. Keep in sync with src/lib/screeners/daily-rvol.ts.
 */

export const RVOL_20D_SESSION_COUNT = 20;

export function isValidHistoricalSessionVolume(volume: number): boolean {
  return Number.isFinite(volume) && volume > 0;
}

export function isValidCurrentSessionVolume(volume: number): boolean {
  return Number.isFinite(volume) && volume >= 0;
}

export function averageFullDayVolume20d(historicalVolumes: readonly number[]): number | null {
  if (historicalVolumes.length !== RVOL_20D_SESSION_COUNT) return null;
  let sum = 0;
  for (const volume of historicalVolumes) {
    if (!isValidHistoricalSessionVolume(volume)) return null;
    sum += volume;
  }
  return sum / RVOL_20D_SESSION_COUNT;
}

export function computeDailyRvol20d(
  currentSessionVolume: number | null | undefined,
  avgVolume20d: number | null | undefined,
): number | null {
  if (currentSessionVolume === null || currentSessionVolume === undefined) return null;
  if (!isValidCurrentSessionVolume(currentSessionVolume)) return null;
  if (avgVolume20d === null || avgVolume20d === undefined) return null;
  if (!isValidHistoricalSessionVolume(avgVolume20d)) return null;
  const ratio = currentSessionVolume / avgVolume20d;
  if (!Number.isFinite(ratio)) return null;
  const rounded = Math.round(ratio * 100) / 100;
  // A genuinely positive ratio must never be reported as 0 by rounding:
  // downstream persistence requires a positive rvol_20d whenever avg is set.
  if (rounded === 0 && ratio > 0) return Number(ratio.toPrecision(2));
  return rounded;
}

export interface SessionVolumeEntry {
  sessionDate: string;
  volume: number;
}

export function averageVolume20dFromSessions(
  sessions: readonly SessionVolumeEntry[],
  currentSessionDate: string,
): number | null {
  const prior = sessions
    .filter(
      (entry) =>
        entry.sessionDate < currentSessionDate &&
        isValidHistoricalSessionVolume(entry.volume),
    )
    .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate))
    .slice(0, RVOL_20D_SESSION_COUNT);

  if (prior.length !== RVOL_20D_SESSION_COUNT) return null;
  return averageFullDayVolume20d(prior.map((entry) => entry.volume));
}
