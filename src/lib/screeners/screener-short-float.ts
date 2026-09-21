/**
 * Screener Short Float V1 adapter.
 *
 * Maps an existing row onto the Short Float normalizer and Data Quality.
 * Does not call a provider, rank Discovery, score Trade Quality, or filter.
 *
 * Public `float_shares` is not short interest and is not read here.
 * When no short-float observation exists, the value stays unavailable.
 */

import {
  createAuthoritativeValue,
  createDerivedValue,
  createDiscrepancyValue,
  createInvalidValue,
  createPartialValue,
  createUnavailableValue,
  isUsableForDisplay,
} from "@/lib/screeners/data-quality";
import { normalizeShortFloat } from "@/lib/screeners/short-float";
import type { DataFreshnessState, DataProvenanceState, DataValue } from "@/types/data-quality";
import type { ShortFloatInput, ShortFloatNormalization } from "@/types/short-float";

export interface ScreenerShortFloatSource {
  symbol?: string | null;
  /** Ignored. Public float is not a short-float observation. */
  float_shares?: number | null;
  short_float_pct?: number | null;
  short_interest_shares?: number | null;
  short_float_float_shares?: number | null;
  shares_outstanding?: number | null;
  days_to_cover?: number | null;
  short_float_source?: string | null;
  short_float_source_as_of?: string | null;
  short_float_fetched_at?: string | null;
}

export interface ScreenerShortFloatOptions {
  /** Explicit evaluation instant. Production display does not read the clock. */
  evaluatedAt?: string | number | null;
}

export interface ScreenerShortFloatView {
  normalization: ShortFloatNormalization;
  value: DataValue<number>;
  display: string;
  title: string;
}

const FRESHNESS_LABEL: Record<DataFreshnessState, string> = {
  FRESH: "Fresh",
  AGING: "Aging",
  STALE: "Stale",
  UNKNOWN: "Freshness unknown",
};

function readField(row: ScreenerShortFloatSource, key: keyof ScreenerShortFloatSource): unknown {
  if (!Object.prototype.hasOwnProperty.call(row, key)) return undefined;
  return row[key];
}

function optionalNumber(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === "number" ? value : null;
}

function optionalText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === "string" ? value : null;
}

/**
 * Existing screener/Radar rows do not carry short interest.
 * Only explicit short-float fields are forwarded. `float_shares` is excluded.
 */
export function toShortFloatInput(row: ScreenerShortFloatSource): ShortFloatInput {
  return {
    symbol: row.symbol,
    shortFloatPct: optionalNumber(readField(row, "short_float_pct")),
    shortInterestShares: optionalNumber(readField(row, "short_interest_shares")),
    floatShares: optionalNumber(readField(row, "short_float_float_shares")),
    sharesOutstanding: optionalNumber(readField(row, "shares_outstanding")),
    daysToCover: optionalNumber(readField(row, "days_to_cover")),
    source: optionalText(readField(row, "short_float_source")),
    sourceAsOf: optionalText(readField(row, "short_float_source_as_of")),
    fetchedAt: optionalText(readField(row, "short_float_fetched_at")),
  };
}

function provenanceFor(result: ShortFloatNormalization): DataProvenanceState {
  if (result.qualityState === "DISCREPANCY") return "COMPOSITE";
  if (result.valueSource === "DERIVED") return "DERIVED";
  if (result.valueSource === "PROVIDER") return "PROVIDER";
  return "UNKNOWN";
}

export function toScreenerShortFloatValue(
  row: ScreenerShortFloatSource,
  options?: ScreenerShortFloatOptions,
): DataValue<number> {
  const result = normalizeShortFloat(toShortFloatInput(row), {
    evaluatedAt: options?.evaluatedAt,
  });
  const envelope = {
    metric: "shortFloatPct" as const,
    source: result.source,
    sourceAsOf: result.sourceAsOf,
    fetchedAt: result.fetchedAt,
    freshnessState: result.freshnessState,
    evaluatedAt: options?.evaluatedAt,
    provenance: provenanceFor(result),
  };

  if (result.qualityState === "INVALID") return createInvalidValue(envelope);
  if (result.qualityState === "DISCREPANCY") return createDiscrepancyValue(null, envelope);
  if (result.qualityState === "PARTIAL") return createPartialValue(result.shortFloatPct, envelope);
  if (result.qualityState === "UNAVAILABLE" || result.shortFloatPct === null) {
    return createUnavailableValue(envelope);
  }
  if (result.valueSource === "DERIVED") {
    return createDerivedValue(result.shortFloatPct, {
      ...envelope,
      lineage: { inputs: ["shortInterestShares", "floatShares"] },
    });
  }
  return createAuthoritativeValue(result.shortFloatPct, envelope);
}

export function formatShortFloatDisplay(value: DataValue<number>): string {
  if (!isUsableForDisplay(value) || value.value === null) return "—";
  return `${value.value.toFixed(1)}%`;
}

export function shortFloatTitle(value: DataValue<number>): string {
  if (value.qualityState === "DISCREPANCY") return "Short float discrepancy";
  if (!isUsableForDisplay(value) || value.value === null) return "Short float unavailable";
  return `Short float ${FRESHNESS_LABEL[value.freshnessState]}`;
}

export function evaluateScreenerShortFloat(
  row: ScreenerShortFloatSource,
  options?: ScreenerShortFloatOptions,
): ScreenerShortFloatView {
  const value = toScreenerShortFloatValue(row, options);
  return {
    normalization: normalizeShortFloat(toShortFloatInput(row), {
      evaluatedAt: options?.evaluatedAt,
    }),
    value,
    display: formatShortFloatDisplay(value),
    title: shortFloatTitle(value),
  };
}

export function formatScreenerShortFloatFromRow(
  row: ScreenerShortFloatSource,
  options?: ScreenerShortFloatOptions,
): string {
  return evaluateScreenerShortFloat(row, options).display;
}
