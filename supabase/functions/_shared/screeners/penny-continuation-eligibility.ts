import { CONTINUATION_EXCLUDED_INSTRUMENT_TYPES } from "../config/continuation.config.ts";
import {
  PENNY_MAX_ELIGIBLE_PRICE,
  PENNY_MAX_SPREAD_PCT,
  PENNY_MIN_DOLLAR_VOLUME,
  PENNY_MIN_ELIGIBLE_PRICE,
  PENNY_MIN_MOVE_PCT,
  PENNY_MIN_SESSION_SHARES,
  PENNY_MIN_SHARES_PER_MINUTE,
} from "../config/penny-continuation.config.ts";
import { OVERNIGHT_SCANNER_PIPELINE_READY } from "../markets/equity-session-control.ts";
import { isFiniteNumber, isPositiveFinite } from "./screener-contract-lite.ts";
import { assessPennySymbolFreshness } from "./penny-continuation-freshness.ts";
import type {
  PennyContinuationInput,
  PennyEligibilityResult,
  PennyReasonCode,
} from "./penny-continuation-types.ts";

export function pennyPriceEligible(price: number | null | undefined): boolean {
  if (!isPositiveFinite(price)) return false;
  return price! > PENNY_MIN_ELIGIBLE_PRICE && price! < PENNY_MAX_ELIGIBLE_PRICE;
}

export function evaluatePennyContinuationEligibility(
  input: PennyContinuationInput,
): PennyEligibilityResult {
  const reasons: PennyReasonCode[] = [];
  let spreadUnavailable = false;
  let coveragePenalty = 0;

  if (!pennyPriceEligible(input.price)) {
    reasons.push("PRICE_OUT_OF_BAND");
    return { passed: false, reasons, spreadUnavailable, coveragePenalty };
  }

  const freshness = assessPennySymbolFreshness(input.freshness);
  if (freshness.hardFail) {
    return {
      passed: false,
      reasons: [...reasons, ...freshness.reasons],
      spreadUnavailable,
      coveragePenalty,
    };
  }

  if (input.impliesSplitScale) {
    reasons.push("SPLIT_SCALE_GUARD");
    return { passed: false, reasons, spreadUnavailable, coveragePenalty };
  }

  const instrument = input.instrumentType?.trim().toUpperCase();
  if (
    instrument &&
    CONTINUATION_EXCLUDED_INSTRUMENT_TYPES.includes(
      instrument as (typeof CONTINUATION_EXCLUDED_INSTRUMENT_TYPES)[number],
    )
  ) {
    reasons.push("EXCLUDED_INSTRUMENT");
    return { passed: false, reasons, spreadUnavailable, coveragePenalty };
  }

  if (
    input.observationSessionKind === "overnight" &&
    !OVERNIGHT_SCANNER_PIPELINE_READY
  ) {
    reasons.push("OVERNIGHT_VOLUME_UNVERIFIED");
    return { passed: false, reasons, spreadUnavailable, coveragePenalty };
  }

  const sessionVol = input.sessionVolumeShares;
  if (sessionVol === null) {
    reasons.push("SESSION_VOLUME_UNAVAILABLE");
    return { passed: false, reasons, spreadUnavailable, coveragePenalty };
  }
  if (sessionVol < PENNY_MIN_SESSION_SHARES) {
    reasons.push("SESSION_VOLUME_LOW");
    return { passed: false, reasons, spreadUnavailable, coveragePenalty };
  }

  const dollar = input.dollarVolume;
  if (!isFiniteNumber(dollar) || dollar < PENNY_MIN_DOLLAR_VOLUME) {
    reasons.push("DOLLAR_VOLUME_LOW");
    return { passed: false, reasons, spreadUnavailable, coveragePenalty };
  }

  const move = input.movePercentVsPriorClose;
  if (move === null) {
    reasons.push("MOVE_UNAVAILABLE");
    return { passed: false, reasons, spreadUnavailable, coveragePenalty };
  }
  if (move < PENNY_MIN_MOVE_PCT) {
    reasons.push("MOVE_TOO_SMALL");
    return { passed: false, reasons, spreadUnavailable, coveragePenalty };
  }

  if (isFiniteNumber(input.spreadPct)) {
    if (input.spreadPct > PENNY_MAX_SPREAD_PCT) {
      reasons.push("SPREAD_WIDE");
      return { passed: false, reasons, spreadUnavailable, coveragePenalty };
    }
  } else {
    spreadUnavailable = true;
    reasons.push("SPREAD_UNAVAILABLE");
    coveragePenalty += 5;
  }

  const shMin = input.sharesPerMinute10m;
  if (!isFiniteNumber(shMin) || shMin < PENNY_MIN_SHARES_PER_MINUTE) {
    reasons.push("VELOCITY_LOW");
    return { passed: false, reasons, spreadUnavailable, coveragePenalty };
  }

  return { passed: true, reasons, spreadUnavailable, coveragePenalty };
}
