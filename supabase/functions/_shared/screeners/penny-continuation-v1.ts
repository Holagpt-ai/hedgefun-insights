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

interface IdemCacheEntry {
  sessionDate: string;
  symbolObservationMs: number;
  expiresAtMs: number;
  result: PennyContinuationResult;
}

const publicationCooldownBySymbol = new Map<string, number>();
const idemCache = new Map<string, IdemCacheEntry>();

export function clearPennyContinuationLifecycleState(): void {
  publicationCooldownBySymbol.clear();
  idemCache.clear();
}

export interface PennyContinuationEvaluateOptions {
  /** When true, suppresses repeat publication notifications within the 5-minute window only. */
  enforcePublicationCooldown?: boolean;
}

function idempotencyKey(input: PennyContinuationInput): string | null {
  const obs = input.freshness.symbolObservationMs;
  if (obs === null || !Number.isFinite(obs)) return null;
  const floor = Math.floor(obs / 60_000);
  const gen = input.observationGenerationId ?? "na";
  return `${input.sessionDate}:${input.symbol}:${PENNY_CONTINUATION_MODEL_VERSION}:${gen}:${floor}`;
}

function buildStableRankingKey(input: PennyContinuationInput): string | null {
  const obs = input.freshness.symbolObservationMs;
  if (obs === null || !Number.isFinite(obs)) return null;
  return `${input.sessionDate}:${input.symbol}:${PENNY_CONTINUATION_MODEL_VERSION}:${Math.floor(obs / 60_000)}`;
}

function supplementalLabels(input: PennyContinuationInput): PennySupplementalLabel[] {
  const labels: PennySupplementalLabel[] = [];
  if (input.lateDayContinuation) labels.push("late_day");
  if (input.nextSessionCarry) labels.push("next_session_carry");
  return labels;
}

function pruneIdemCache(evaluationClockMs: number, sessionDate: string): void {
  for (const [key, entry] of idemCache) {
    if (entry.sessionDate !== sessionDate || entry.expiresAtMs < evaluationClockMs) {
      idemCache.delete(key);
    }
  }
  while (idemCache.size > PENNY_IDEM_CACHE_MAX_ENTRIES) {
    const firstKey = idemCache.keys().next().value;
    if (firstKey === undefined) break;
    idemCache.delete(firstKey);
  }
}

function cacheEntryStillValid(
  entry: IdemCacheEntry,
  input: PennyContinuationInput,
  freshnessHardFail: boolean,
  evaluationClockMs: number,
): boolean {
  if (entry.sessionDate !== input.sessionDate) return false;
  if (entry.expiresAtMs < evaluationClockMs) return false;
  if (entry.symbolObservationMs !== input.freshness.symbolObservationMs) return false;
  if (freshnessHardFail) return false;
  if (entry.result.continuationQualified && freshnessHardFail) return false;
  return true;
}

function evaluateFresh(input: PennyContinuationInput): PennyContinuationResult {
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
  const expiresAtMs = obsMs !== null ? obsMs + allowedLag : 0;
  const expiresAt = obsMs !== null ? new Date(expiresAtMs).toISOString() : null;

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
  const symbol = input.symbol.trim().toUpperCase();
  const evaluationClockMs = input.freshness.evaluationClockMs;
  pruneIdemCache(evaluationClockMs, input.sessionDate);

  const freshnessProbe = assessPennySymbolFreshness(input.freshness);
  const idemKey = idempotencyKey(input);
  if (idemKey) {
    const cached = idemCache.get(idemKey);
    if (cached && cacheEntryStillValid(cached, input, freshnessProbe.hardFail, evaluationClockMs)) {
      return cached.result;
    }
    if (cached) idemCache.delete(idemKey);
  }

  const result = evaluateFresh(input);

  if (options?.enforcePublicationCooldown) {
    const lastPublication = publicationCooldownBySymbol.get(symbol);
    if (
      lastPublication !== undefined &&
      evaluationClockMs - lastPublication < PENNY_REQUALIFY_COOLDOWN_MS
    ) {
      return {
        ...result,
        reasons: [...result.reasons, "REQUALIFY_COOLDOWN"],
      };
    }
    if (result.continuationQualified) {
      publicationCooldownBySymbol.set(symbol, evaluationClockMs);
    }
  }

  const obsMs = input.freshness.symbolObservationMs;
  if (idemKey && obsMs !== null) {
    const allowedLag = freshnessProbe.allowedMaxLagMs ?? PENNY_MAX_OBSERVATION_AGE_MS;
    idemCache.set(idemKey, {
      sessionDate: input.sessionDate,
      symbolObservationMs: obsMs,
      expiresAtMs: obsMs + allowedLag,
      result,
    });
  }

  return result;
}

export { buildPennyAmInboxBadgePayload } from "./penny-continuation-handoff.ts";
