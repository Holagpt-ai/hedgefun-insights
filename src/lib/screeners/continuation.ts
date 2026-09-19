/**
 * Late-Session Continuation / Day-Two Watch V1.
 *
 * Evaluates already-discovered candidates for next-session carry-forward.
 * Does not recompute Discovery Rank or invoke Trade Quality / filter engines.
 */

import {
  CONTINUATION_AFTER_HOURS_END_INCLUSIVE_MS,
  CONTINUATION_AFTER_HOURS_MAINTAIN_HOD_PCT,
  CONTINUATION_AFTER_HOURS_MIN_DOLLAR_VOLUME,
  CONTINUATION_AFTER_HOURS_START_EXCLUSIVE_MS,
  CONTINUATION_CATALYST_SCORES,
  CONTINUATION_CATEGORY_PRIORITY,
  CONTINUATION_COMPONENT_WEIGHTS,
  CONTINUATION_CRITICAL_MIN_DOLLAR_VOLUME,
  CONTINUATION_DAY_TWO_MIN_DOLLAR_VOLUME,
  CONTINUATION_DAY_TWO_MIN_SCORE,
  CONTINUATION_DOLLAR_VOLUME_TIERS,
  CONTINUATION_EXCLUDED_INSTRUMENT_TYPES,
  CONTINUATION_FLOAT_TURNOVER_TIERS,
  CONTINUATION_HIGH_CONFIDENCE_CATEGORIES,
  CONTINUATION_HOD_TIERS,
  CONTINUATION_MAX_SPREAD_PCT,
  CONTINUATION_MIN_COVERAGE_PCT,
  CONTINUATION_MODEL_VERSION,
  CONTINUATION_POWER_HOUR_END_MS,
  CONTINUATION_POWER_HOUR_MIN_DOLLAR_VOLUME,
  CONTINUATION_POWER_HOUR_START_MS,
  CONTINUATION_RVOL20D_TIERS,
  CONTINUATION_STRONG_CLOSE_MAX_HOD_DISTANCE_PCT,
  CONTINUATION_STRONG_CLOSE_MIN_DOLLAR_VOLUME,
  CONTINUATION_TOTAL_WEIGHT,
  CONTINUATION_TRADE_QUALITY_TIERS,
  CONTINUATION_VELOCITY_SCORES,
  CONTINUATION_VWAP_SIGNAL_WEIGHTS,
  type ContinuationCategory,
  type ContinuationNumericTier,
  type ContinuationReason,
  type ContinuationVelocityState,
} from "@/config/continuation.config";
import { isIsoDate } from "@/lib/equities-session-calendar";
import { easternParts } from "@/lib/market-session";
import { isFiniteNumber, isPositiveFinite, parseTimestampMs } from "@/lib/screeners/contract";
import { computeDollarVolume } from "@/lib/screeners/dollar-volume";
import type {
  ContinuationCategoryResult,
  ContinuationComponentResult,
  ContinuationComponents,
  ContinuationDisqualifier,
  ContinuationHandoff,
  ContinuationInput,
  ContinuationRankedCandidate,
  ContinuationRankInput,
  ContinuationResult,
  ContinuationSessionWindow,
  ContinuationTriState,
} from "@/types/continuation";

const EMPTY_WINDOW: ContinuationSessionWindow = {
  isPowerHour: false,
  isAfterHours: false,
  isNearClose: false,
  etDate: null,
  msOfDay: null,
};

function emptyComponents(): ContinuationComponents {
  return {
    lateSessionVelocity: unavailable(CONTINUATION_COMPONENT_WEIGHTS.lateSessionVelocity),
    closeHodStrength: unavailable(CONTINUATION_COMPONENT_WEIGHTS.closeHodStrength),
    dollarVolume: unavailable(CONTINUATION_COMPONENT_WEIGHTS.dollarVolume),
    catalyst: unavailable(CONTINUATION_COMPONENT_WEIGHTS.catalyst),
    vwapHold: unavailable(CONTINUATION_COMPONENT_WEIGHTS.vwapHold),
    floatTurnover: unavailable(CONTINUATION_COMPONENT_WEIGHTS.floatTurnover),
    rvol20d: unavailable(CONTINUATION_COMPONENT_WEIGHTS.rvol20d),
    tradeQuality: unavailable(CONTINUATION_COMPONENT_WEIGHTS.tradeQuality),
  };
}

