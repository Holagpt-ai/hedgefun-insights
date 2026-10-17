/** Reject provider timestamps more than 5 minutes ahead of wall clock. */
export const PROVIDER_FUTURE_SKEW_MS = 5 * 60_000;

/**
 * Polygon snapshot field timestamp units (client-side, documented provider contract).
 * - lastTrade.t: nanoseconds since Unix epoch
 * - min.t / day.t / prevDay.t: aggregate bar start in milliseconds
 * - updated: provider metadata refresh in nanoseconds (not a trade print)
 */
export type PolygonSnapshotTimestampField =
  | "lastTrade"
  | "minAggregate"
  | "dayAggregate"
  | "prevDayAggregate"
  | "providerUpdated";

function readNumericTimestamp(raw: unknown): number | null {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : null;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.length > 22 || !/^\d+$/.test(trimmed)) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toMilliseconds(n: number, field: PolygonSnapshotTimestampField): number | null {
  if (!(n > 0)) return null;

  if (field === "lastTrade" || field === "providerUpdated") {
    // Nanoseconds dominate Polygon last-trade payloads; accept legacy millisecond values.
    if (n >= 1e14) return Math.trunc(n / 1_000_000);
    if (n >= 1e11) return Math.trunc(n);
    return null;
  }

  // Aggregate bar `t` is published in milliseconds; tolerate accidental nanosecond scale.
  if (n >= 1e14) return Math.trunc(n / 1_000_000);
  return Math.trunc(n);
}

export function polygonSnapshotFieldToMs(
  raw: unknown,
  field: PolygonSnapshotTimestampField,
  nowMs: number = Date.now(),
): number | null {
  if (!Number.isFinite(nowMs)) return null;
  const numeric = readNumericTimestamp(raw);
  if (numeric === null) return null;
  const ms = toMilliseconds(numeric, field);
  if (ms === null || !(ms > 0) || !Number.isFinite(ms)) return null;
  if (ms > nowMs + PROVIDER_FUTURE_SKEW_MS) return null;
  return ms;
}
