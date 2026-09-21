/**
 * Production screener Filters V1 adapter.
 *
 * Applies the existing filter engine AFTER Discovery ranking.
 * Only Data Quality-usable values participate. Does not re-rank or fabricate.
 */

import { SCREENER_FILTER_VERSION } from "@/config/screener-filters.config";
import { isUsableForFiltering } from "@/lib/screeners/data-quality";
import { applyScreenerFilters } from "@/lib/screeners/filters";
import {
  toScreenerDollarVolumeValue,
  toScreenerMoveValue,
  toScreenerPriceValue,
  toScreenerRvol20dValue,
  toScreenerVolumeValue,
  type ScreenerMetricObservation,
} from "@/lib/screeners/screener-data-quality";
import { evaluateScreenerTradeQuality } from "@/lib/screeners/screener-trade-quality";
import type { DataValue } from "@/types/data-quality";
import type {
  ScreenerFilterCandidate,
  ScreenerFilterClause,
  ScreenerFilterSet,
} from "@/types/screener-filters";
import type { ScreenerResultRow } from "@/lib/screeners/contract";

export const FILTERING_OBSERVATION: ScreenerMetricObservation = { freshnessState: "FRESH" };

export interface ScreenerFilterDraft {
  minPrice: string;
  maxPrice: string;
  minVolume: string;
  minDollarVolume: string;
  minMovePct: string;
  minRvol20d: string;
}

export const EMPTY_SCREENER_FILTER_DRAFT: ScreenerFilterDraft = {
  minPrice: "",
  maxPrice: "",
  minVolume: "",
  minDollarVolume: "",
  minMovePct: "",
  minRvol20d: "",
};

export const ACTIVE_SCREENER_FILTER_FIELDS = [
  "price",
  "currentSessionVolume",
  "dollarVolume",
  "movePct",
  "rvol20d",
] as const;

export const DORMANT_SCREENER_FILTER_LABELS = [
  "Absolute Move",
  "Vol/Prior",
  "Float",
  "Float Turnover",
  "Trade Quality",
  "Catalyst",
  "Spread %",
  "Market Cap",
  "VWAP",
  "HOD Distance",
  "Instrument Type",
  "Session State",
] as const;

function filterNumber(value: DataValue<number> | undefined): number | null {
  if (!value || !isUsableForFiltering(value) || value.value === null) return null;
  return value.value;
}

export function parseScreenerFilterInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function countActiveScreenerFilters(draft: ScreenerFilterDraft): number {
  return (Object.keys(draft) as Array<keyof ScreenerFilterDraft>).filter(
    (key) => parseScreenerFilterInput(draft[key]) !== null,
  ).length;
}

export function screenerFilterSetFromDraft(
  draft: ScreenerFilterDraft,
  id = "screener-filters-v1",
): ScreenerFilterSet {
  const filters: ScreenerFilterClause[] = [];
  const minPrice = parseScreenerFilterInput(draft.minPrice);
  const maxPrice = parseScreenerFilterInput(draft.maxPrice);
  if (minPrice !== null && maxPrice !== null) {
    filters.push({ id: "price-band", field: "price", operator: "BETWEEN", min: minPrice, max: maxPrice });
  } else if (minPrice !== null) {
    filters.push({ id: "min-price", field: "price", operator: "GTE", value: minPrice });
  } else if (maxPrice !== null) {
    filters.push({ id: "max-price", field: "price", operator: "LTE", value: maxPrice });
  }

  const minVolume = parseScreenerFilterInput(draft.minVolume);
  if (minVolume !== null) {
    filters.push({
      id: "min-volume",
      field: "currentSessionVolume",
      operator: "GTE",
      value: minVolume,
    });
  }

  const minDollarVolume = parseScreenerFilterInput(draft.minDollarVolume);
  if (minDollarVolume !== null) {
    filters.push({
      id: "min-dollar-volume",
      field: "dollarVolume",
      operator: "GTE",
      value: minDollarVolume,
    });
  }

  const minMovePct = parseScreenerFilterInput(draft.minMovePct);
  if (minMovePct !== null) {
    filters.push({ id: "min-move", field: "movePct", operator: "GTE", value: minMovePct });
  }

  const minRvol20d = parseScreenerFilterInput(draft.minRvol20d);
  if (minRvol20d !== null) {
    filters.push({ id: "min-rvol", field: "rvol20d", operator: "GTE", value: minRvol20d });
  }

  return {
    id,
    version: SCREENER_FILTER_VERSION,
    combinator: "AND",
    filters,
  };
}

export function toScreenerFilterCandidate(
  row: Pick<
    ScreenerResultRow,
    | "symbol"
    | "price"
    | "volume"
    | "rvol_20d"
    | "change_percent"
    | "gap_percent"
    | "provider_as_of"
    | "updated_at"
  >,
  discoveryRank: number,
  observation: ScreenerMetricObservation = FILTERING_OBSERVATION,
): ScreenerFilterCandidate {
  const obs: ScreenerMetricObservation = {
    provider_as_of: row.provider_as_of,
    updated_at: row.updated_at,
    freshnessState: "FRESH",
    ...observation,
  };
  const move = row.change_percent ?? row.gap_percent;
  const tradeQuality = evaluateScreenerTradeQuality(row, obs);
  const candidate: ScreenerFilterCandidate = {
    symbol: row.symbol,
    discoveryRank,
    price: filterNumber(toScreenerPriceValue(row.price, obs)),
    currentSessionVolume: filterNumber(toScreenerVolumeValue(row.volume, obs)),
    dollarVolume: filterNumber(toScreenerDollarVolumeValue(row.price, row.volume, obs)),
    movePct: filterNumber(toScreenerMoveValue(move, obs)),
    rvol20d: filterNumber(toScreenerRvol20dValue(row.rvol_20d, obs)),
  };

  if (tradeQuality.score !== null && tradeQuality.status !== "INCOMPLETE") {
    candidate.tradeQualityScore = tradeQuality.score;
    candidate.tradeQualityLabel = tradeQuality.status;
  }

  return candidate;
}

export function applyScreenerRowFilters<T extends Pick<
  ScreenerResultRow,
  | "symbol"
  | "price"
  | "volume"
  | "rvol_20d"
  | "change_percent"
  | "gap_percent"
  | "provider_as_of"
  | "updated_at"
>>(
  rows: readonly T[],
  filterSet: ScreenerFilterSet,
  discoveryRankOf: (row: T, index: number) => number = (_row, index) => index + 1,
  observation: ScreenerMetricObservation = FILTERING_OBSERVATION,
): T[] {
  if (filterSet.filters.length === 0) return [...rows];
  const candidates = rows.map((row, index) =>
    toScreenerFilterCandidate(row, discoveryRankOf(row, index), observation),
  );
  const result = applyScreenerFilters(candidates, filterSet);
  if (!result.ok) return [...rows];
  const passed = new Set(result.passed.map((item) => `${item.symbol}#${item.discoveryRank}`));
  return rows.filter((row, index) =>
    passed.has(`${row.symbol}#${discoveryRankOf(row, index)}`),
  );
}
