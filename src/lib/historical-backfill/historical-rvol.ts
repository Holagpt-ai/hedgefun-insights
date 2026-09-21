/**
 * Historical daily RVOL for candidate detection only.
 * The current session is excluded. This does not touch screener RVOL.
 */

export interface HistoricalVolumeSession {
  sessionDate: string;
  volume: number | null;
}

export function historicalDailyRvol(
  sessions: readonly HistoricalVolumeSession[],
  sessionDate: string,
  currentVolume: number | null,
  minSessions: number,
): number | null {
  if (currentVolume === null || !Number.isFinite(currentVolume) || currentVolume < 0) return null;
  if (!Number.isInteger(minSessions) || minSessions < 1) return null;
  const prior = sessions
    .filter((session) => session.sessionDate < sessionDate && session.volume !== null && Number.isFinite(session.volume) && session.volume >= 0)
    .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate));
  if (prior.length < minSessions) return null;
  const window = prior.slice(prior.length - minSessions);
  const average = window.reduce((sum, session) => sum + (session.volume ?? 0), 0) / minSessions;
  if (!Number.isFinite(average) || average <= 0) return null;
  return currentVolume / average;
}

function validVolume(volume: number | null): volume is number {
  return volume !== null && Number.isFinite(volume) && volume >= 0;
}

/**
 * Prior-20 RVOL with a bounded window. The sum walks only that window, in the
 * same order as historicalDailyRvol, so the quotient stays identical.
 */
export function createRollingDailyRvol(minSessions: number): {
  observe: (volume: number | null) => number | null;
  remember: (volume: number | null) => void;
} {
  const window: number[] = [];
  const remember = (volume: number | null): void => {
    if (!validVolume(volume)) return;
    window.push(volume);
    if (window.length > minSessions) window.shift();
  };
  return {
    remember,
    observe(volume: number | null): number | null {
      let rvol: number | null = null;
      if (validVolume(volume) && Number.isInteger(minSessions) && minSessions >= 1 && window.length >= minSessions) {
        let sum = 0;
        const start = window.length - minSessions;
        for (let index = start; index < window.length; index += 1) sum += window[index];
        const average = sum / minSessions;
        if (Number.isFinite(average) && average > 0) rvol = volume / average;
      }
      remember(volume);
      return rvol;
    },
  };
}
