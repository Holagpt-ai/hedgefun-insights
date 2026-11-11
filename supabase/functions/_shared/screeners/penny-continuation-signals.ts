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
  PennyVelocityWindowTier,
} from "./penny-continuation-types.ts";

const VELOCITY_TIERS = new Set<PennyVelocityWindowTier>(["STRONG", "MODERATE", "WEAK", "NONE"]);

function tri(value: ContinuationTriState | null | undefined): ContinuationTriState {
  return value ?? "UNKNOWN";
}

function isValidTier(tier: string): tier is PennyVelocityWindowTier {
  return VELOCITY_TIERS.has(tier as PennyVelocityWindowTier);
}

export function evaluatePennyCoreSignalCS1(input: PennyContinuationInput): PennyCoreSignalState {
  const windows = input.velocityWindows;
  if (!windows || windows.length < 3) {
    return "UNKNOWN";
  }

  const lastThree = windows.slice(-3);
  if (lastThree.length !== 3) return "UNKNOWN";

  const evaluationClockMs = input.freshness.evaluationClockMs;
  const seenEnds = new Set<number>();

  for (const w of lastThree) {
    if (!isValidTier(w.tier) || w.sessionDate !== input.sessionDate) return "UNKNOWN";
    if (!Number.isFinite(w.windowEndMs)) return "UNKNOWN";
    if (w.completed === false) return "UNKNOWN";
    if (w.windowEndMs > evaluationClockMs) return "UNKNOWN";
    if (seenEnds.has(w.windowEndMs)) return "UNKNOWN";
    seenEnds.add(w.windowEndMs);
  }

  for (let i = 1; i < lastThree.length; i++) {
    if (lastThree[i].windowEndMs <= lastThree[i - 1].windowEndMs) return "UNKNOWN";
  }

  const latest = lastThree[2].tier;
  if (latest === "NONE") return "FAIL";
  const strongModerate = lastThree.filter((w) => w.tier === "STRONG" || w.tier === "MODERATE").length;
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
  if (distanceFromHodPct < 0) return "FAIL";
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
    cs1: evaluatePennyCoreSignalCS1(input),
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
