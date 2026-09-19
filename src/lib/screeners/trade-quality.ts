/**
 * Trade Quality Rank V1 — deterministic, explainable scoring engine.
 *
 * Secondary intelligence layer. Does NOT modify Discovery Rank or live screener ordering.
 */

import {
  TRADE_QUALITY_CATALYST_SCORES,
  TRADE_QUALITY_COMPONENT_WEIGHTS,
  TRADE_QUALITY_DOLLAR_VOLUME_TIERS,
  TRADE_QUALITY_FLOAT_TURNOVER_TIERS,
  TRADE_QUALITY_LABEL_TIERS,
  TRADE_QUALITY_MIN_COVERAGE_PCT,
  TRADE_QUALITY_MOVEMENT_TIERS,
  TRADE_QUALITY_PRICE_TIERS,
  TRADE_QUALITY_RVOL20D_TIERS,
  TRADE_QUALITY_SPREAD_TIERS,
  TRADE_QUALITY_TECHNICAL_SIGNAL_WEIGHTS,
  TRADE_QUALITY_TOTAL_WEIGHT,
  TRADE_QUALITY_VERSION,
  type NumericTier,
  type TradeQualityCatalystQuality,
  type TradeQualityComponentKey,
  type TradeQualityLabel,
} from "@/config/trade-quality.config";
import { isFiniteNumber, isPositiveFinite } from "@/lib/screeners/contract";
import { computeDollarVolume } from "@/lib/screeners/dollar-volume";
import type {
  TradeQualityComponentResult,
  TradeQualityComponents,
  TradeQualityInput,
  TradeQualityRankInput,
  TradeQualityRankedCandidate,
  TradeQualityResult,
  TradeQualityTriState,
} from "@/types/trade-quality";

function scoreFromNumericTiers(value: number, tiers: readonly NumericTier[]): number {
  for (const tier of tiers) {
    if (
      value >= tier.minInclusive &&
      (tier.maxExclusive === null || value < tier.maxExclusive)
    ) {
      return tier.score;
    }
  }
  return tiers[tiers.length - 1]?.score ?? 0;
}

function unavailableComponent(maxScore: number): TradeQualityComponentResult {
  return { available: false, rawValue: null, score: null, maxScore };
}

function availableComponent(
  rawValue: number | string,
  score: number,
  maxScore: number,
): TradeQualityComponentResult {
  return { available: true, rawValue, score, maxScore };
}

function scoreDollarVolume(input: TradeQualityInput): TradeQualityComponentResult {
  const maxScore = TRADE_QUALITY_COMPONENT_WEIGHTS.dollarVolume;
  const dollarVolume = computeDollarVolume(input.price, input.currentSessionVolume);
  if (dollarVolume === null) return unavailableComponent(maxScore);
  return availableComponent(
    dollarVolume,
    scoreFromNumericTiers(dollarVolume, TRADE_QUALITY_DOLLAR_VOLUME_TIERS),
    maxScore,
  );
}

function scoreMovement(input: TradeQualityInput): TradeQualityComponentResult {
  const maxScore = TRADE_QUALITY_COMPONENT_WEIGHTS.movement;
  const move = input.absoluteMovePct;
  if (!isFiniteNumber(move) || move < 0) return unavailableComponent(maxScore);
  return availableComponent(
    move,
    scoreFromNumericTiers(move, TRADE_QUALITY_MOVEMENT_TIERS),
    maxScore,
  );
}

function scoreCatalyst(input: TradeQualityInput): TradeQualityComponentResult {
  const maxScore = TRADE_QUALITY_COMPONENT_WEIGHTS.catalyst;
  const quality = input.catalystQuality;
  if (quality == null || quality === "UNKNOWN") return unavailableComponent(maxScore);
  const score = TRADE_QUALITY_CATALYST_SCORES[quality as Exclude<TradeQualityCatalystQuality, "UNKNOWN">];
  return availableComponent(quality, score, maxScore);
}

