/**
 * Bar-derived pre-market volume.
 * Reference cumulative volume is the sum of minute bars in
 * [04:00 ET, min(capture, 09:30 ET)). Prior-day and post-open bars are dropped.
 */

import { finiteNumber, finitePositive } from "./numbers";
import type { MinuteBar, PremarketWindow, SnapshotTicker, VolumeComparison } from "./types";

export function parseMinuteBar(raw: unknown): MinuteBar | null {
  if (raw === null || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const t = finitePositive(row.t);
  const v = finiteNumber(row.v);
  if (t === null || v === null || !(v >= 0)) return null;
  return {
    t,
    v,
    c: finitePositive(row.c),
    h: finitePositive(row.h),
    vw: finitePositive(row.vw),
  };
}

export function inPremarketBarWindow(
  barT: number,
  windowStartMs: number,
  windowEndExclusiveMs: number,
  captureMs: number,
): boolean {
  if (!Number.isFinite(barT)) return false;
  if (barT < windowStartMs) return false;
  if (barT >= windowEndExclusiveMs) return false;
  if (barT >= captureMs) return false;
  return true;
}

export function filterPremarketBars(
  bars: readonly MinuteBar[],
  window: Pick<PremarketWindow, "windowStartMs" | "windowEndExclusiveMs" | "captureMs">,
): MinuteBar[] {
  return bars.filter((b) =>
    inPremarketBarWindow(b.t, window.windowStartMs, window.windowEndExclusiveMs, window.captureMs),
  );
}

export function cumulativeShares(bars: readonly MinuteBar[]): number {
  let sum = 0;
  for (const b of bars) sum += b.v;
  return sum;
}

export function cumulativeDollarVolume(bars: readonly MinuteBar[]): number | null {
  let sum = 0;
  let any = false;
  for (const b of bars) {
    const px = b.vw ?? b.c;
    if (px === null) continue;
    sum += b.v * px;
    any = true;
  }
  return any ? sum : null;
}

export function windowHigh(bars: readonly MinuteBar[]): number | null {
  let high: number | null = null;
  for (const b of bars) {
    const h = b.h ?? b.c;
    if (h === null) continue;
    if (high === null || h > high) high = h;
  }
  return high;
}

export function volumeInLookback(
  bars: readonly MinuteBar[],
  captureMs: number,
  lookbackMs: number,
): number {
  const start = captureMs - lookbackMs;
  let sum = 0;
  for (const b of bars) {
    if (b.t >= start && b.t < captureMs) sum += b.v;
  }
  return sum;
}

export function volumeWindows(
  bars: readonly MinuteBar[],
  captureMs: number,
): { vol5: number; vol15: number; vol30: number; vol60: number; accel15: number | null } {
  const vol5 = volumeInLookback(bars, captureMs, 5 * 60_000);
  const vol15 = volumeInLookback(bars, captureMs, 15 * 60_000);
  const vol30 = volumeInLookback(bars, captureMs, 30 * 60_000);
  const vol60 = volumeInLookback(bars, captureMs, 60 * 60_000);
  const prior15 = vol30 - vol15;
  const accel15 = prior15 > 0 ? vol15 / prior15 : null;
  return { vol5, vol15, vol30, vol60, accel15 };
}

export function dayVolume(t: SnapshotTicker): number | null {
  return finiteNumber(t.day?.v);
}

export function priorDayVolume(t: SnapshotTicker): number | null {
  return finitePositive(t.prevDay?.v);
}

export function priorSessionRatio(t: SnapshotTicker): number | null {
  const day = dayVolume(t);
  const prior = priorDayVolume(t);
  if (day === null || !(day > 0) || prior === null) return null;
  const ratio = day / prior;
  return Number.isFinite(ratio) && ratio > 0 ? ratio : null;
}

export function compareVolumeAtCapture(
  t: SnapshotTicker,
  premarketBars: readonly MinuteBar[],
  captureMs: number,
): VolumeComparison {
  const hasBars = premarketBars.length > 0;
  const { vol5, vol15, vol30, vol60, accel15 } = volumeWindows(premarketBars, captureMs);
  const barCumulative = hasBars ? cumulativeShares(premarketBars) : null;
  const dayV = dayVolume(t);
  return {
    dayV,
    prevDayV: priorDayVolume(t),
    priorSessionRatio: priorSessionRatio(t),
    minuteV: finiteNumber(t.min?.v),
    minuteAv: finiteNumber(t.min?.av),
    barCumulative,
    barDollarVolume: hasBars ? cumulativeDollarVolume(premarketBars) : null,
    vol5: hasBars ? vol5 : null,
    vol15: hasBars ? vol15 : null,
    vol30: hasBars ? vol30 : null,
    vol60: hasBars ? vol60 : null,
    recentShare15:
      barCumulative !== null && barCumulative > 0 && hasBars ? vol15 / barCumulative : null,
    accel15: hasBars ? accel15 : null,
    dayVOverBar: dayV !== null && barCumulative !== null && barCumulative > 0 ? dayV / barCumulative : null,
  };
}

export function snapshotVolumeScore(t: SnapshotTicker): number {
  return Math.max(dayVolume(t) ?? 0, finiteNumber(t.min?.av) ?? 0, finiteNumber(t.min?.v) ?? 0);
}
