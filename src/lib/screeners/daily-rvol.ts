/**
 * Daily RVOL 20D — today's cumulative session volume divided by the average
 * full regular-session volume of the prior 20 valid trading sessions.
 * Not time-adjusted; current session is excluded from the historical average.
 */

export const RVOL_20D_SESSION_COUNT = 20;

export function isValidHistoricalSessionVolume(volume: number): boolean {
  return Number.isFinite(volume) && volume > 0;
}

export function isValidCurrentSessionVolume(volume: number): boolean {
  return Number.isFinite(volume) && volume >= 0;
}

/**
 * Requires exactly 20 valid prior-session volumes. Does not accept partial windows.
 */
export function averageFullDayVolume20d(historicalVolumes: readonly number[]): number | null {
  if (historicalVolumes.length !== RVOL_20D_SESSION_COUNT) return null;
  let sum = 0;
  for (const volume of historicalVolumes) {
    if (!isValidHistoricalSessionVolume(volume)) return null;
    sum += volume;
  }
  return sum / RVOL_20D_SESSION_COUNT;
}

/**
 * RVOL 20D = current cumulative session volume / avg prior 20 full-day volumes.
 * Never substitutes Vol/Prior or other ratios.
 */
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

/**
 * Build the prior-20 average from dated session volumes, excluding the current session date.
 * Sessions must be strictly prior to currentSessionDate (YYYY-MM-DD).
 */
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

export function formatDailyRvol20d(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Unavailable";
  return `${Number(value).toFixed(1)}×`;
}
