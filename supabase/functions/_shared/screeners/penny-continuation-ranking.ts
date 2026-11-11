import {
  PENNY_CATALYST_MAX_AGE_HOURS_RANK,
  PENNY_FLOAT_TURNOVER_TIER_A,
  PENNY_HOD_TIER_A_MAX_PCT,
  PENNY_MIN_TIME_ADJUSTED_RVOL_RANK,
  PENNY_SCORE_TOTAL_WEIGHT,
  PENNY_SCORE_WEIGHTS,
} from "../config/penny-continuation.config.ts";
import type { ContinuationTriState } from "./continuation-types.ts";
import { isFiniteNumber, isPositiveFinite } from "./screener-contract-lite.ts";
import { evaluatePennyCoreSignalCS2 } from "./penny-continuation-signals.ts";
import type {
  PennyContinuationInput,
  PennyContinuationResult,
} from "./penny-continuation-types.ts";

function tri(value: ContinuationTriState | null | undefined): ContinuationTriState {
  return value ?? "UNKNOWN";
}

export function computePennyContinuationScore(
  input: PennyContinuationInput,
  coveragePenalty: number,
): { score: number | null; coveragePct: number } {
  let availableWeight = 0;
  let earned = 0;

  if (isFiniteNumber(input.sharesPerMinute10m)) {
    availableWeight += PENNY_SCORE_WEIGHTS.sharesPerMinute;
    const norm = Math.min(100, (input.sharesPerMinute10m / 100_000) * 100);
    earned += (PENNY_SCORE_WEIGHTS.sharesPerMinute * norm) / 100;
  }

  if (isFiniteNumber(input.sessionVolumeShares)) {
    availableWeight += PENNY_SCORE_WEIGHTS.sessionVolume;
    const norm = Math.min(100, (input.sessionVolumeShares / 5_000_000) * 100);
    earned += (PENNY_SCORE_WEIGHTS.sessionVolume * norm) / 100;
  }

  if (isFiniteNumber(input.dollarVolume)) {
    availableWeight += PENNY_SCORE_WEIGHTS.dollarVolume;
    const norm = Math.min(100, (input.dollarVolume / 2_000_000) * 100);
    earned += (PENNY_SCORE_WEIGHTS.dollarVolume * norm) / 100;
  }

  if (isFiniteNumber(input.distanceFromHodPct)) {
    availableWeight += PENNY_SCORE_WEIGHTS.hodProximity;
    const hodScore =
      input.distanceFromHodPct <= PENNY_HOD_TIER_A_MAX_PCT
        ? 100
        : input.distanceFromHodPct <= 12
        ? 60
        : 20;
    earned += (PENNY_SCORE_WEIGHTS.hodProximity * hodScore) / 100;
  }

  if (evaluatePennyCoreSignalCS2(input) !== "UNKNOWN") {
    availableWeight += PENNY_SCORE_WEIGHTS.vwapStructure;
    const vwapScore = evaluatePennyCoreSignalCS2(input) === "PASS" ? 100 : 25;
    earned += (PENNY_SCORE_WEIGHTS.vwapStructure * vwapScore) / 100;
  }

  if (
    tri(input.catalystVerified) === "TRUE" &&
    isFiniteNumber(input.catalystAgeHours) &&
    input.catalystAgeHours <= PENNY_CATALYST_MAX_AGE_HOURS_RANK
  ) {
    availableWeight += PENNY_SCORE_WEIGHTS.catalystFreshness;
    earned += PENNY_SCORE_WEIGHTS.catalystFreshness;
  }

  if (availableWeight === 0) {
    return { score: null, coveragePct: 0 };
  }

  const coveragePct = Math.round(
    Math.max(
      0,
      Math.min(100, (availableWeight / PENNY_SCORE_TOTAL_WEIGHT) * 100 - coveragePenalty),
    ),
  );
  const score = Math.round((earned / availableWeight) * coveragePct);
  return { score, coveragePct };
}

/** Optional rank boost signals — never invented. */
export function pennyOptionalRankBonuses(input: PennyContinuationInput): number {
  let bonus = 0;
  if (
    isFiniteNumber(input.timeAdjustedRvol) &&
    input.timeAdjustedRvol >= PENNY_MIN_TIME_ADJUSTED_RVOL_RANK &&
    input.rvolConfidence !== "UNAVAILABLE" &&
    input.rvolConfidence !== undefined
  ) {
    bonus += 2;
  }
  if (
    input.floatVerified &&
    isPositiveFinite(input.floatTurnover) &&
    input.floatTurnover! >= PENNY_FLOAT_TURNOVER_TIER_A
  ) {
    bonus += 1;
  }
  return bonus;
}

export function comparePennyContinuationRank(a: PennyContinuationResult, b: PennyContinuationResult): number {
  const shA = a.rankKeys.sharesPerMinute ?? -1;
  const shB = b.rankKeys.sharesPerMinute ?? -1;
  if (shB !== shA) return shB - shA;

  const volA = a.rankKeys.sessionVolume ?? -1;
  const volB = b.rankKeys.sessionVolume ?? -1;
  if (volB !== volA) return volB - volA;

  const dolA = a.rankKeys.dollarVolume ?? -1;
  const dolB = b.rankKeys.dollarVolume ?? -1;
  if (dolB !== dolA) return dolB - dolA;

  const scoreA = a.score ?? -1;
  const scoreB = b.score ?? -1;
  if (scoreB !== scoreA) return scoreB - scoreA;

  return a.symbol.localeCompare(b.symbol);
}

export function rankPennyContinuationCandidates(
  results: PennyContinuationResult[],
): PennyContinuationResult[] {
  return [...results].sort(comparePennyContinuationRank);
}
