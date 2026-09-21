/**
 * Screener Trade Quality Rank V1 adapter.
 *
 * Maps Data Quality envelopes onto the existing Trade Quality engine.
 * Does not reorder Discovery, fabricate missing inputs, or change weights.
 */

import { TRADE_QUALITY_TOTAL_WEIGHT, type TradeQualityComponentKey } from "@/config/trade-quality.config";
import { isUsableForScoring } from "@/lib/screeners/data-quality";
import { calculateTradeQuality } from "@/lib/screeners/trade-quality";
import {
  toScreenerDollarVolumeValue,
  toScreenerMoveValue,
  toScreenerPriceValue,
  toScreenerRvol20dValue,
  toScreenerVolumeValue,
  type ScreenerMetricObservation,
} from "@/lib/screeners/screener-data-quality";
import type { DataValue } from "@/types/data-quality";
import type {
  TradeQualityCatalystQuality,
  TradeQualityInput,
  TradeQualityLabel,
  TradeQualityResult,
  TradeQualityTechnicalInput,
} from "@/types/trade-quality";
import type { ScreenerResultRow } from "@/lib/screeners/contract";

export interface ScreenerTradeQualityValues {
  price: DataValue<number>;
  volume: DataValue<number>;
  dollarVolume: DataValue<number>;
  movePct: DataValue<number>;
  rvol20d: DataValue<number>;
  bid?: DataValue<number>;
  ask?: DataValue<number>;
  publicFloat?: DataValue<number>;
  catalystQuality?: DataValue<TradeQualityCatalystQuality>;
  technical?: DataValue<TradeQualityTechnicalInput>;
}

export interface ScreenerTradeQualityView {
  result: TradeQualityResult;
  score: number | null;
  coverage: number;
  status: TradeQualityLabel;
  usableWeight: number;
  totalWeight: number;
  components: TradeQualityResult["components"];
  missingComponents: TradeQualityComponentKey[];
}

const SCORING_OBSERVATION: ScreenerMetricObservation = { freshnessState: "FRESH" };

function scoringNumber(value: DataValue<number> | undefined): number | null {
  if (!value || !isUsableForScoring(value) || value.value === null) return null;
  return value.value;
}

export function calculateScreenerTradeQuality(
  values: ScreenerTradeQualityValues,
): TradeQualityResult {
  const price = scoringNumber(values.price);
  const volume = scoringNumber(values.volume);
  const dollarUsable = isUsableForScoring(values.dollarVolume);
  const floatUsable = values.publicFloat ? isUsableForScoring(values.publicFloat) : false;
  const move = scoringNumber(values.movePct);
  const rvol = scoringNumber(values.rvol20d);
  const bid = scoringNumber(values.bid);
  const ask = scoringNumber(values.ask);
  const publicFloat = scoringNumber(values.publicFloat);

  const input: TradeQualityInput = {
    price,
    currentSessionVolume: dollarUsable || floatUsable ? volume : null,
    absoluteMovePct: move === null ? null : Math.abs(move),
    rvol20d: rvol,
    bid,
    ask,
    publicFloat,
  };

  if (values.catalystQuality && isUsableForScoring(values.catalystQuality) && values.catalystQuality.value) {
    input.catalystQuality = values.catalystQuality.value;
  }
  if (values.technical && isUsableForScoring(values.technical) && values.technical.value) {
    input.technical = values.technical.value;
  }

  return calculateTradeQuality(input);
}

export function toScreenerTradeQualityView(result: TradeQualityResult): ScreenerTradeQualityView {
  const missingComponents = (Object.keys(result.components) as TradeQualityComponentKey[]).filter(
    (key) => !result.components[key].available,
  );
  return {
    result,
    score: result.label === "INCOMPLETE" ? null : result.score,
    coverage: result.coveragePct,
    status: result.label,
    usableWeight: result.availableWeight,
    totalWeight: TRADE_QUALITY_TOTAL_WEIGHT,
    components: result.components,
    missingComponents,
  };
}

export function screenerTradeQualityValuesFromRow(
  row: Partial<
    Pick<
      ScreenerResultRow,
      "price" | "volume" | "rvol_20d" | "change_percent" | "gap_percent" | "provider_as_of" | "updated_at"
    >
  >,
  observation: ScreenerMetricObservation = SCORING_OBSERVATION,
): ScreenerTradeQualityValues {
  const obs: ScreenerMetricObservation = {
    provider_as_of: row.provider_as_of,
    updated_at: row.updated_at,
    freshnessState: "FRESH",
    ...observation,
  };
  const move = row.change_percent ?? row.gap_percent;
  return {
    price: toScreenerPriceValue(row.price, obs),
    volume: toScreenerVolumeValue(row.volume, obs),
    dollarVolume: toScreenerDollarVolumeValue(row.price, row.volume, obs),
    movePct: toScreenerMoveValue(move, obs),
    rvol20d: toScreenerRvol20dValue(row.rvol_20d, obs),
  };
}

export function evaluateScreenerTradeQuality(
  row: Partial<
    Pick<
      ScreenerResultRow,
      "price" | "volume" | "rvol_20d" | "change_percent" | "gap_percent" | "provider_as_of" | "updated_at"
    >
  >,
  observation?: ScreenerMetricObservation,
): ScreenerTradeQualityView {
  return toScreenerTradeQualityView(
    calculateScreenerTradeQuality(screenerTradeQualityValuesFromRow(row, observation ?? SCORING_OBSERVATION)),
  );
}

export function formatScreenerTradeQuality(view: ScreenerTradeQualityView): string {
  if (view.status === "INCOMPLETE" || view.score === null) return "—";
  return String(view.score);
}

export function formatScreenerTradeQualityFromRow(
  row: Pick<
    ScreenerResultRow,
    "price" | "volume" | "rvol_20d" | "change_percent" | "gap_percent" | "provider_as_of" | "updated_at"
  >,
  observation?: ScreenerMetricObservation,
): string {
  return formatScreenerTradeQuality(evaluateScreenerTradeQuality(row, observation));
}