function unavailable(maxScore: number): ContinuationComponentResult {
  return { available: false, rawValue: null, score: null, maxScore };
}

function available(
  rawValue: number | string,
  score: number,
  maxScore: number,
): ContinuationComponentResult {
  return { available: true, rawValue, score, maxScore };
}

function scoreExclusiveTiers(value: number, tiers: readonly ContinuationNumericTier[]): number {
  for (const tier of tiers) {
    if (value >= tier.minInclusive && (tier.maxExclusive === null || value < tier.maxExclusive)) {
      return tier.score;
    }
  }
  return tiers[tiers.length - 1]?.score ?? 0;
}

function scoreHodDistance(distance: number): number {
  for (const tier of CONTINUATION_HOD_TIERS) {
    if (tier.maxInclusive === null || distance <= tier.maxInclusive) return tier.score;
  }
  return 0;
}

function tri(value: ContinuationTriState | null | undefined): ContinuationTriState {
  return value ?? "UNKNOWN";
}

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function toCanonicalUtc(value: unknown): string | null {
  const ms = parseTimestampMs(value);
  return ms === null ? null : new Date(ms).toISOString();
}

export function resolveContinuationSessionWindow(
  observedAt: string,
): ContinuationSessionWindow | null {
  const ms = parseTimestampMs(observedAt);
  if (ms === null) return null;
  const parts = easternParts(ms);
  if (!parts) return null;
  const isPowerHour =
    parts.msOfDay >= CONTINUATION_POWER_HOUR_START_MS &&
    parts.msOfDay <= CONTINUATION_POWER_HOUR_END_MS;
  const isAfterHours =
    parts.msOfDay > CONTINUATION_AFTER_HOURS_START_EXCLUSIVE_MS &&
    parts.msOfDay <= CONTINUATION_AFTER_HOURS_END_INCLUSIVE_MS;
  const etDate = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  return {
    isPowerHour,
    isAfterHours,
    isNearClose: isPowerHour,
    etDate,
    msOfDay: parts.msOfDay,
  };
}

function resolveDollarVolume(input: ContinuationInput): number | null {
  if (isFiniteNumber(input.dollarVolume) && input.dollarVolume >= 0) return input.dollarVolume;
  return computeDollarVolume(input.price, input.currentSessionVolume);
}

function resolveFloatTurnover(input: ContinuationInput): number | null {
  if (isFiniteNumber(input.floatTurnover) && input.floatTurnover >= 0) return input.floatTurnover;
  const volume = input.currentSessionVolume;
  const floatShares = input.floatShares;
  if (!isFiniteNumber(volume) || volume < 0 || !isPositiveFinite(floatShares)) return null;
  const turnover = volume / floatShares;
  return Number.isFinite(turnover) && turnover >= 0 ? turnover : null;
}

function resolveVelocity(input: ContinuationInput): ContinuationVelocityState {
  const volume = input.volumeVelocity ?? "UNKNOWN";
  const price = input.priceVelocity ?? "UNKNOWN";
  if (volume !== "UNKNOWN") return volume;
  if (price !== "UNKNOWN") return price;
  return "UNKNOWN";
}

function scoreVelocity(input: ContinuationInput): ContinuationComponentResult {
  const maxScore = CONTINUATION_COMPONENT_WEIGHTS.lateSessionVelocity;
  const state = resolveVelocity(input);
  if (state === "UNKNOWN") return unavailable(maxScore);
  return available(state, CONTINUATION_VELOCITY_SCORES[state], maxScore);
}

