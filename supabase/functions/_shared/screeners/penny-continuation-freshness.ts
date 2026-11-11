import { PENNY_MAX_OBSERVATION_AGE_MS } from "../config/penny-continuation.config.ts";
import { assessScreenerGenerationSession } from "./screener-session.ts";
import { surveillanceTradingDateFromMs } from "./screener-session.ts";
import type {
  PennyContinuationFreshnessInput,
  PennyDataFreshnessLabel,
  PennyReasonCode,
} from "./penny-continuation-types.ts";

export interface PennyFreshnessAssessment {
  hardFail: boolean;
  reasons: PennyReasonCode[];
  observedLagMs: number | null;
  feedDelayMs: number | null;
  allowedMaxLagMs: number | null;
  dataFreshnessLabel: PennyDataFreshnessLabel;
}

export function assessPennySymbolFreshness(
  input: PennyContinuationFreshnessInput,
): PennyFreshnessAssessment {
  const reasons: PennyReasonCode[] = [];
  const {
    evaluationClockMs,
    symbolObservationMs,
    verifiedExpectedProviderDelayMs,
    dataDeliveryPolicy,
    generationSyncIso,
    enforceLiveSessionGuards = true,
  } = input;

  if (verifiedExpectedProviderDelayMs === null || dataDeliveryPolicy === null) {
    return {
      hardFail: true,
      reasons: ["PROVIDER_DELAY_UNKNOWN"],
      observedLagMs: null,
      feedDelayMs: null,
      allowedMaxLagMs: null,
      dataFreshnessLabel: "stale",
    };
  }

  if (
    enforceLiveSessionGuards &&
    generationSyncIso &&
    assessScreenerGenerationSession({
      nowMs: evaluationClockMs,
      referenceIso: generationSyncIso,
    }) === "previous_during_live"
  ) {
    return {
      hardFail: true,
      reasons: ["CACHE_GENERATION_STALE"],
      observedLagMs: null,
      feedDelayMs: null,
      allowedMaxLagMs: null,
      dataFreshnessLabel: "stale",
    };
  }

  if (symbolObservationMs === null) {
    return {
      hardFail: true,
      reasons: ["MISSING_OBSERVATION_TS"],
      observedLagMs: null,
      feedDelayMs: null,
      allowedMaxLagMs: null,
      dataFreshnessLabel: "stale",
    };
  }

  if (enforceLiveSessionGuards) {
    const evalSurveillance = surveillanceTradingDateFromMs(evaluationClockMs);
    const obsSurveillance = surveillanceTradingDateFromMs(symbolObservationMs);
    if (
      evalSurveillance !== null &&
      obsSurveillance !== null &&
      evalSurveillance !== obsSurveillance
    ) {
      return {
        hardFail: true,
        reasons: ["SYMBOL_OBSERVATION_SESSION_MISMATCH"],
        observedLagMs: evaluationClockMs - symbolObservationMs,
        feedDelayMs: evaluationClockMs - symbolObservationMs,
        allowedMaxLagMs: verifiedExpectedProviderDelayMs + PENNY_MAX_OBSERVATION_AGE_MS,
        dataFreshnessLabel: "stale",
      };
    }
  }

  const observedLagMs = evaluationClockMs - symbolObservationMs;
  const allowedMaxLagMs = verifiedExpectedProviderDelayMs + PENNY_MAX_OBSERVATION_AGE_MS;

  if (observedLagMs > allowedMaxLagMs) {
    return {
      hardFail: true,
      reasons: ["OBSERVATION_STALE"],
      observedLagMs,
      feedDelayMs: observedLagMs,
      allowedMaxLagMs,
      dataFreshnessLabel: "stale",
    };
  }

  let dataFreshnessLabel: PennyDataFreshnessLabel = null;
  if (
    observedLagMs <= verifiedExpectedProviderDelayMs &&
    dataDeliveryPolicy === "near_real_time"
  ) {
    dataFreshnessLabel = "live";
  } else if (observedLagMs <= allowedMaxLagMs && dataDeliveryPolicy === "near_real_time") {
    dataFreshnessLabel = "delayed";
  } else if (observedLagMs <= allowedMaxLagMs && dataDeliveryPolicy === "documented_delayed") {
    dataFreshnessLabel = "delayed";
  }

  return {
    hardFail: false,
    reasons,
    observedLagMs,
    feedDelayMs: observedLagMs,
    allowedMaxLagMs,
    dataFreshnessLabel,
  };
}
