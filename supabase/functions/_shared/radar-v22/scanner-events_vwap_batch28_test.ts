import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  qualifyVwapBreakdown,
  qualifyVwapHold,
  qualifyVwapRejection,
  qualifyVwapReclaim,
} from "./scanner-events.ts";

const T0 = 1_700_000_000_000;

function base(overrides: Record<string, unknown> = {}) {
  return {
    eventNowMs: T0,
    lastPrice: 10,
    move15sPct: 0.2,
    move60sPct: -0.2,
    move15Complete: true,
    move60Complete: true,
    volumeVelocity: 50_000,
    rvol5m: 2,
    volumeAccelerationPct: 20,
    distanceFromHodPct: 2,
    sessionVolume: 500_000,
    volumeRatioPrior: 1.5,
    vol60s: 60_000,
    vwapSide: "below" as const,
    lastHodBreakMs: null,
    lastVwapReclaimMs: T0 - 60_000,
    lastVwapLossMs: T0 - 5_000,
    vwapPartial: false,
    previousClose: 9,
    sessionOpen: 9.5,
    gapPercent: 1,
    ...overrides,
  };
}

Deno.test("VWAP reclaim suppressed when vwapPartial", () => {
  assertEquals(
    qualifyVwapReclaim(base({ vwapSide: "above", vwapPartial: true, lastVwapReclaimMs: T0 - 1_000 })),
    false,
  );
});

Deno.test("VWAP rejection requires reclaim then loss sequence", () => {
  assertEquals(qualifyVwapRejection(base()), true);
  assertEquals(qualifyVwapRejection(base({ lastVwapReclaimMs: null })), false);
});

Deno.test("VWAP hold requires sustained time above after reclaim", () => {
  assertEquals(
    qualifyVwapHold(base({ vwapSide: "above", lastVwapReclaimMs: T0 - 200_000, lastVwapLossMs: null })),
    true,
  );
});

Deno.test("VWAP breakdown requires loss plus negative 60s move", () => {
  assertEquals(qualifyVwapBreakdown(base()), true);
  assertEquals(qualifyVwapBreakdown(base({ move60sPct: 0.1 })), false);
});