function scoreHod(input: ContinuationInput): ContinuationComponentResult {
  const maxScore = CONTINUATION_COMPONENT_WEIGHTS.closeHodStrength;
  const distance = input.distanceFromHodPct;
  if (!isFiniteNumber(distance) || distance < 0) return unavailable(maxScore);
  return available(distance, scoreHodDistance(distance), maxScore);
}

function scoreDollar(input: ContinuationInput, dollarVolume: number | null): ContinuationComponentResult {
  const maxScore = CONTINUATION_COMPONENT_WEIGHTS.dollarVolume;
  if (dollarVolume === null) return unavailable(maxScore);
  return available(dollarVolume, scoreExclusiveTiers(dollarVolume, CONTINUATION_DOLLAR_VOLUME_TIERS), maxScore);
}

function scoreCatalyst(input: ContinuationInput): ContinuationComponentResult {
  const maxScore = CONTINUATION_COMPONENT_WEIGHTS.catalyst;
  const quality = input.catalystQuality;
  if (quality == null || quality === "UNKNOWN") return unavailable(maxScore);
  return available(quality, CONTINUATION_CATALYST_SCORES[quality], maxScore);
}

function scoreVwap(input: ContinuationInput): ContinuationComponentResult {
  const configuredMax = CONTINUATION_COMPONENT_WEIGHTS.vwapHold;
  let availableWeight = 0;
  let earned = 0;
  const signals: Array<[ContinuationTriState, number]> = [
    [tri(input.aboveVwap), CONTINUATION_VWAP_SIGNAL_WEIGHTS.aboveVwap],
    [tri(input.holdingVwapAfterReclaim), CONTINUATION_VWAP_SIGNAL_WEIGHTS.holdingVwapAfterReclaim],
    [tri(input.positiveStructure), CONTINUATION_VWAP_SIGNAL_WEIGHTS.positiveStructure],
  ];
  for (const [state, weight] of signals) {
    if (state === "UNKNOWN") continue;
    availableWeight += weight;
    if (state === "TRUE") earned += weight;
  }
  if (availableWeight === 0) return unavailable(configuredMax);
  return { available: true, rawValue: `${earned}/${availableWeight}`, score: earned, maxScore: availableWeight };
}

function scoreTurnover(input: ContinuationInput): ContinuationComponentResult {
  const maxScore = CONTINUATION_COMPONENT_WEIGHTS.floatTurnover;
  const turnover = resolveFloatTurnover(input);
  if (turnover === null) return unavailable(maxScore);
  return available(turnover, scoreExclusiveTiers(turnover, CONTINUATION_FLOAT_TURNOVER_TIERS), maxScore);
}

function scoreRvol(input: ContinuationInput): ContinuationComponentResult {
  const maxScore = CONTINUATION_COMPONENT_WEIGHTS.rvol20d;
  const rvol = input.rvol20d;
  if (!isFiniteNumber(rvol) || rvol < 0) return unavailable(maxScore);
  return available(rvol, scoreExclusiveTiers(rvol, CONTINUATION_RVOL20D_TIERS), maxScore);
}

function scoreTradeQuality(input: ContinuationInput): ContinuationComponentResult {
  const maxScore = CONTINUATION_COMPONENT_WEIGHTS.tradeQuality;
  if (input.tradeQualityLabel === "INCOMPLETE") return unavailable(maxScore);
  const score = input.tradeQualityScore;
  if (!isFiniteNumber(score) || score < 0) return unavailable(maxScore);
  return available(score, scoreExclusiveTiers(score, CONTINUATION_TRADE_QUALITY_TIERS), maxScore);
}

