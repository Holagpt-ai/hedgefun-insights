import type { RadarV22Config } from "./config.ts";
import type { RadarV22Lifecycle } from "../../../../supabase/functions/_shared/radar-v22/types.ts";
import { RADAR_V22_BOARD_LIFECYCLES } from "../../../../supabase/functions/_shared/radar-v22/types.ts";
import type { RadarV22BoardLifecycle } from "../../../../supabase/functions/_shared/radar-v22/types.ts";
import type { LifecycleRecord, SymbolMetrics } from "./types.ts";

export function emptyLifecycle(sessionDate: string): LifecycleRecord {
  return {
    phase: "WATCHING",
    consecutiveDetect: 0,
    consecutiveActive: 0,
    consecutiveActiveFail: 0,
    consecutiveLowActivity: 0,
    coolingEnteredAtMs: null,
    peakVol15WhileActive: 0,
    sessionDate,
  };
}

export function isBoardLifecycle(
  phase: RadarV22Lifecycle,
): phase is RadarV22BoardLifecycle {
  return (RADAR_V22_BOARD_LIFECYCLES as readonly string[]).includes(phase);
}

function isLivePhase(phase: RadarV22Lifecycle): boolean {
  return phase === "DETECTED" || phase === "CONFIRMING" || phase === "ACTIVE" ||
    phase === "REACTIVATED" || phase === "COOLING";
}

export type LifecycleStep = {
  record: LifecycleRecord;
  archived: boolean;
};

export function stepLifecycle(
  prev: LifecycleRecord,
  input: {
    sessionDate: string;
    eventNowMs: number;
    wallNowMs: number;
    detect: boolean;
    active: boolean;
    metrics: SymbolMetrics;
    lateBlocksNewSignal: boolean;
    config: RadarV22Config;
  },
): LifecycleStep {
  if (prev.sessionDate !== input.sessionDate) {
    return { record: emptyLifecycle(input.sessionDate), archived: false };
  }

  const next: LifecycleRecord = { ...prev };
  const detect = input.lateBlocksNewSignal && !isLivePhase(prev.phase)
    ? false
    : input.detect;
  const activeForPromotion = input.lateBlocksNewSignal &&
      (prev.phase === "WATCHING" || prev.phase === "DETECTED" ||
        prev.phase === "CONFIRMING" || prev.phase === "COOLING" ||
        prev.phase === "ARCHIVED")
    ? false
    : input.active;

  if (next.phase === "WATCHING") {
    next.consecutiveActiveFail = 0;
    next.consecutiveLowActivity = 0;
    if (detect) {
      next.consecutiveDetect = 1;
      next.phase = "DETECTED";
      next.consecutiveActive = activeForPromotion ? 1 : 0;
    } else {
      next.consecutiveDetect = 0;
      next.consecutiveActive = 0;
    }
    return { record: next, archived: false };
  }

  if (next.phase === "DETECTED" || next.phase === "CONFIRMING") {
    if (!detect) {
      return { record: emptyLifecycle(input.sessionDate), archived: false };
    }
    next.consecutiveDetect += 1;
    if (
      next.phase === "DETECTED" &&
      next.consecutiveDetect >= input.config.confirmingEvals
    ) {
      next.phase = "CONFIRMING";
    }
    if (activeForPromotion) {
      next.consecutiveActive += 1;
    } else {
      next.consecutiveActive = 0;
    }
    if (
      next.phase === "CONFIRMING" &&
      next.consecutiveActive >= input.config.activeConfirmEvals
    ) {
      next.phase = "ACTIVE";
      next.consecutiveActiveFail = 0;
      next.peakVol15WhileActive = input.metrics.vol15s;
      next.coolingEnteredAtMs = null;
    }
    return { record: next, archived: false };
  }

  if (next.phase === "ACTIVE" || next.phase === "REACTIVATED") {
    next.peakVol15WhileActive = Math.max(
      next.peakVol15WhileActive,
      input.metrics.vol15s,
    );
    if (input.active) {
      next.consecutiveActiveFail = 0;
      next.consecutiveActive += 1;
      return { record: next, archived: false };
    }
    next.consecutiveActive = 0;
    next.consecutiveActiveFail += 1;
    const peak = next.peakVol15WhileActive;
    const volCollapsed = peak > 0 &&
      input.metrics.vol15s < 0.5 * peak;
    const moveNegative = input.metrics.move15s.complete &&
      input.metrics.move15s.movePct !== null &&
      input.metrics.move15s.movePct < 0;
    if (
      next.consecutiveActiveFail >= input.config.coolingConfirmEvals &&
      (volCollapsed || moveNegative)
    ) {
      next.phase = "COOLING";
      next.coolingEnteredAtMs = input.wallNowMs;
      next.consecutiveLowActivity = 0;
    }
    return { record: next, archived: false };
  }

  if (next.phase === "COOLING") {
    if (activeForPromotion) {
      next.consecutiveActive += 1;
      next.consecutiveLowActivity = 0;
      if (next.consecutiveActive >= input.config.reactivateConfirmEvals) {
        next.phase = "REACTIVATED";
        next.consecutiveActiveFail = 0;
        next.coolingEnteredAtMs = null;
        next.peakVol15WhileActive = input.metrics.vol15s;
      }
      return { record: next, archived: false };
    }
    next.consecutiveActive = 0;
    if (input.metrics.vol60s < input.config.archiveRolling60Ceiling) {
      next.consecutiveLowActivity += 1;
    } else {
      next.consecutiveLowActivity = 0;
    }
    const cooledLongEnough = next.coolingEnteredAtMs !== null &&
      input.wallNowMs - next.coolingEnteredAtMs >=
        input.config.archiveCoolingMs;
    if (
      cooledLongEnough &&
      next.consecutiveLowActivity >= input.config.archiveLowActivityEvals
    ) {
      next.phase = "ARCHIVED";
      return { record: next, archived: true };
    }
    return { record: next, archived: false };
  }

  // ARCHIVED
  if (activeForPromotion) {
    next.consecutiveActive += 1;
    if (next.consecutiveActive >= input.config.reactivateConfirmEvals) {
      next.phase = "REACTIVATED";
      next.consecutiveActiveFail = 0;
      next.coolingEnteredAtMs = null;
      next.peakVol15WhileActive = input.metrics.vol15s;
    }
  } else {
    next.consecutiveActive = 0;
  }
  return { record: next, archived: false };
}
