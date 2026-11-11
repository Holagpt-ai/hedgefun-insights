import {
  PENNY_HOD_SIGNAL_MAX_PCT,
  PENNY_INVALIDATION_SESSION_HIGH_DROP_PCT,
  PENNY_MAX_SPREAD_PCT,
  PENNY_REACCEL_MIN_PCT,
} from "../config/penny-continuation.config.ts";
import type { ContinuationTriState } from "./continuation-types.ts";
import { isFiniteNumber } from "./screener-contract-lite.ts";
import type {
  PennyContinuationInput,
  PennyCoreSignalState,
  PennyCoreSignals,
  PennyReasonCode,
} from "./penny-continuation-types.ts";

function tri(value: ContinuationTriState | null | undefined): ContinuationTriState {
  return value ?? "UNKNOWN";
}

export function evaluatePennyCoreSignalCS1(
  velocityWindowTiers: PennyContinuationInput["velocityWindowTiers"],
): PennyCoreSignalState {
  if (!velocityWindowTiers || velocityWindowTiers.length < 3) return "UNKNOWN";
  const windows = velocityWindowTiers.slice(-3);
  const latest = windows[windows.length - 1];
  if (latest === "NONE") return "FAIL";
  const strongModerate = windows.filter((w) => w === "STRONG" || w === "MODERATE").length;
  if (strongModerate >= 2) return "PASS";
  return "FAIL";
}

export function evaluatePennyCoreSignalCS2(input: PennyContinuationInput): PennyCoreSignalState {
  if (input.vwap === null) return "UNKNOWN";
  const above = tri(input.aboveVwap);
  const reclaim = tri(input.holdingVwapAfterReclaim);
  if (above === "TRUE" || reclaim === "TRUE") return "PASS";
  if (above === "FALSE" && reclaim === "FALSE") return "FAIL";
  return "UNKNOWN";
}

export function evaluatePennyCoreSignalCS3(
  distanceFromHodPct: number | null,
): PennyCoreSignalState {
  if (!isFiniteNumber(distanceFromHodPct)) return "UNKNOWN";
  if (distanceFromHodPct <= PENNY_HOD_SIGNAL_MAX_PCT) return "PASS";
  return "FAIL";
}

export function evaluatePennyCoreSignalCS4(input: PennyContinuationInput): PennyCoreSignalState {
  const radar = tri(input.radarHasReAcceleration);
  if (radar === "TRUE") return "PASS";
  if (isFiniteNumber(input.volumeAccelerationPct)) {
    if (input.volumeAccelerationPct >= PENNY_REACCEL_MIN_PCT) return "PASS";
    if (radar === "FALSE") return "FAIL";
  }
  if (radar === "FALSE" && !isFiniteNumber(input.volumeAccelerationPct)) return "FAIL";
  return "UNKNOWN";
}

export function evaluatePennyCoreSignalCS5(
  radarHasSecondLeg: ContinuationTriState | null,
): PennyCoreSignalState {
  const state = tri(radarHasSecondLeg);
  if (state === "TRUE") return "PASS";
  if (state === "FALSE") return "FAIL";
  return "UNKNOWN";
}

export function evaluatePennyCoreSignals(input: PennyContinuationInput): PennyCoreSignals {
  return {
    cs1: evaluatePennyCoreSignalCS1(input.velocityWindowTiers),
    cs2: evaluatePennyCoreSignalCS2(input),
    cs3: evaluatePennyCoreSignalCS3(input.distanceFromHodPct),
    cs4: evaluatePennyCoreSignalCS4(input),
    cs5: evaluatePennyCoreSignalCS5(input.radarHasSecondLeg),
  };
}

export function countCorePasses(signals: PennyCoreSignals): number {
  return (["cs1", "cs2", "cs3", "cs4", "cs5"] as const).filter(
    (k) => signals[k] === "PASS",
  ).length;
}

export function pennyContinuationInvalidators(input: PennyContinuationInput): PennyReasonCode[] {
  const invalidators: PennyReasonCode[] = [];
  if (isFiniteNumber(input.spreadPct) && input.spreadPct > PENNY_MAX_SPREAD_PCT) {
    invalidators.push("SPREAD_WIDE");
  }
  if (tri(input.catalystInvalidated) === "TRUE") {
    invalidators.push("CATALYST_INVALIDATED");
  }
  const cs2 = evaluatePennyCoreSignalCS2(input);
  if (cs2 === "FAIL" && tri(input.lateSessionBroken) === "TRUE") {
    invalidators.push("CONTINUATION_INVALIDATED");
  }
  if (
    isFiniteNumber(input.priceVsSessionHighDropPct) &&
    input.priceVsSessionHighDropPct >= PENNY_INVALIDATION_SESSION_HIGH_DROP_PCT &&
    tri(input.lateSessionBroken) === "TRUE"
  ) {
    invalidators.push("CONTINUATION_INVALIDATED");
  }
  return invalidators;
}
