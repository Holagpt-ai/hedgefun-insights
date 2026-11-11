/**
 * Penny Continuation V1 — sub-$1 momentum continuation engine (Batch 223).
 * Pure evaluation; no persistence, cron, or live publication wiring.
 */

import {
  PENNY_CONTINUATION_MODEL_VERSION,
  PENNY_CORE_SIGNALS_REQUIRED,
  PENNY_MAX_OBSERVATION_AGE_MS,
  PENNY_REQUALIFY_COOLDOWN_MS,
} from "../config/penny-continuation.config.ts";
import { evaluatePennyContinuationEligibility } from "./penny-continuation-eligibility.ts";
import { assessPennySymbolFreshness } from "./penny-continuation-freshness.ts";
import {
  computePennyContinuationScore,
  pennyOptionalRankBonuses,
} from "./penny-continuation-ranking.ts";
import {
  countCorePasses,
  evaluatePennyCoreSignals,
  pennyContinuationInvalidators,
} from "./penny-continuation-signals.ts";
import type {
  PennyContinuationInput,
  PennyContinuationResult,
  PennySupplementalLabel,
} from "./penny-continuation-types.ts";

const cooldownBySymbol = new Map<string, number>();
const lastResultByKey = new Map<string, PennyContinuationResult>();

export function clearPennyContinuationLifecycleState(): void {
  cooldownBySymbol.clear();
  lastResultByKey.clear();
}

function idempotencyKey(input: PennyContinuationInput): string | null {
  const obs = input.freshness.symbolObservationMs;
  if (obs === null) return null;
  const floor = Math.floor(obs / 60_000);
  const gen = input.observationGenerationId ?? "na";
  return `${input.sessionDate}:${input.symbol}:${PENNY_CONTINUATION_MODEL_VERSION}:${gen}:${floor}`;
}

function buildStableRankingKey(input: PennyContinuationInput): string | null {
  const obs = input.freshness.symbolObservationMs;
  if (obs === null) return null;
  return `${input.sessionDate}:${input.symbol}:${PENNY_CONTINUATION_MODEL_VERSION}:${Math.floor(obs / 60_000)}`;
}

function supplementalLabels(input: PennyContinuationInput): PennySupplementalLabel[] {
  const labels: PennySupplementalLabel[] = [];
  if (input.lateDayContinuation) labels.push("late_day");
  if (input.nextSessionCarry) labels.push("next_session_carry");
  return labels;
}

export function evaluatePennyContinuationV1(
  input: PennyContinuationInput,
  options?: { skipCooldown?: boolean },
): PennyContinuationResult {
  const symbol = input.symbol.trim().toUpperCase();
  const idemKey = idempotencyKey(input);
  if (idemKey && lastResultByKey.has(idemKey)) {
    return lastResultByKey.get(idemKey)!;
  }

  const lastEval = cooldownBySymbol.get(symbol);
  const now = input.freshness.evaluationClockMs;
  if (!options?.skipCooldown && lastEval !== undefined && now - lastEval < PENNY_REQUALIFY_COOLDOWN_MS) {
    const emptySignals = { cs1: "UNKNOWN", cs2: "UNKNOWN", cs3: "UNKNOWN", cs4: "UNKNOWN", cs5: "UNKNOWN" } as const;
    return {
      model_version: PENNY_CONTINUATION_MODEL_VERSION,
      symbol,
      sessionDate: input.sessionDate,
      qualifies: false,
      continuationQualified: false,
      eligibility: { passed: false, reasons: ["REQUALIFY_COOLDOWN"], spreadUnavailable: false, coveragePenalty: 0 },
      coreSignals: { ...emptySignals },
      corePassCount: 0,
      score: null,
      coveragePct: 0,
      rankKeys: {
        sharesPerMinute: input.sharesPerMinute10m,
        sessionVolume: input.sessionVolumeShares,
        dollarVolume: input.dollarVolume,
      },
      evidence: {
        symbolObservationMs: input.freshness.symbolObservationMs,
        providerAsOfMs: input.freshness.providerAsOfMs ?? null,
        generationSyncMs: input.freshness.generationSyncMs ?? null,
        verifiedExpectedProviderDelayMs: input.freshness.verifiedExpectedProviderDelayMs,
        dataDeliveryPolicy: input.freshness.dataDeliveryPolicy,
        observedLagMs: null,
        feedDelayMs: null,
      },
      feedDelayMs: null,
      dataFreshnessLabel: null,
      supplementalLabels: [],
      reasons: ["REQUALIFY_COOLDOWN"],
      stableRankingKey: buildStableRankingKey(input),
      expiresAt: null,
    };
  }

  cooldownBySymbol.set(symbol, now);

  const freshness = assessPennySymbolFreshness(input.freshness);
  const eligibility = evaluatePennyContinuationEligibility(input);
  const coreSignals = evaluatePennyCoreSignals(input);
  const corePassCount = countCorePasses(coreSignals);

  const reasons = [...eligibility.reasons];
  let continuationQualified = false;

  if (!eligibility.passed) {
    /* reasons already set */
  } else {
    const invalidators = pennyContinuationInvalidators(input);
    if (invalidators.length > 0) {
      reasons.push(...invalidators);
    } else if (corePassCount < PENNY_CORE_SIGNALS_REQUIRED) {
      reasons.push("CONTINUATION_SIGNALS_INSUFFICIENT");
    } else {
      continuationQualified = true;
    }
  }

  const { score: baseScore, coveragePct } = eligibility.passed
    ? computePennyContinuationScore(input, eligibility.coveragePenalty)
    : { score: null, coveragePct: 0 };

  const bonus = eligibility.passed ? pennyOptionalRankBonuses(input) : 0;
  const score = baseScore === null ? null : Math.min(100, baseScore + bonus);

  const obsMs = input.freshness.symbolObservationMs;
  const allowedLag = freshness.allowedMaxLagMs ?? PENNY_MAX_OBSERVATION_AGE_MS;
  const expiresAt = obsMs !== null ? new Date(obsMs + allowedLag).toISOString() : null;

  const result: PennyContinuationResult = {
    model_version: PENNY_CONTINUATION_MODEL_VERSION,
    symbol,
    sessionDate: input.sessionDate,
    qualifies: eligibility.passed,
    continuationQualified,
    eligibility,
    coreSignals,
    corePassCount,
    score,
    coveragePct,
    rankKeys: {
      sharesPerMinute: input.sharesPerMinute10m,
      sessionVolume: input.sessionVolumeShares,
      dollarVolume: input.dollarVolume,
    },
    evidence: {
      symbolObservationMs: input.freshness.symbolObservationMs,
      providerAsOfMs: input.freshness.providerAsOfMs ?? null,
      generationSyncMs: input.freshness.generationSyncMs ?? null,
      verifiedExpectedProviderDelayMs: input.freshness.verifiedExpectedProviderDelayMs,
      dataDeliveryPolicy: input.freshness.dataDeliveryPolicy,
      observedLagMs: freshness.observedLagMs,
      feedDelayMs: freshness.feedDelayMs,
    },
    feedDelayMs: freshness.feedDelayMs,
    dataFreshnessLabel: freshness.dataFreshnessLabel,
    supplementalLabels: supplementalLabels(input),
    reasons,
    stableRankingKey: buildStableRankingKey(input),
    expiresAt,
  };

  if (idemKey) lastResultByKey.set(idemKey, result);
  return result;
}

export { buildPennyAmInboxBadgePayload } from "./penny-continuation-handoff.ts";