function scoreSpread(input: TradeQualityInput): TradeQualityComponentResult {
  const maxScore = TRADE_QUALITY_COMPONENT_WEIGHTS.spread;
  const bid = input.bid;
  const ask = input.ask;
  if (!isPositiveFinite(bid) || !isPositiveFinite(ask) || ask < bid) {
    return unavailableComponent(maxScore);
  }
  const midpoint = (bid + ask) / 2;
  if (!isPositiveFinite(midpoint)) return unavailableComponent(maxScore);
  const spreadPct = ((ask - bid) / midpoint) * 100;
  if (!Number.isFinite(spreadPct) || spreadPct < 0) return unavailableComponent(maxScore);
  return availableComponent(
    spreadPct,
    scoreFromNumericTiers(spreadPct, TRADE_QUALITY_SPREAD_TIERS),
    maxScore,
  );
}

function resolveTriState(state: TradeQualityTriState | undefined): TradeQualityTriState {
  return state ?? "UNKNOWN";
}

function scoreTechnical(input: TradeQualityInput): TradeQualityComponentResult {
  const configuredMax = TRADE_QUALITY_COMPONENT_WEIGHTS.technical;
  const signals = input.technical ?? {};
  let availableWeight = 0;
  let earnedPoints = 0;

  for (const [key, weight] of Object.entries(TRADE_QUALITY_TECHNICAL_SIGNAL_WEIGHTS) as Array<
    [keyof typeof TRADE_QUALITY_TECHNICAL_SIGNAL_WEIGHTS, number]
  >) {
    const state = resolveTriState(signals[key]);
    if (state === "UNKNOWN") continue;
    availableWeight += weight;
    if (state === "TRUE") earnedPoints += weight;
  }

  if (availableWeight === 0) {
    return unavailableComponent(configuredMax);
  }

  return {
    available: true,
    rawValue: `${earnedPoints}/${availableWeight}`,
    score: earnedPoints,
    maxScore: availableWeight,
  };
}

function scoreFloatTurnover(input: TradeQualityInput): TradeQualityComponentResult {
  const maxScore = TRADE_QUALITY_COMPONENT_WEIGHTS.floatTurnover;
  const volume = input.currentSessionVolume;
  const floatShares = input.publicFloat;
  if (!isFiniteNumber(volume) || volume < 0 || !isPositiveFinite(floatShares)) {
    return unavailableComponent(maxScore);
  }
  const turnover = volume / floatShares;
  if (!Number.isFinite(turnover) || turnover < 0) return unavailableComponent(maxScore);
  return availableComponent(
    turnover,
    scoreFromNumericTiers(turnover, TRADE_QUALITY_FLOAT_TURNOVER_TIERS),
    maxScore,
  );
}

function scoreRvol20d(input: TradeQualityInput): TradeQualityComponentResult {
  const maxScore = TRADE_QUALITY_COMPONENT_WEIGHTS.rvol20d;
  const rvol = input.rvol20d;
  if (!isFiniteNumber(rvol) || rvol < 0) return unavailableComponent(maxScore);
  return availableComponent(
    rvol,
    scoreFromNumericTiers(rvol, TRADE_QUALITY_RVOL20D_TIERS),
    maxScore,
  );
}

function scorePrice(input: TradeQualityInput): TradeQualityComponentResult {
  const maxScore = TRADE_QUALITY_COMPONENT_WEIGHTS.price;
  const price = input.price;
  if (!isPositiveFinite(price)) return unavailableComponent(maxScore);
  return availableComponent(
    price,
    scoreFromNumericTiers(price, TRADE_QUALITY_PRICE_TIERS),
    maxScore,
  );
}

function resolveLabel(
  score: number | null,
  coveragePct: number,
  minCoveragePct: number,
): TradeQualityLabel {
  if (coveragePct < minCoveragePct || score === null) return "INCOMPLETE";
  for (const tier of TRADE_QUALITY_LABEL_TIERS) {
    if (score >= tier.minInclusive) return tier.label;
  }
  return "LOW_QUALITY";
}

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * Compute Trade Quality V1 for a single candidate.
 * Pure function — no data fabrication, no side effects.
 */
