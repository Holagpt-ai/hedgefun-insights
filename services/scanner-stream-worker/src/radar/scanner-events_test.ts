import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  DEFAULT_SCANNER_EVENT_CONFIG,
  qualifyGapContinuation,
  qualifyHodBreak,
  qualifyHodMomentum,
  qualifyLateDayAcceleration,
  qualifyRunningUp,
  qualifyVolumeExplosion,
  qualifyVwapLoss,
  qualifyVwapReclaim,
  type ScannerEventEvalInput,
} from "../../../../supabase/functions/_shared/radar-v22/scanner-events.ts";
import { createScannerEventBook } from "./scanner-event-book.ts";

const T0 = 1_704_000_000_000; // 2024-01-01 15:30 ET approx — adjust for late day tests

function base(over: Partial<ScannerEventEvalInput> = {}): ScannerEventEvalInput {
  return {
    eventNowMs: T0,
    lastPrice: 5,
    move15sPct: 0.5,
    move60sPct: 0.8,
    move15Complete: true,
    move60Complete: true,
    volumeVelocity: 50_000,
    rvol5m: 2,
    volumeAccelerationPct: 30,
    distanceFromHodPct: 0.5,
    sessionVolume: 500_000,
    volumeRatioPrior: 3,
    vol60s: 80_000,
    vwapSide: "above",
    lastHodBreakMs: null,
    lastVwapReclaimMs: null,
    lastVwapLossMs: null,
    previousClose: 4.5,
    sessionOpen: 5.2,
    gapPercent: 15.5,
    ...over,
  };
}

Deno.test("RUNNING_UP qualifies with momentum + participation", () => {
  assertEquals(qualifyRunningUp(base()), true);
});

Deno.test("RUNNING_UP rejects insufficient velocity", () => {
  assertEquals(qualifyRunningUp(base({ volumeVelocity: 5_000 })), false);
});

Deno.test("HOD_MOMENTUM near HOD with volume confirmation", () => {
  assertEquals(qualifyHodMomentum(base({ distanceFromHodPct: 0.2 })), true);
});

Deno.test("HOD_BREAK requires recent HOD break pulse", () => {
  assertEquals(qualifyHodBreak(base()), false);
  assertEquals(
    qualifyHodBreak(base({
      lastHodBreakMs: T0 - 5_000,
      distanceFromHodPct: 0.1,
    })),
    true,
  );
});

Deno.test("VWAP_RECLAIM requires reclaim pulse and above VWAP", () => {
  assertEquals(qualifyVwapReclaim(base()), false);
  assertEquals(
    qualifyVwapReclaim(base({ lastVwapReclaimMs: T0 - 3_000, vwapSide: "above" })),
    true,
  );
});

Deno.test("VWAP_LOSS requires loss pulse and below VWAP", () => {
  assertEquals(
    qualifyVwapLoss(base({ lastVwapLossMs: T0 - 3_000, vwapSide: "below" })),
    true,
  );
});

Deno.test("GAP_CONTINUATION positive gap with participation", () => {
  assertEquals(qualifyGapContinuation(base({ gapPercent: 5 })), true);
  assertEquals(qualifyGapContinuation(base({ gapPercent: 0.5 })), false);
});

Deno.test("LATE_DAY_ACCELERATION only in power hour window", () => {
  const lateMs = Date.parse("2026-09-23T19:30:00.000Z"); // ~3:30 PM ET
  assertEquals(
    qualifyLateDayAcceleration(base({ eventNowMs: lateMs })),
    true,
  );
  assertEquals(
    qualifyLateDayAcceleration(base({ eventNowMs: T0 })),
    false,
  );
});

Deno.test("VOLUME_EXPLOSION high RVOL + acceleration", () => {
  assertEquals(
    qualifyVolumeExplosion(base({ rvol5m: 5, volumeAccelerationPct: 40 })),
    true,
  );
});

Deno.test("scanner event book lifecycle", () => {
  const book = createScannerEventBook({
    ...DEFAULT_SCANNER_EVENT_CONFIG,
    eventCooldownMs: 60_000,
  });
  const iso = (ms: number) => new Date(ms).toISOString();
  const input = base({ distanceFromHodPct: 0.2 });
  const t0 = 1_000_000;
  const first = book.step("AAA", t0, { ...input, eventNowMs: t0 }, iso);
  assertEquals(first.primary?.type, "HOD_MOMENTUM");
  assert(first.newlyActivated.some((e) => e.type === "HOD_MOMENTUM"));
  const t1 = t0 + 5_000;
  const second = book.step("AAA", t1, { ...input, eventNowMs: t1 }, iso);
  assertEquals(second.primary?.triggered_at, first.primary?.triggered_at);
  assertEquals(second.newlyActivated.length, 0);
  const t2 = t1 + 5_000;
  const off = book.step("AAA", t2, base({ eventNowMs: t2, volumeVelocity: 100 }), iso);
  assertEquals(off.primary, null);
  const t3 = t2 + 61_000;
  const again = book.step("AAA", t3, { ...input, eventNowMs: t3 }, iso);
  assertEquals(again.primary?.type, "HOD_MOMENTUM");
  assertEquals(again.primary?.triggered_at !== first.primary?.triggered_at, true);
});

Deno.test("HOD_BREAK wins primary when break pulse active", () => {
  const book = createScannerEventBook(DEFAULT_SCANNER_EVENT_CONFIG);
  const iso = (ms: number) => new Date(ms).toISOString();
  const t0 = 2_000_000;
  const snap = book.step(
    "BBB",
    t0,
    base({
      eventNowMs: t0,
      lastHodBreakMs: t0 - 2_000,
      distanceFromHodPct: 0.05,
    }),
    iso,
  );
  assertEquals(snap.primary?.type, "HOD_BREAK");
});
