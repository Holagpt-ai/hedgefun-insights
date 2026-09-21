/**
 * Production screener Data Quality adapter.
 *
 * Raw liquidity metrics → DataValue envelopes → existing presentation.
 * Does not recompute RVOL 20D or change Discovery Rank.
 */

import { computeDollarVolume } from "@/lib/screeners/dollar-volume";
import {
  createAuthoritativeValue,
  createInvalidValue,
  createUnavailableValue,
  deriveFromInputs,
  isUsableForDisplay,
} from "@/lib/screeners/data-quality";
import type { DataFreshnessState, DataValue, DataValueCreateOptions } from "@/types/data-quality";

export interface ScreenerMetricObservation {
  provider_as_of?: string | null;
  updated_at?: string | null;
  freshnessState?: DataFreshnessState;
}

function observationOptions(
  extra: DataValueCreateOptions,
  observation?: ScreenerMetricObservation,
): DataValueCreateOptions {
  return {
    ...extra,
    sourceAsOf: extra.sourceAsOf ?? observation?.provider_as_of ?? null,
    observedAt: extra.observedAt ?? observation?.updated_at ?? null,
    fetchedAt: extra.fetchedAt ?? observation?.updated_at ?? null,
    freshnessState: extra.freshnessState ?? observation?.freshnessState ?? "UNKNOWN",
  };
}

function isMissing(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isNonFiniteNumber(value: unknown): boolean {
  return typeof value === "number" && !Number.isFinite(value);
}

export function toScreenerPriceValue(
  price: unknown,
  observation?: ScreenerMetricObservation,
): DataValue<number> {
  const options = observationOptions(
    {
      metric: "price",
      provenance: "PROVIDER",
      source: "screener_results.price",
    },
    observation,
  );
  if (isMissing(price)) return createUnavailableValue(options);
  if (isNonFiniteNumber(price) || asFiniteNumber(price) === null) {
    return createInvalidValue(options);
  }
  return createAuthoritativeValue(asFiniteNumber(price) as number, options);
}

export function toScreenerVolumeValue(
  volume: unknown,
  observation?: ScreenerMetricObservation,
): DataValue<number> {
  const options = observationOptions(
    {
      metric: "volume",
      provenance: "PROVIDER",
      source: "screener_results.volume",
    },
    observation,
  );
  if (isMissing(volume)) return createUnavailableValue(options);
  if (isNonFiniteNumber(volume) || asFiniteNumber(volume) === null) {
    return createInvalidValue(options);
  }
  return createAuthoritativeValue(asFiniteNumber(volume) as number, options);
}

/**
 * Persisted RVOL 20D only. Never recomputes from avg_volume_20d or substitutes
 * Vol/Prior / float turnover / 5-minute ratios.
 */
export function toScreenerRvol20dValue(
  rvol20d: unknown,
  observation?: ScreenerMetricObservation,
): DataValue<number> {
  const options = observationOptions(
    {
      metric: "rvol20d",
      provenance: "INTERNAL",
      source: "screener_results.rvol_20d",
    },
    observation,
  );
  if (isMissing(rvol20d)) return createUnavailableValue(options);
  if (isNonFiniteNumber(rvol20d)) return createInvalidValue(options);
  const n = asFiniteNumber(rvol20d);
  if (n === null) return createInvalidValue(options);
  return createAuthoritativeValue(n, options);
}

export function toScreenerMoveValue(
  movePct: unknown,
  observation?: ScreenerMetricObservation,
): DataValue<number> {
  const options = observationOptions(
    {
      metric: "movePct",
      provenance: "PROVIDER",
      source: "screener_results.change_percent|gap_percent",
    },
    observation,
  );
  if (isMissing(movePct)) return createUnavailableValue(options);
  if (isNonFiniteNumber(movePct) || asFiniteNumber(movePct) === null) {
    return createInvalidValue(options);
  }
  return createAuthoritativeValue(asFiniteNumber(movePct) as number, options);
}

/**
 * Dollar Volume = price × current session volume via computeDollarVolume().
 * DERIVED from price and volume DataValues. Does not invent a second formula.
 */
export function toScreenerDollarVolumeValue(
  price: unknown,
  volume: unknown,
  observation?: ScreenerMetricObservation,
): DataValue<number> {
  const priceValue = toScreenerPriceValue(price, observation);
  const volumeValue = toScreenerVolumeValue(volume, observation);
  const product = computeDollarVolume(priceValue.value, volumeValue.value);
  return deriveFromInputs(product, [priceValue, volumeValue], {
    metric: "dollarVolume",
    provenance: "DERIVED",
    source: "price × volume",
    lineage: { inputs: ["price", "volume"] },
    sourceAsOf: observation?.provider_as_of ?? null,
    observedAt: observation?.updated_at ?? null,
    fetchedAt: observation?.updated_at ?? null,
    freshnessState: observation?.freshnessState,
  });
}

export function displayScreenerMetricValue(
  value: DataValue<number>,
  format: (n: number) => string,
  unavailable = "—",
): string {
  if (!isUsableForDisplay(value) || value.value === null) return unavailable;
  return format(value.value);
}
