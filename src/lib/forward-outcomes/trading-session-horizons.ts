import type { ForwardOutcomeAvailabilityState } from "@/config/forward-outcomes.config";
import { nextTradingDay } from "@/lib/market-calendar";

export function nthTradingSessionDateAfter(
  episodeSessionDate: string,
  tradingSessionsAfter: number,
): string {
  let cursor = episodeSessionDate;
  for (let i = 0; i < tradingSessionsAfter; i += 1) {
    cursor = nextTradingDay(cursor).date;
  }
  return cursor;
}

export function resolveHorizonSessionFromHistory(input: {
  episodeSessionDate: string;
  tradingSessionsAfter: number;
  sortedSessionDates: readonly string[];
  dailyByDate: ReadonlyMap<string, unknown>;
}): {
  availabilityState: ForwardOutcomeAvailabilityState;
  horizonSessionDate: string | null;
  horizonDaily: unknown | null;
} {
  const { episodeSessionDate, tradingSessionsAfter, sortedSessionDates, dailyByDate } = input;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(episodeSessionDate)) {
    return { availabilityState: "INVALID_EPISODE", horizonSessionDate: null, horizonDaily: null };
  }
  if (sortedSessionDates.length === 0) {
    return { availabilityState: "INSUFFICIENT_HISTORY", horizonSessionDate: null, horizonDaily: null };
  }

  const latestLoaded = sortedSessionDates[sortedSessionDates.length - 1]!;
  const expectedDate = nthTradingSessionDateAfter(episodeSessionDate, tradingSessionsAfter);
  const episodeIndex = sortedSessionDates.indexOf(episodeSessionDate);

  if (episodeIndex === -1) {
    return { availabilityState: "INVALID_EPISODE", horizonSessionDate: null, horizonDaily: null };
  }

  const forwardIndex = episodeIndex + tradingSessionsAfter;
  if (forwardIndex < sortedSessionDates.length) {
    const horizonSessionDate = sortedSessionDates[forwardIndex]!;
    return {
      availabilityState: "AVAILABLE",
      horizonSessionDate,
      horizonDaily: dailyByDate.get(horizonSessionDate) ?? null,
    };
  }

  if (expectedDate > latestLoaded) {
    return { availabilityState: "FUTURE_SESSION_NOT_LOADED", horizonSessionDate: expectedDate, horizonDaily: null };
  }

  if (expectedDate <= latestLoaded && !dailyByDate.has(expectedDate)) {
    return { availabilityState: "INSUFFICIENT_HISTORY", horizonSessionDate: expectedDate, horizonDaily: null };
  }

  return { availabilityState: "EPISODE_TOO_RECENT", horizonSessionDate: expectedDate, horizonDaily: null };
}
