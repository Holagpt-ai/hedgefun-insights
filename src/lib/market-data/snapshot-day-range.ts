import { getEtParts, previousTradingDay, tradingSessionDateForInstant } from "@/lib/market-calendar";
import { polygonSnapshotFieldToMs } from "./polygon-snapshot-timestamps";

export type SnapshotDayRangeKind = "current_session" | "prior_session" | "unverified";

export interface SnapshotDayRangeView {
  kind: SnapshotDayRangeKind;
  high: number | null;
  low: number | null;
  /** ET session date attached to the day aggregate timestamp, when verified. */
  observationSessionDate: string | null;
}

function positive(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(n) || !(n > 0)) return null;
  return n;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * Classify snapshot day high/low for stats tables.
 * Requires a verifiable aggregate timestamp before labeling as the current session.
 */
export function classifySnapshotDayRange(snapshot: unknown, now = new Date()): SnapshotDayRangeView {
  const tick = asRecord(snapshot);
  const day = asRecord(tick?.day);
  const prevDay = asRecord(tick?.prevDay);

  const dayHigh = positive(day?.h);
  const dayLow = positive(day?.l);
  const prevHigh = positive(prevDay?.h);
  const prevLow = positive(prevDay?.l);

  const nowMs = now.getTime();
  const et = getEtParts(now);
  const expectedSessionDate = tradingSessionDateForInstant(et.date, et.minutes);
  const dayObsMs = polygonSnapshotFieldToMs(day?.t, "dayAggregate", nowMs);

  if (dayHigh !== null && dayLow !== null && dayObsMs !== null) {
    const observationSessionDate = getEtParts(new Date(dayObsMs)).date;
    if (observationSessionDate === expectedSessionDate) {
      return {
        kind: "current_session",
        high: dayHigh,
        low: dayLow,
        observationSessionDate,
      };
    }
    return {
      kind: "prior_session",
      high: dayHigh,
      low: dayLow,
      observationSessionDate,
    };
  }

  if (prevHigh !== null && prevLow !== null) {
    const prevObsMs = polygonSnapshotFieldToMs(prevDay?.t, "prevDayAggregate", nowMs);
    return {
      kind: prevObsMs !== null ? "prior_session" : "unverified",
      high: prevHigh,
      low: prevLow,
      observationSessionDate: prevObsMs !== null ? getEtParts(new Date(prevObsMs)).date : null,
    };
  }

  return { kind: "unverified", high: null, low: null, observationSessionDate: null };
}

/** Expected ET session date for price evidence at `now` (e.g. prior Friday on Monday pre-market). */
export function expectedTradingSessionDate(now = new Date()): string {
  const et = getEtParts(now);
  return tradingSessionDateForInstant(et.date, et.minutes);
}

export function priorTradingSessionDate(sessionDate: string): string {
  return previousTradingDay(sessionDate).date;
}