function collectReasons(input: ContinuationInput, dollarVolume: number | null): ContinuationReason[] {
  const reasons: ContinuationReason[] = [];
  const velocity = resolveVelocity(input);
  if (velocity === "STRONG" || velocity === "MODERATE") reasons.push("POWER_HOUR_VOLUME_ACCELERATION");
  if (isFiniteNumber(input.distanceFromHodPct) && input.distanceFromHodPct <= 1) {
    reasons.push("CLOSE_WITHIN_1PCT_OF_HOD");
  } else if (
    isFiniteNumber(input.distanceFromHodPct) &&
    input.distanceFromHodPct <= CONTINUATION_STRONG_CLOSE_MAX_HOD_DISTANCE_PCT
  ) {
    reasons.push("CLOSE_NEAR_HOD");
  }
  if (tri(input.afterHoursExtendsSession) === "TRUE") reasons.push("AFTER_HOURS_STRENGTH");
  if (input.catalystQuality === "STRONG" || input.catalystQuality === "MODERATE") {
    reasons.push("VERIFIED_CATALYST");
  }
  if (tri(input.aboveVwap) === "TRUE") reasons.push("ABOVE_VWAP");
  if (dollarVolume !== null && dollarVolume >= CONTINUATION_POWER_HOUR_MIN_DOLLAR_VOLUME) {
    reasons.push("HIGH_DOLLAR_VOLUME");
  }
  const turnover = resolveFloatTurnover(input);
  if (turnover !== null && turnover >= 1) reasons.push("FLOAT_ROTATION");
  if (isFiniteNumber(input.rvol20d) && input.rvol20d >= 5) reasons.push("STRONG_RVOL");
  if (isFiniteNumber(input.tradeQualityScore) && input.tradeQualityLabel !== "INCOMPLETE" && input.tradeQualityScore >= 70) {
    reasons.push("HIGH_TRADE_QUALITY");
  }
  return reasons;
}

function liquidityMet(dollarVolume: number | null, minimum: number): boolean {
  return dollarVolume !== null && dollarVolume >= minimum;
}

function technicalBroken(input: ContinuationInput): boolean {
  return tri(input.closingRejection) === "TRUE" || tri(input.lateSessionBroken) === "TRUE";
}

function afterHoursMaintainsStrength(input: ContinuationInput): ContinuationTriState {
  const explicit = tri(input.afterHoursExtendsSession);
  if (explicit !== "UNKNOWN") return explicit;
  if (isPositiveFinite(input.price) && isPositiveFinite(input.sessionHigh)) {
    if (input.price >= input.sessionHigh) return "TRUE";
    const distance =
      isFiniteNumber(input.distanceFromHodPct) && input.distanceFromHodPct >= 0
        ? input.distanceFromHodPct
        : ((input.sessionHigh - input.price) / input.sessionHigh) * 100;
    if (Number.isFinite(distance) && distance <= CONTINUATION_AFTER_HOURS_MAINTAIN_HOD_PCT) {
      return "TRUE";
    }
    return "FALSE";
  }
  return "UNKNOWN";
}

function collectDisqualifiers(
  input: ContinuationInput,
  dollarVolume: number | null,
): ContinuationDisqualifier[] {
  const items: ContinuationDisqualifier[] = [];
  if (input.price !== undefined && input.price !== null && !isPositiveFinite(input.price)) {
    items.push({
      kind: "DISQUALIFIED",
      code: "INVALID_PRICE",
      message: "Price is invalid or not positive.",
    });
  }
  if (dollarVolume !== null && dollarVolume < CONTINUATION_CRITICAL_MIN_DOLLAR_VOLUME) {
    items.push({
      kind: "DISQUALIFIED",
      code: "CRITICAL_LOW_DOLLAR_VOLUME",
      message: "Dollar volume is below the critical minimum.",
    });
  }
  if (isFiniteNumber(input.spreadPct) && input.spreadPct > CONTINUATION_MAX_SPREAD_PCT) {
    items.push({
      kind: "DISQUALIFIED",
      code: "EXTREME_SPREAD",
      message: "Spread exceeds the configured maximum.",
    });
  }
  if (tri(input.catalystInvalidated) === "TRUE") {
    items.push({
      kind: "DISQUALIFIED",
      code: "CATALYST_INVALIDATED",
      message: "Catalyst was invalidated.",
    });
  }
  const instrument = input.instrumentType?.trim().toUpperCase();
  if (
    instrument &&
    CONTINUATION_EXCLUDED_INSTRUMENT_TYPES.includes(
      instrument as (typeof CONTINUATION_EXCLUDED_INSTRUMENT_TYPES)[number],
    )
  ) {
    items.push({
      kind: "DISQUALIFIED",
      code: "EXCLUDED_INSTRUMENT",
      message: "Instrument type is excluded by authoritative metadata.",
    });
  }
  return items;
}

