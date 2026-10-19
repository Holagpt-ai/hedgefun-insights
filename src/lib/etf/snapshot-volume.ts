import {
  getEtParts,
  isTradingDay,
  resolveMarketClock,
  tradingSessionDateForInstant,
} from "@/lib/market-calendar";
import { polygonSnapshotFieldToMs } from "@/lib/market-data/polygon-snapshot-timestamps";

export type SnapshotDayVolumeKind = "current_session" | "prior_session" | "unverified";

export interface SnapshotDayVolumeView {
  kind: SnapshotDayVolumeKind;
  volume: number;
  observationSessionDate: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function positiveVolume(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(n) || !(n > 0)) return null;
  return n;
}

/** Polygon daily aggregate bar-start dates use the UTC calendar date (Batch 19 day-bar contract). */
export function dailyAggregateBarDate(dayObsMs: number): string {
  return new Date(dayObsMs).toISOString().slice(0, 10);
}

function isLiveEquitySession(now: Date): boolean {
  const et = getEtParts(now);
  if (!isTradingDay(et.date, et.weekday)) return false;
  return resolveMarketClock(now).sessionId !== "closed";
}

/** Classify snapshot day volume before labeling it current-session participation. */
export function classifySnapshotDayVolume(snapshot: unknown, now = new Date()): SnapshotDayVolumeView | null {
  const day = asRecord(asRecord(snapshot)?.day);
  const volume = positiveVolume(day?.v);
  if (volume === null) return null;

  const nowMs = now.getTime();
  const et = getEtParts(now);
  const referenceSessionDate = tradingSessionDateForInstant(et.date, et.minutes);
  const dayObsMs = polygonSnapshotFieldToMs(day?.t, "dayAggregate", nowMs);

  if (dayObsMs !== null) {
    const observationSessionDate = dailyAggregateBarDate(dayObsMs);
    if (isLiveEquitySession(now) && observationSessionDate === referenceSessionDate) {
      return { kind: "current_session", volume, observationSessionDate };
    }
    return { kind: "prior_session", volume, observationSessionDate };
  }

  return { kind: "unverified", volume, observationSessionDate: null };
}
