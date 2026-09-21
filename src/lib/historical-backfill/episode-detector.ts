/**
 * First daily episode candidate detector.
 * Thresholds are conservative placeholders, not a claim of optimal cuts.
 * NORMAL is a classification only. Callers must not persist it.
 */

import type { HistoricalBackfillConfig } from "@/config/historical-backfill.config";
import type { EpisodeDirection } from "@/config/security-intelligence.config";
import type { DailyEpisodeDetection } from "@/types/historical-backfill";

export interface DailyDetectorInput {
  open: number;
  high: number;
  low: number;
  close: number;
  movePct: number | null;
  dollarVolume: number | null;
  rvol: number | null;
  previousClose: number | null;
}

function absMove(input: DailyDetectorInput): number | null {
  if (input.movePct === null || !Number.isFinite(input.movePct)) return null;
  return Math.abs(input.movePct);
}

function rangePct(input: DailyDetectorInput): number | null {
  const base = input.previousClose !== null && input.previousClose > 0
    ? input.previousClose
    : input.open > 0
      ? input.open
      : null;
  if (base === null) return null;
  const range = ((input.high - input.low) / base) * 100;
  return Number.isFinite(range) ? range : null;
}

function directionFor(input: DailyDetectorInput): EpisodeDirection {
  if (input.movePct !== null && Number.isFinite(input.movePct)) {
    if (input.movePct > 0) return "POSITIVE";
    if (input.movePct < 0) return "NEGATIVE";
    return "MIXED";
  }
  if (input.close > input.open) return "POSITIVE";
  if (input.close < input.open) return "NEGATIVE";
  return "MIXED";
}

export function detectDailyEpisode(
  input: DailyDetectorInput,
  config: Pick<
    HistoricalBackfillConfig,
    | "notableAbsMovePct"
    | "significantAbsMovePct"
    | "extremeAbsMovePct"
    | "notableRvol"
    | "significantRvol"
    | "extremeRvol"
    | "notableDollarVolume"
    | "significantDollarVolume"
    | "extremeDollarVolume"
    | "notableRangePct"
    | "significantRangePct"
    | "extremeRangePct"
  >,
): DailyEpisodeDetection {
  const move = absMove(input);
  const range = rangePct(input);
  const reasons: string[] = [];
  let tier: DailyEpisodeDetection["tier"] = "NORMAL";

  const extreme = (move !== null && move >= config.extremeAbsMovePct)
    || (input.rvol !== null && input.rvol >= config.extremeRvol && move !== null && move >= 20)
    || (range !== null && range >= config.extremeRangePct);
  const significant = (move !== null && move >= config.significantAbsMovePct)
    || (input.rvol !== null && input.rvol >= config.significantRvol && move !== null && move >= 10)
    || (input.dollarVolume !== null && input.dollarVolume >= config.significantDollarVolume && move !== null && move >= 10)
    || (range !== null && range >= config.significantRangePct);
  const notable = (move !== null && move >= config.notableAbsMovePct)
    || (input.rvol !== null && input.rvol >= config.notableRvol && move !== null && move >= 5)
    || (input.dollarVolume !== null && input.dollarVolume >= config.notableDollarVolume && move !== null && move >= 5)
    || (range !== null && range >= config.notableRangePct);

  if (extreme) {
    tier = "EXTREME";
    reasons.push("extreme daily threshold");
  } else if (significant) {
    tier = "SIGNIFICANT";
    reasons.push("significant daily threshold");
  } else if (notable) {
    tier = "NOTABLE";
    reasons.push("notable daily threshold");
  }

  const base = input.previousClose !== null && input.previousClose > 0 ? input.previousClose : null;
  const maxPositiveMovePct = base !== null && input.high >= base ? ((input.high - base) / base) * 100 : null;
  const maxNegativeMovePct = base !== null && input.low <= base ? ((input.low - base) / base) * 100 : null;

  return {
    tier,
    direction: directionFor(input),
    reasons,
    maxPositiveMovePct,
    maxNegativeMovePct,
    rangePct: range,
  };
}