function evaluateCategories(
  input: ContinuationInput,
  window: ContinuationSessionWindow,
  dollarVolume: number | null,
  score: number | null,
  reasons: ContinuationReason[],
): ContinuationCategoryResult[] {
  const results: ContinuationCategoryResult[] = [];
  const velocity = resolveVelocity(input);
  const hodOk =
    isFiniteNumber(input.distanceFromHodPct) &&
    input.distanceFromHodPct <= CONTINUATION_STRONG_CLOSE_MAX_HOD_DISTANCE_PCT;

  const powerHour =
    window.isPowerHour &&
    (velocity === "STRONG" || velocity === "MODERATE") &&
    liquidityMet(dollarVolume, CONTINUATION_POWER_HOUR_MIN_DOLLAR_VOLUME) &&
    !technicalBroken(input);
  results.push({
    category: "POWER_HOUR_MOMENTUM",
    qualified: powerHour,
    reasons: powerHour
      ? reasons.filter((reason) =>
          reason === "POWER_HOUR_VOLUME_ACCELERATION" ||
          reason === "HIGH_DOLLAR_VOLUME" ||
          reason === "ABOVE_VWAP" ||
          reason === "VERIFIED_CATALYST",
        )
      : [],
  });

  const strongClose =
    window.isNearClose &&
    hodOk &&
    liquidityMet(dollarVolume, CONTINUATION_STRONG_CLOSE_MIN_DOLLAR_VOLUME) &&
    tri(input.closingRejection) !== "TRUE";
  results.push({
    category: "STRONG_CLOSE_NEAR_HOD",
    qualified: strongClose,
    reasons: strongClose
      ? reasons.filter((reason) =>
          reason === "CLOSE_WITHIN_1PCT_OF_HOD" ||
          reason === "CLOSE_NEAR_HOD" ||
          reason === "HIGH_DOLLAR_VOLUME" ||
          reason === "ABOVE_VWAP",
        )
      : [],
  });

  const ahStrength = afterHoursMaintainsStrength(input);
  const afterHours =
    window.isAfterHours &&
    ahStrength === "TRUE" &&
    liquidityMet(dollarVolume, CONTINUATION_AFTER_HOURS_MIN_DOLLAR_VOLUME) &&
    tri(input.catalystInvalidated) !== "TRUE";
  results.push({
    category: "AFTER_HOURS_CONTINUATION",
    qualified: afterHours,
    reasons: afterHours
      ? reasons.filter((reason) =>
          reason === "AFTER_HOURS_STRENGTH" ||
          reason === "CLOSE_NEAR_HOD" ||
          reason === "CLOSE_WITHIN_1PCT_OF_HOD" ||
          reason === "HIGH_DOLLAR_VOLUME" ||
          reason === "VERIFIED_CATALYST",
        )
      : [],
  });

  const highConfidence = results.some(
    (item) =>
      item.qualified &&
      CONTINUATION_HIGH_CONFIDENCE_CATEGORIES.includes(
        item.category as (typeof CONTINUATION_HIGH_CONFIDENCE_CATEGORIES)[number],
      ),
  );
  const dayTwo =
    tri(input.closingRejection) !== "TRUE" &&
    liquidityMet(dollarVolume, CONTINUATION_DAY_TWO_MIN_DOLLAR_VOLUME) &&
    (highConfidence || (score !== null && score >= CONTINUATION_DAY_TWO_MIN_SCORE));
  results.push({
    category: "DAY_TWO_WATCH",
    qualified: dayTwo,
    reasons: dayTwo ? reasons : [],
  });

  return results;
}

