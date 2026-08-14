import type { SecondBar } from "./types.ts";

const WINDOW_60S = 60_000;
const BUCKET_60S = 60_000;
const PRECEDING_BUCKETS = 4;

/**
 * Event-time rolling window. Missing seconds contribute 0 volume.
 * Does not fabricate OHLC for absent seconds.
 */
export function rollingVolume(
  bars: Map<number, SecondBar>,
  eventNowMs: number,
  windowMs: number,
  field: "volume" | "dollarVolume" = "volume",
): { total: number; lateCorrection: boolean } {
  const from = eventNowMs - windowMs;
  let total = 0;
  let lateCorrection = false;
  for (const bar of bars.values()) {
    if (bar.startMs >= from && bar.startMs < eventNowMs) {
      total += bar[field];
      if (bar.lateCorrected) lateCorrection = true;
    }
  }
  return { total, lateCorrection };
}

/**
 * 5-minute acceleration vs the four preceding completed 60s buckets.
 * Returns null when bucket boundaries are missing (no fabricated history).
 */
export function acceleration5m(
  bars: Map<number, SecondBar>,
  eventNowMs: number,
): number | null {
  const current = rollingVolume(bars, eventNowMs, WINDOW_60S, "volume").total;
  const bucketEnds = [
    eventNowMs - 4 * BUCKET_60S,
    eventNowMs - 3 * BUCKET_60S,
    eventNowMs - 2 * BUCKET_60S,
    eventNowMs - BUCKET_60S,
  ];
  const buckets: number[] = [];
  for (const end of bucketEnds) {
    const start = end - BUCKET_60S;
    let hasStart = false;
    let hasEnd = false;
    let total = 0;
    for (const bar of bars.values()) {
      if (bar.startMs >= start && bar.startMs < end) {
        total += bar.volume;
      }
      if (bar.endMs === start) hasStart = true;
      if (bar.endMs === end) hasEnd = true;
    }
    if (!hasStart || !hasEnd) return null;
    buckets.push(total);
  }
  const avg = buckets.reduce((sum, v) => sum + v, 0) / PRECEDING_BUCKETS;
  if (!(avg > 0) || !Number.isFinite(avg)) return null;
  const ratio = current / avg;
  return Number.isFinite(ratio) ? ratio : null;
}

export function pruneWindow(
  bars: Map<number, SecondBar>,
  eventNowMs: number,
  retentionMs: number,
): boolean {
  const cutoff = eventNowMs - retentionMs;
  let removed = false;
  for (const startMs of bars.keys()) {
    if (startMs < cutoff) {
      bars.delete(startMs);
      removed = true;
    }
  }
  return removed;
}
