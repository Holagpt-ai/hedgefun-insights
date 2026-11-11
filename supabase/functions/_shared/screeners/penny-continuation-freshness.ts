import { PENNY_MAX_OBSERVATION_AGE_MS } from "../config/penny-continuation.config.ts";
import { PROVIDER_FUTURE_SKEW_MS } from "./session-volume.ts";
import { assessScreenerGenerationSession, surveillanceTradingDateFromMs } from "./screener-session.ts";
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

function isValidDelayMs(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0;
}

export function assessPennySymbolFreshness(
  input: PennyContinuationFreshnessInput,
): PennyFreshnessAssessment {
  const {
    evaluationClockMs,
    symbolObservationMs,
    verifiedExpectedProviderDelayMs,
    dataDeliveryPolicy,
    generationSyncIso,
    generationSyncMs,
    enforceLiveSessionGuards = true,
  } = input;

  if (!Number.isFinite(evaluationClockMs)) {
    return fail(["DATA_UNAVAILABLE"]);
  }

  if (!isValidDelayMs(verifiedExpectedProviderDelayMs) || dataDeliveryPolicy === null) {
    return fail(["PROVIDER_DELAY_UNKNOWN"]);
  }

  if (enforceLiveSessionGuards) {
    const parsedGen = generationSyncIso ? Date.parse(generationSyncIso) : NaN;
    if (
      !Number.isFinite(generationSyncMs ?? NaN) ||
      !generationSyncIso ||
      !Number.isFinite(parsedGen)
    ) {
      return fail(["GENERATION_EVIDENCE_UNAVAILABLE"]);
    }
    if (Math.abs((generationSyncMs as number) - parsedGen) > 5_000) {
      return fail(["GENERATION_EVIDENCE_UNAVAILABLE"]);
    }
    if (
      assessScreenerGenerationSession({
        nowMs: evaluationClockMs,
        referenceIso: generationSyncIso,
      }) === "previous_during_live"
    ) {
      return fail(["CACHE_GENERATION_STALE"]);
    }
  }

  if (symbolObservationMs === null || !Number.isFinite(symbolObservationMs)) {
    return fail(["MISSING_OBSERVATION_TS"]);
  }

  if (symbolObservationMs > evaluationClockMs + PROVIDER_FUTURE_SKEW_MS) {
    return fail(["INVALID_OBSERVATION_TS"]);
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

  if (observedLagMs < 0) {
    return fail(["INVALID_OBSERVATION_TS"]);
  }

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
    reasons: [],
    observedLagMs,
    feedDelayMs: observedLagMs,
    allowedMaxLagMs,
    dataFreshnessLabel,
  };
}

function fail(reasons: PennyReasonCode[]): PennyFreshnessAssessment {
  return {
    hardFail: true,
    reasons,
    observedLagMs: null,
    feedDelayMs: null,
    allowedMaxLagMs: null,
    dataFreshnessLabel: "stale",
  };
}