export function calculateTradeQuality(
  input: TradeQualityInput,
  options?: { minCoveragePct?: number },
): TradeQualityResult {
  const minCoveragePct = options?.minCoveragePct ?? TRADE_QUALITY_MIN_COVERAGE_PCT;

  const components: TradeQualityComponents = {
    dollarVolume: scoreDollarVolume(input),
    movement: scoreMovement(input),
    catalyst: scoreCatalyst(input),
    spread: scoreSpread(input),
    technical: scoreTechnical(input),
    floatTurnover: scoreFloatTurnover(input),
    rvol20d: scoreRvol20d(input),
    price: scorePrice(input),
  };

  let availableWeight = 0;
  let earnedPoints = 0;

  for (const key of Object.keys(TRADE_QUALITY_COMPONENT_WEIGHTS) as TradeQualityComponentKey[]) {
    const component = components[key];
    if (!component.available || component.score === null) continue;
    const configuredWeight = TRADE_QUALITY_COMPONENT_WEIGHTS[key];
    const effectiveMax = component.maxScore;
    const scaledScore = (component.score / effectiveMax) * configuredWeight;
    availableWeight += configuredWeight;
    earnedPoints += scaledScore;
  }

  const coveragePct =
    TRADE_QUALITY_TOTAL_WEIGHT === 0
      ? 0
      : Math.round((availableWeight / TRADE_QUALITY_TOTAL_WEIGHT) * 1000) / 10;

  const rawNormalizedScore =
    availableWeight === 0 ? null : (earnedPoints / availableWeight) * 100;

  const meetsCoverage = coveragePct >= minCoveragePct && rawNormalizedScore !== null;
  const score = meetsCoverage ? clampScore(rawNormalizedScore) : null;
  const label = resolveLabel(score, coveragePct, minCoveragePct);

  return {
    version: TRADE_QUALITY_VERSION,
    score,
    rawNormalizedScore: rawNormalizedScore === null ? null : clampScore(rawNormalizedScore),
    coveragePct,
    label,
    availableWeight,
    earnedPoints: Math.round(earnedPoints * 1000) / 1000,
    components,
  };
}

/**
 * Compare two Trade Quality results for deterministic sorting.
 * INCOMPLETE results sort after all scored results.
 *
 * Tie-break (when both have official scores):
 * 1. higher tradeQualityScore
 * 2. higher dollarVolume
 * 3. higher currentSessionVolume
 * 4. lower discoveryRank (preserves Discovery precedence as secondary signal)
 * 5. symbol ascending
 */
export function compareTradeQualityCandidates(
  a: TradeQualityRankInput,
  b: TradeQualityRankInput,
): number {
  const aScored = a.tradeQuality.score !== null && a.tradeQuality.label !== "INCOMPLETE";
  const bScored = b.tradeQuality.score !== null && b.tradeQuality.label !== "INCOMPLETE";

  if (aScored && !bScored) return -1;
  if (!aScored && bScored) return 1;
  if (!aScored && !bScored) return a.symbol.localeCompare(b.symbol);

  const scoreDiff = (b.tradeQuality.score as number) - (a.tradeQuality.score as number);
  if (scoreDiff !== 0) return scoreDiff;

  const aDollar = isFiniteNumber(a.dollarVolume) ? a.dollarVolume : Number.NEGATIVE_INFINITY;
  const bDollar = isFiniteNumber(b.dollarVolume) ? b.dollarVolume : Number.NEGATIVE_INFINITY;
  if (bDollar !== aDollar) return bDollar - aDollar;

  const aVol = isFiniteNumber(a.currentSessionVolume)
    ? a.currentSessionVolume
    : Number.NEGATIVE_INFINITY;
  const bVol = isFiniteNumber(b.currentSessionVolume)
    ? b.currentSessionVolume
    : Number.NEGATIVE_INFINITY;
  if (bVol !== aVol) return bVol - aVol;

  if (a.discoveryRank !== b.discoveryRank) return a.discoveryRank - b.discoveryRank;

  return a.symbol.localeCompare(b.symbol);
}

/**
 * Assign 1-based Trade Quality ranks without mutating input candidates or Discovery ranks.
 * INCOMPLETE candidates receive tradeQualityRank = null.
 */
export function rankTradeQualityCandidates(
  candidates: readonly TradeQualityRankInput[],
): TradeQualityRankedCandidate[] {
  const sorted = [...candidates].sort(compareTradeQualityCandidates);
  let nextRank = 1;

  return sorted.map((candidate) => {
    const hasOfficialScore =
      candidate.tradeQuality.score !== null && candidate.tradeQuality.label !== "INCOMPLETE";
    return {
      ...candidate,
      tradeQualityRank: hasOfficialScore ? nextRank++ : null,
    };
  });
}
