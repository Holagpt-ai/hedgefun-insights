import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  DEFAULT_SCANNER_EVENT_CONFIG,
  evaluateScannerEventQualification,
  qualifyHodMomentum,
  qualifyRunningUp,
  qualifyVolumeExplosion,
  type ScannerEventEvalInput,
} from "../../../../supabase/functions/_shared/radar-v22/scanner-events.ts";
import { createScannerEventBook } from "./scanner-event-book.ts";

function base(over: Partial<ScannerEventEvalInput> = {}): ScannerEventEvalInput {
  return {
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
    ...over,
  };
}

Deno.test("RUNNING_UP qualifies with momentum + participation", () => {
  assertEquals(qualifyRunningUp(base()), true);
});

Deno.test("RUNNING_UP rejects insufficient velocity", () => {
  assertEquals(qualifyRunningUp(base({ volumeVelocity: 5_000 })), false);
});

Deno.test("RUNNING_UP rejects high RVOL but falling price", () => {
  assertEquals(
    qualifyRunningUp(base({ move60sPct: -1, move60Complete: true, rvol5m: 9 })),
    false,
  );
});

Deno.test("RUNNING_UP null rvol requires acceleration path", () => {
  assertEquals(
    qualifyRunningUp(base({ rvol5m: null, volumeAccelerationPct: null })),
    false,
  );
});

Deno.test("HOD_MOMENTUM near HOD with volume confirmation", () => {
  assertEquals(qualifyHodMomentum(base({ distanceFromHodPct: 0.2 })), true);
});

Deno.test("HOD_MOMENTUM rejects far from HOD", () => {
  assertEquals(qualifyHodMomentum(base({ distanceFromHodPct: 5 })), false);
});

Deno.test("HOD_MOMENTUM rejects near HOD without participation", () => {
  assertEquals(
    qualifyHodMomentum(base({
      distanceFromHodPct: 0.1,
      rvol5m: 0.5,
      volumeAccelerationPct: 0,
    })),
    false,
  );
});

Deno.test("VOLUME_EXPLOSION high RVOL + acceleration", () => {
  assertEquals(
    qualifyVolumeExplosion(base({ rvol5m: 5, volumeAccelerationPct: 40 })),
    true,
  );
});

Deno.test("VOLUME_EXPLOSION high RVOL but weak velocity rejected", () => {
  assertEquals(
    qualifyVolumeExplosion(base({
      rvol5m: 5,
      volumeVelocity: 1_000,
      volumeAccelerationPct: null,
      volumeRatioPrior: null,
    })),
    false,
  );
});

Deno.test("VOLUME_EXPLOSION normal RVOL rejected", () => {
  assertEquals(
    qualifyVolumeExplosion(base({ rvol5m: 1.2, volumeAccelerationPct: 80 })),
    false,
  );
});

Deno.test("scanner event book lifecycle", () => {
  const book = createScannerEventBook({
    ...DEFAULT_SCANNER_EVENT_CONFIG,
    eventCooldownMs: 60_000,
  });
  const iso = (ms: number) => new Date(ms).toISOString();
  const input = base();
  const t0 = 1_000_000;
  const first = book.step("AAA", t0, input, iso);
  assertEquals(first.primary?.type, "HOD_MOMENTUM");
  assert(first.newlyActivated.some((e) => e.type === "HOD_MOMENTUM"));
  assertEquals(
    first.newlyActivated.every((e) => e.triggered_at === first.newlyActivated[0]?.triggered_at),
    true,
  );
  const t1 = t0 + 5_000;
  const second = book.step("AAA", t1, input, iso);
  assertEquals(second.primary?.triggered_at, first.primary?.triggered_at);
  assertEquals(second.newlyActivated.length, 0);
  const t2 = t1 + 5_000;
  const off = book.step("AAA", t2, base({ volumeVelocity: 100 }), iso);
  assertEquals(off.primary, null);
  const t3 = t2 + 61_000;
  const again = book.step("AAA", t3, input, iso);
  assertEquals(again.primary?.type, "HOD_MOMENTUM");
  assertEquals(again.primary?.triggered_at !== first.primary?.triggered_at, true);
});
