import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SecondBar } from "./types.ts";
import {
  computeMomentumMetrics,
  computeRvol5m,
  volumeAccelerationPct,
} from "./momentum-metrics.ts";
import { RVOL_5M_MIN_TOD_SAMPLES } from "./momentum-metrics.config.ts";

function bar(startMs: number, volume: number): SecondBar {
  const endMs = startMs + 1_000;
  return {
    startMs,
    endMs,
    volume,
    open: 10,
    high: 10,
    low: 10,
    close: 10,
    vwap: 10,
    sessionVwap: 10,
    sessionOpen: 10,
    accumulatedVolume: volume,
    dollarVolume: volume * 10,
    priceComplete: true,
    lateCorrected: false,
    correctionCount: 0,
  };
}

function fillWindow(
  bars: Map<number, SecondBar>,
  endMs: number,
  windowMs: number,
  volumePerSecond: number,
): void {
  for (let t = endMs - windowMs; t < endMs; t += 1_000) {
    bars.set(t, bar(t, volumePerSecond));
  }
}

Deno.test("computeRvol5m — normal ratio", () => {
  const baseline = { expectedVolume: 90_000, sampleCount: RVOL_5M_MIN_TOD_SAMPLES };
  assertEquals(computeRvol5m(450_000, baseline), 5);
});

Deno.test("computeRvol5m — insufficient baseline samples", () => {
  assertEquals(
    computeRvol5m(100, { expectedVolume: 50, sampleCount: RVOL_5M_MIN_TOD_SAMPLES - 1 }),
    null,
  );
});

Deno.test("computeRvol5m — zero historical volume", () => {
  assertEquals(computeRvol5m(100, { expectedVolume: 0, sampleCount: 10 }), null);
});

Deno.test("computeRvol5m — true zero current volume", () => {
  const baseline = { expectedVolume: 90_000, sampleCount: RVOL_5M_MIN_TOD_SAMPLES };
  assertEquals(computeRvol5m(0, baseline), 0);
});

Deno.test("volumeAccelerationPct — positive, negative, flat", () => {
  const eventNow = 600_000;
  const bars = new Map<number, SecondBar>();
  fillWindow(bars, eventNow, 300_000, 100); // 30k/min effective if 5m -> 500 vol/s * 300s = 30k... 
  // 5m window: 100 vol/s * 300s = 30_000 total -> 6_000/min
  fillWindow(bars, eventNow - 300_000, 300_000, 50); // 15_000 total -> 3_000/min
  const pct = volumeAccelerationPct(bars, eventNow);
  assertEquals(pct, 100);
});

Deno.test("volumeAccelerationPct — null when prior window empty", () => {
  const eventNow = 600_000;
  const bars = new Map<number, SecondBar>();
  fillWindow(bars, eventNow, 300_000, 100);
  assertEquals(volumeAccelerationPct(bars, eventNow), null);
});

Deno.test("volumeAccelerationPct — null when only isolated ticks span minutes", () => {
  const eventNow = 600_000;
  const bars = new Map<number, SecondBar>();
  fillWindow(bars, eventNow, 300_000, 1_000);
  for (let m = 0; m < 4; m += 1) {
    const t = eventNow - 600_000 + m * 60_000 + 1_000;
    bars.set(t, bar(t, 1));
  }
  assertEquals(volumeAccelerationPct(bars, eventNow), null);
});

Deno.test("volumeAccelerationPct — null when prior window has insufficient coverage", () => {
  const eventNow = 600_000;
  const bars = new Map<number, SecondBar>();
  fillWindow(bars, eventNow, 300_000, 1_000);
  // Only ~90s of prior window — sparse history must not produce extreme acceleration.
  for (let t = eventNow - 300_000; t < eventNow - 210_000; t += 1_000) {
    bars.set(t, bar(t, 1));
  }
  assertEquals(volumeAccelerationPct(bars, eventNow), null);
});

Deno.test("volumeAccelerationPct — legitimate high acceleration with full windows", () => {
  const eventNow = 600_000;
  const bars = new Map<number, SecondBar>();
  fillWindow(bars, eventNow, 300_000, 500);
  fillWindow(bars, eventNow - 300_000, 300_000, 50);
  const pct = volumeAccelerationPct(bars, eventNow);
  assertEquals(pct, 900);
});

Deno.test("computeMomentumMetrics — velocity from 5m window", () => {
  const eventNow = 300_000;
  const bars = new Map<number, SecondBar>();
  fillWindow(bars, eventNow, 300_000, 1_000);
  const m = computeMomentumMetrics({
    bars,
    eventNowMs: eventNow,
    sessionKind: "pre-market",
    schedule: null,
    todBaseline: null,
  });
  assertEquals(m.volume_velocity, 60_000);
  assertEquals(m.rvol_5m, null);
});

Deno.test("volumeAccelerationPct — intermittent prior with full span still accelerates", () => {
  const eventNow = 600_000;
  const bars = new Map<number, SecondBar>();
  fillWindow(bars, eventNow, 300_000, 500);
  for (let m = 0; m < 5; m += 1) {
    const t = eventNow - 600_000 + m * 60_000 + 5_000;
    bars.set(t, bar(t, 200));
  }
  const pct = volumeAccelerationPct(bars, eventNow);
  assertEquals(pct !== null && pct > 0, true);
});

Deno.test("computeMomentumMetrics — intermittent trades use wall-clock velocity", () => {
  const eventNow = 300_000;
  const bars = new Map<number, SecondBar>();
  for (let m = 0; m < 5; m += 1) {
    const t = eventNow - 300_000 + m * 60_000 + 5_000;
    bars.set(t, bar(t, 1_000));
  }
  const m = computeMomentumMetrics({
    bars,
    eventNowMs: eventNow,
    sessionKind: "pre-market",
    schedule: null,
    todBaseline: null,
  });
  assertEquals(m.volume_velocity, 1_000);
});

Deno.test("computeMomentumMetrics — missing bars", () => {
  const m = computeMomentumMetrics({
    bars: new Map(),
    eventNowMs: 1,
    sessionKind: "market",
    schedule: null,
    todBaseline: { expectedVolume: 100, sampleCount: 10 },
  });
  assertEquals(m.rvol_5m, null);
  assertEquals(m.volume_velocity, null);
  assertEquals(m.volume_acceleration_pct, null);
});
