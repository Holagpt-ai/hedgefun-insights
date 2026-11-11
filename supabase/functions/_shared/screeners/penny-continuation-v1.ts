/**
 * Penny Continuation V1 — sub-$1 momentum continuation engine (Batch 223).
 * Pure evaluation; no persistence, cron, or live publication wiring.
 */

import {
  PENNY_CONTINUATION_MODEL_VERSION,
  PENNY_CORE_SIGNALS_REQUIRED,
  PENNY_IDEM_CACHE_MAX_ENTRIES,
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

const lastPublicationMsByKey = new Map<string, number>();

export function clearPennyContinuationLifecycleState(): void {
  lastPublicationMsByKey.clear();
}

export interface PennyContinuationEvaluateOptions {
  /** Suppresses duplicate publication notifications within 5 minutes for the same idempotency key. */
  enforcePublicationCooldown?: boolean;
}

export function buildPennyPublicationIdempotencyKey(input: PennyContinuationInput): string | null {
  const obs = input.freshness.symbolObservationMs;
  if (obs === null || !Number.isFinite(obs)) return null;
  const floor = Math.floor(obs / 60_000);
  const gen = input.observationGenerationId ?? "na";
  return `${input.sessionDate}:${input.symbol}:${PENNY_CONTINUATION_MODEL_VERSION}:${gen}:${floor}`;
}

function buildStableRankingKey(input: PennyContinuationInput): string | null {
  return buildPennyPublicationIdempotencyKey(input);
}

function supplementalLabels(input: PennyContinuationInput): PennySupplementalLabel[] {
  const labels: PennySupplementalLabel[] = [];
  if (input.lateDayContinuation) labels.push("late_day");
  if (input.nextSessionCarry) labels.push("next_session_carry");
  return labels;
}

function prunePublicationState(evaluationClockMs: number, sessionDate: string): void {
  for (const [key, ts] of lastPublicationMsByKey) {
    if (!key.startsWith(`${sessionDate}:`) || evaluationClockMs - ts > PENNY_REQUALIFY_COOLDOWN_MS) {
      lastPublicationMsByKey.delete(key);
    }
  }
  while (lastPublicationMsByKey.size > PENNY_IDEM_CACHE_MAX_ENTRIES) {
    const firstKey = lastPublicationMsByKey.keys().next().value;
    if (firstKey === undefined) break;
    lastPublicationMsByKey.delete(firstKey);
  }
}

function resolvePublicationSuppressed(
  input: PennyContinuationInput,
  continuationQualified: boolean,
  options?: PennyContinuationEvaluateOptions,
): boolean {
  if (!options?.enforcePublicationCooldown || !continuationQualified) return false;
  const idemKey = buildPennyPublicationIdempotencyKey(input);
  if (!idemKey) return false;
  const now = input.freshness.evaluationClockMs;
  const last = lastPublicationMsByKey.get(idemKey);
  if (last !== undefined && now - last < PENNY_REQUALIFY_COOLDOWN_MS) {
    return true;
  }
  lastPublicationMsByKey.set(idemKey, now);
  return false;
}

function evaluateFresh(input: PennyContinuationInput): Omit<
  PennyContinuationResult,
  "publicationIdempotencyKey" | "publicationSuppressed"
> {
  const symbol = input.symbol.trim().toUpperCase();
  const freshness = assessPennySymbolFreshness(input.freshness);
  const eligibility = evaluatePennyContinuationEligibility(input);
  const coreSignals = evaluatePennyCoreSignals(input);
  const corePassCount = countCorePasses(coreSignals);

  const reasons = [...eligibility.reasons];
  let continuationQualified = false;

  if (eligibility.passed) {
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

  return {
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
}

export function evaluatePennyContinuationV1(
  input: PennyContinuationInput,
  options?: PennyContinuationEvaluateOptions,
): PennyContinuationResult {
  prunePublicationState(input.freshness.evaluationClockMs, input.sessionDate);
  const core = evaluateFresh(input);
  const publicationIdempotencyKey = buildPennyPublicationIdempotencyKey(input);
  const publicationSuppressed = resolvePublicationSuppressed(
    input,
    core.continuationQualified,
    options,
  );
  return {
    ...core,
    publicationIdempotencyKey,
    publicationSuppressed,
  };
}

export {
  buildPennyAmInboxBadgePayload,
  pennyContinuationMayEmitNotification,
} from "./penny-continuation-handoff.ts";