function emptyResult(
  input: ContinuationInput,
  extras: Partial<ContinuationResult>,
): ContinuationResult {
  return {
    version: CONTINUATION_MODEL_VERSION,
    symbol: input.symbol?.trim().toUpperCase() || "",
    sessionDate: isIsoDate(input.sessionDate) ? input.sessionDate : null,
    qualifies: false,
    categories: [],
    categoryResults: [],
    score: null,
    rawNormalizedScore: null,
    coveragePct: 0,
    availableWeight: 0,
    earnedPoints: 0,
    label: "INCOMPLETE",
    disqualified: false,
    disqualifiers: [],
    components: emptyComponents(),
    window: EMPTY_WINDOW,
    discoveryRank: isFiniteNumber(input.discoveryRank) ? input.discoveryRank : null,
    dollarVolume: null,
    evaluatedAt: toCanonicalUtc(input.observedAt),
    diagnostics: [],
    ...extras,
  };
}

export function evaluateContinuation(input: ContinuationInput): ContinuationResult {
  const diagnostics: ContinuationResult["diagnostics"] = [];
  if (!input.symbol?.trim()) {
    return emptyResult(input, {
      diagnostics: [{ code: "INVALID_SYMBOL", message: "Symbol is required.", field: "symbol" }],
    });
  }
  if (!isIsoDate(input.sessionDate)) {
    return emptyResult(input, {
      diagnostics: [
        { code: "INVALID_SESSION_DATE", message: "sessionDate must be YYYY-MM-DD.", field: "sessionDate" },
      ],
    });
  }
  const evaluatedAt = toCanonicalUtc(input.observedAt);
  const window = resolveContinuationSessionWindow(input.observedAt);
  if (evaluatedAt === null || window === null) {
    return emptyResult(input, {
      sessionDate: input.sessionDate,
      diagnostics: [
        { code: "INVALID_TIMESTAMP", message: "observedAt must be a valid UTC timestamp.", field: "observedAt" },
      ],
    });
  }

  const dollarVolume = resolveDollarVolume(input);
  const components: ContinuationComponents = {
    lateSessionVelocity: scoreVelocity(input),
    closeHodStrength: scoreHod(input),
    dollarVolume: scoreDollar(input, dollarVolume),
    catalyst: scoreCatalyst(input),
    vwapHold: scoreVwap(input),
    floatTurnover: scoreTurnover(input),
    rvol20d: scoreRvol(input),
    tradeQuality: scoreTradeQuality(input),
  };

  let availableWeight = 0;
  let earnedPoints = 0;
  for (const [key, component] of Object.entries(components) as Array<
    [keyof ContinuationComponents, ContinuationComponentResult]
  >) {
    if (!component.available || component.score === null) continue;
    const configured = CONTINUATION_COMPONENT_WEIGHTS[key];
    availableWeight += configured;
    earnedPoints += (component.score / component.maxScore) * configured;
  }

  const coveragePct =
    CONTINUATION_TOTAL_WEIGHT === 0
      ? 0
      : Math.round((availableWeight / CONTINUATION_TOTAL_WEIGHT) * 1000) / 10;
  const rawNormalizedScore =
    availableWeight === 0 ? null : (earnedPoints / availableWeight) * 100;
  const complete = coveragePct >= CONTINUATION_MIN_COVERAGE_PCT && rawNormalizedScore !== null;
  const score = complete ? clampScore(rawNormalizedScore) : null;

  const disqualifiers = collectDisqualifiers(input, dollarVolume);
  const disqualified = disqualifiers.some((item) => item.kind === "DISQUALIFIED");
  const reasons = collectReasons(input, dollarVolume);
  const categoryResults =
    complete && !disqualified
      ? evaluateCategories(input, window, dollarVolume, score, reasons)
      : [];
  const categories = categoryResults.filter((item) => item.qualified).map((item) => item.category);

  if (!complete) {
    diagnostics.push({
      code: "INCOMPLETE_COVERAGE",
      message: "Continuation coverage is below the configured minimum.",
    });
  }

  return {
    version: CONTINUATION_MODEL_VERSION,
    symbol: input.symbol.trim().toUpperCase(),
    sessionDate: input.sessionDate,
    qualifies: !disqualified && categories.length > 0,
    categories,
    categoryResults,
    score,
    rawNormalizedScore: rawNormalizedScore === null ? null : clampScore(rawNormalizedScore),
    coveragePct,
    availableWeight,
    earnedPoints: Math.round(earnedPoints * 1000) / 1000,
    label: complete ? "READY" : "INCOMPLETE",
    disqualified,
    disqualifiers,
    components,
    window,
    discoveryRank: isFiniteNumber(input.discoveryRank) ? input.discoveryRank : null,
    dollarVolume,
    evaluatedAt,
    diagnostics,
  };
}

