/**
 * Cross-surface price display evidence — timestamps and trust without forcing equality.
 */

import {
  formatMarketDataTrustLine,
  parseTrustSourceMs,
  resolveScreenerMarketDataTrust,
  type MarketDataTrustState,
} from "@/lib/market-data/trust-states";
import { formatEtClock } from "@/lib/screeners/screener-trigger-time";
import { isBaseDonorCoherent, type DisplayFieldDonor } from "@/lib/screeners/screener-display-enrichment";
import type { ScreenerResultRow, ScreenerUiStatus } from "@/lib/screeners/contract";
import type { MarketFeedTelemetry } from "@/lib/market-feed/telemetry";

export interface PriceObservation {
  price: number | null;
  providerAsOf: string | null;
  sourceLabel: string;
  sessionLabel?: string | null;
}

export interface ResolvedDisplayPrice {
  price: number | null;
  providerAsOf: string | null;
  sourceLabel: string;
  trust: MarketDataTrustState;
  trustLine: string;
  note: string | null;
}

export interface CrossSurfacePriceComparison {
  primary: ResolvedDisplayPrice;
  alternate: ResolvedDisplayPrice | null;
  legitimatelyDifferent: boolean;
  summary: string;
}

function finitePrice(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return value;
}

export function resolveDisplayPriceEvidence(input: {
  observation: PriceObservation;
  status?: ScreenerUiStatus;
  syncedAt?: string | null;
  marketFeed?: MarketFeedTelemetry | null;
  nowMs?: number;
}): ResolvedDisplayPrice {
  const nowMs = input.nowMs ?? Date.now();
  const trust = resolveScreenerMarketDataTrust({
    status: input.status ?? "available",
    syncedAt: input.syncedAt ?? input.observation.providerAsOf,
    providerAsOfMax: input.observation.providerAsOf,
    marketFeed: input.marketFeed ?? null,
    nowMs,
  });
  const trustLine = formatMarketDataTrustLine(trust, input.observation.providerAsOf, nowMs);
  const clock = formatEtClock(input.observation.providerAsOf);
  const sessionSuffix = input.observation.sessionLabel
    ? ` · ${input.observation.sessionLabel}`
    : "";
  let note: string;
  if (!clock) {
    note = `${input.observation.sourceLabel}${sessionSuffix} · timestamp unavailable · ${trustLine}`;
  } else if (input.marketFeed) {
    note = `${input.observation.sourceLabel}${sessionSuffix} · as of ${clock} ET · ${trustLine}`;
  } else {
    note =
      `${input.observation.sourceLabel}${sessionSuffix} · as of ${clock} ET · ${trustLine} (snapshot provenance; not a live quote tier)`;
  }

  return {
    price: finitePrice(input.observation.price),
    providerAsOf: input.observation.providerAsOf,
    sourceLabel: input.observation.sourceLabel,
    trust,
    trustLine,
    note,
  };
}

export function compareCrossSurfacePrices(input: {
  primary: PriceObservation;
  alternate: PriceObservation;
  primaryStatus?: ScreenerUiStatus;
  alternateStatus?: ScreenerUiStatus;
  nowMs?: number;
}): CrossSurfacePriceComparison {
  const primary = resolveDisplayPriceEvidence({
    observation: input.primary,
    status: input.primaryStatus,
    syncedAt: input.primary.providerAsOf,
    nowMs: input.nowMs,
  });
  const alternate = resolveDisplayPriceEvidence({
    observation: input.alternate,
    status: input.alternateStatus,
    syncedAt: input.alternate.providerAsOf,
    nowMs: input.nowMs,
  });

  const primaryMs = parseTrustSourceMs(primary.providerAsOf);
  const alternateMs = parseTrustSourceMs(alternate.providerAsOf);
  const pricesDiffer =
    primary.price !== null &&
    alternate.price !== null &&
    Math.abs(primary.price - alternate.price) > 0.0005;
  const legitimatelyDifferent =
    pricesDiffer &&
    primaryMs !== null &&
    alternateMs !== null &&
    primaryMs !== alternateMs;

  let summary = "Prices match within snapshot tolerance";
  if (legitimatelyDifferent) {
    summary = `Different snapshots — ${primary.sourceLabel} vs ${alternate.sourceLabel}; not merged`;
  } else if (pricesDiffer) {
    summary = "Prices differ but timestamps are inconclusive — both shown with source labels";
  }

  return {
    primary,
    alternate,
    legitimatelyDifferent,
    summary,
  };
}

/** Reject stale donor price when sentinel has a newer provider_as_of. */
export function shouldApplyDonorPriceField(
  sentinel: Pick<ScreenerResultRow, "symbol" | "provider_as_of" | "price">,
  donor: DisplayFieldDonor,
): boolean {
  if (!isBaseDonorCoherent(sentinel, donor)) return false;
  const sentinelMs = parseTrustSourceMs(sentinel.provider_as_of);
  const donorMs = parseTrustSourceMs(donor.provider_as_of);
  if (sentinelMs === null || donorMs === null) return false;
  if (donorMs < sentinelMs) return false;
  if (finitePrice(sentinel.price) !== null && finitePrice(donor.price) === finitePrice(sentinel.price)) {
    return false;
  }
  return finitePrice(donor.price) !== null;
}
