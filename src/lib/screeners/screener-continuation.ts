/**
 * Screener Continuation / Day-Two V1 adapter.
 *
 * Maps Data Quality-usable row inputs into the existing continuation engine.
 * Does not rank Discovery, filter rows, or persist an AM Inbox handoff.
 *
 * Live hod distance, 5-minute acceleration, and VWAP side are not close,
 * late-session, or technical evidence and are not read.
 */

import type { ContinuationCategory, ContinuationVelocityState } from "@/config/continuation.config";
import type { TradeQualityCatalystQuality } from "@/config/trade-quality.config";
import { isUsableForScoring } from "@/lib/screeners/data-quality";
import { evaluateContinuation } from "@/lib/screeners/continuation";
import {
  toScreenerDollarVolumeValue,
  toScreenerRvol20dValue,
  type ScreenerMetricObservation,
} from "@/lib/screeners/screener-data-quality";
import { evaluateScreenerTradeQuality } from "@/lib/screeners/screener-trade-quality";
import type { DataFreshnessState } from "@/types/data-quality";
import type { ContinuationInput, ContinuationResult, ContinuationTriState } from "@/types/continuation";

export interface ScreenerContinuationSource {
  symbol: string;
  price?: number | null;
  volume?: number | null;
  rvol_20d?: number | null;
  change_percent?: number | null;
  gap_percent?: number | null;
  provider_as_of?: string | null;
  updated_at?: string | null;
  radar_trading_date?: string | null;
  /** Current intraday distance. Ignored. Not a close print. */
  hod_distance_percent?: number | null;
  /** Short-window acceleration. Ignored. Not late-session velocity. */
  acceleration_5m?: number | null;
  /** Unverified VWAP side. Ignored. */
  vwap_side?: string | null;
  session_vwap?: number | null;
  day_high?: number | null;
  late_session_volume_velocity?: ContinuationVelocityState | null;
  close_distance_from_hod_pct?: number | null;
  after_hours_extends?: ContinuationTriState | null;
  continuation_catalyst_quality?: TradeQualityCatalystQuality | null;
}

export interface ScreenerContinuationOptions {
  freshnessState?: DataFreshnessState;
}

export interface ScreenerContinuationView {
  result: ContinuationResult;
  display: string;
  title: string;
}

const CATEGORY_LABELS: Record<ContinuationCategory, string> = {
  POWER_HOUR_MOMENTUM: "Power Hour",
  STRONG_CLOSE_NEAR_HOD: "Strong Close",
  AFTER_HOURS_CONTINUATION: "After Hours",
  DAY_TWO_WATCH: "Day-Two",
};

function observationFor(
  row: ScreenerContinuationSource,
  options?: ScreenerContinuationOptions,
): ScreenerMetricObservation {
  return {
    provider_as_of: row.provider_as_of ?? null,
    updated_at: row.updated_at ?? null,
    freshnessState: options?.freshnessState ?? "UNKNOWN",
  };
}

export function toContinuationInput(
  row: ScreenerContinuationSource,
  options?: ScreenerContinuationOptions,
): ContinuationInput {
  const observation = observationFor(row, options);
  const dollarVolume = toScreenerDollarVolumeValue(row.price, row.volume, observation);
  const rvol20d = toScreenerRvol20dValue(row.rvol_20d, observation);
  const tradeQuality = evaluateScreenerTradeQuality(row, observation);
  const input: ContinuationInput = {
    symbol: row.symbol,
    sessionDate: row.radar_trading_date ?? "",
    observedAt: row.provider_as_of ?? "",
  };

  if (isUsableForScoring(dollarVolume) && dollarVolume.value !== null) {
    input.dollarVolume = dollarVolume.value;
  }
  if (isUsableForScoring(rvol20d) && rvol20d.value !== null) {
    input.rvol20d = rvol20d.value;
  }
  if (tradeQuality.score !== null && tradeQuality.status !== "INCOMPLETE") {
    input.tradeQualityScore = tradeQuality.score;
    input.tradeQualityCoverage = tradeQuality.coverage;
    input.tradeQualityLabel = tradeQuality.status;
  }
  if (row.late_session_volume_velocity) {
    input.volumeVelocity = row.late_session_volume_velocity;
  }
  if (typeof row.close_distance_from_hod_pct === "number") {
    input.distanceFromHodPct = row.close_distance_from_hod_pct;
  }
  if (row.after_hours_extends) {
    input.afterHoursExtendsSession = row.after_hours_extends;
  }
  if (row.continuation_catalyst_quality) {
    input.catalystQuality = row.continuation_catalyst_quality;
  }
  return input;
}

export function formatContinuationDisplay(result: ContinuationResult): string {
  if (result.label !== "READY" || result.disqualified || result.categories.length === 0) return "—";
  return result.categories.map((category) => CATEGORY_LABELS[category]).join(" · ");
}

export function continuationTitle(result: ContinuationResult): string {
  const display = formatContinuationDisplay(result);
  return display === "—" ? "Continuation unavailable" : display;
}

export function evaluateScreenerContinuation(
  row: ScreenerContinuationSource,
  options?: ScreenerContinuationOptions,
): ScreenerContinuationView {
  const result = evaluateContinuation(toContinuationInput(row, options));
  return {
    result,
    display: formatContinuationDisplay(result),
    title: continuationTitle(result),
  };
}

export function formatScreenerContinuationFromRow(
  row: ScreenerContinuationSource,
  options?: ScreenerContinuationOptions,
): string {
  return evaluateScreenerContinuation(row, options).display;
}