export function compareContinuationCandidates(
  a: ContinuationRankInput,
  b: ContinuationRankInput,
): number {
  const aScored = a.continuation.score !== null && a.continuation.label !== "INCOMPLETE";
  const bScored = b.continuation.score !== null && b.continuation.label !== "INCOMPLETE";
  if (aScored && !bScored) return -1;
  if (!aScored && bScored) return 1;
  if (!aScored && !bScored) return a.symbol.localeCompare(b.symbol);

  const scoreDiff = (b.continuation.score as number) - (a.continuation.score as number);
  if (scoreDiff !== 0) return scoreDiff;

  const aBest = Math.max(0, ...a.continuation.categories.map((item) => CONTINUATION_CATEGORY_PRIORITY[item]));
  const bBest = Math.max(0, ...b.continuation.categories.map((item) => CONTINUATION_CATEGORY_PRIORITY[item]));
  if (bBest !== aBest) return bBest - aBest;
  if (b.continuation.categories.length !== a.continuation.categories.length) {
    return b.continuation.categories.length - a.continuation.categories.length;
  }

  const aDollar = isFiniteNumber(a.dollarVolume) ? a.dollarVolume : Number.NEGATIVE_INFINITY;
  const bDollar = isFiniteNumber(b.dollarVolume) ? b.dollarVolume : Number.NEGATIVE_INFINITY;
  if (bDollar !== aDollar) return bDollar - aDollar;
  if (a.discoveryRank !== b.discoveryRank) return a.discoveryRank - b.discoveryRank;
  return a.symbol.localeCompare(b.symbol);
}

export function rankContinuationCandidates(
  candidates: readonly ContinuationRankInput[],
): ContinuationRankedCandidate[] {
  const sorted = [...candidates].sort(compareContinuationCandidates);
  let nextRank = 1;
  return sorted.map((candidate) => {
    const official =
      candidate.continuation.score !== null && candidate.continuation.label !== "INCOMPLETE";
    return { ...candidate, continuationRank: official ? nextRank++ : null };
  });
}

export function buildContinuationHandoff(
  result: ContinuationResult,
  options?: { generatedAt?: string | null; targetSessionDate?: string | null; continuationRank?: number | null },
): ContinuationHandoff {
  return {
    version: CONTINUATION_MODEL_VERSION,
    sourceSessionDate: result.sessionDate,
    targetSessionDate: options?.targetSessionDate ?? null,
    symbol: result.symbol,
    categories: result.categories,
    continuationScore: result.score,
    continuationRank: options?.continuationRank ?? null,
    discoveryRank: result.discoveryRank,
    tradeQualityScore: null,
    catalystContext: null,
    generatedAt: toCanonicalUtc(options?.generatedAt) ?? result.evaluatedAt,
    lifecycle: "next-session",
  };
}

export function isContinuationCategory(value: unknown): value is ContinuationCategory {
  return (
    value === "POWER_HOUR_MOMENTUM" ||
    value === "STRONG_CLOSE_NEAR_HOD" ||
    value === "AFTER_HOURS_CONTINUATION" ||
    value === "DAY_TWO_WATCH"
  );
}
