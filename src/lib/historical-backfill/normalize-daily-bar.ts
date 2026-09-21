/**
 * Daily bar normalization. Derived fields are computed only from finite inputs.
 * Missing inputs stay null. Nothing is zero-filled.
 */

import { createAuthoritativeValue, deriveFromInputs } from "@/lib/screeners/data-quality";
import type { DailyNormalization, ProviderDailyBar } from "@/types/historical-backfill";
import type { SecurityId } from "@/types/security-identity";

function positive(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function nonNegative(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function normalizeDailyBar(input: {
  securityId: SecurityId;
  observedSymbol: string;
  exchange: string | null;
  bar: ProviderDailyBar;
  previousClose: number | null;
  source: string;
  sourceAsOf: string | null;
  fetchedAt: string | null;
  computedAt: string | null;
}): DailyNormalization {
  const { bar } = input;
  if (!positive(bar.open) || !positive(bar.high) || !positive(bar.low) || !positive(bar.close)) {
    return { ok: false, reason: "incomplete or impossible price" };
  }
  if (!nonNegative(bar.volume)) return { ok: false, reason: "invalid volume" };
  if (bar.high < bar.low || bar.high < bar.open || bar.high < bar.close || bar.low > bar.open || bar.low > bar.close) {
    return { ok: false, reason: "impossible price range" };
  }
  const closeValue = createAuthoritativeValue(bar.close, {
    metric: "price",
    source: input.source,
    sourceAsOf: input.sourceAsOf,
    fetchedAt: input.fetchedAt,
    provenance: "PROVIDER",
    freshnessState: "UNKNOWN",
  });
  const volumeValue = createAuthoritativeValue(bar.volume, {
    metric: "volume",
    source: input.source,
    sourceAsOf: input.sourceAsOf,
    fetchedAt: input.fetchedAt,
    provenance: "PROVIDER",
    freshnessState: "UNKNOWN",
  });
  if (closeValue.qualityState !== "AUTHORITATIVE" || volumeValue.qualityState !== "AUTHORITATIVE") {
    return { ok: false, reason: "provider bar failed data quality" };
  }

  const dollarVolumeValue = deriveFromInputs(bar.close * bar.volume, [closeValue, volumeValue], {
    metric: "dollarVolume",
    computedAt: input.computedAt,
  });
  const previousClose = positive(input.previousClose) ? input.previousClose : null;
  const previousValue = previousClose === null
    ? null
    : createAuthoritativeValue(previousClose, {
      metric: "price",
      source: input.source,
      provenance: "PROVIDER",
      freshnessState: "UNKNOWN",
    });
  const movePctValue = previousValue && previousValue.qualityState === "AUTHORITATIVE"
    ? deriveFromInputs(((bar.close - previousClose!) / previousClose!) * 100, [closeValue, previousValue], {
      metric: "movePct",
      computedAt: input.computedAt,
    })
    : null;

  return {
    ok: true,
    bar: {
      securityId: input.securityId,
      sessionDate: bar.sessionDate,
      observedSymbol: input.observedSymbol,
      exchange: input.exchange,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
      dollarVolume: dollarVolumeValue.qualityState === "DERIVED" ? dollarVolumeValue.value : null,
      previousClose,
      movePct: movePctValue && movePctValue.qualityState === "DERIVED" ? movePctValue.value : null,
      dollarVolumeValue: dollarVolumeValue.qualityState === "DERIVED" ? dollarVolumeValue : null,
      movePctValue: movePctValue && movePctValue.qualityState === "DERIVED" ? movePctValue : null,
      source: input.source,
      sourceAsOf: input.sourceAsOf,
      fetchedAt: input.fetchedAt,
      computedAt: dollarVolumeValue.qualityState === "DERIVED" ? input.computedAt : null,
    },
  };
}
