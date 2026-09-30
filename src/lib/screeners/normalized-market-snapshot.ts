/**
 * Frontend mirror of scanner normalized market snapshot helpers.
 * Keep gap / previous-close semantics aligned with supabase/functions/_shared/screeners/normalized-market-snapshot.ts
 */

import type { ScreenerResultRow } from "@/lib/screeners/contract";
import { isPositiveFinite } from "@/lib/screeners/contract";
import {
  previousCloseFromVerifiedMove,
  sessionMovePercent,
} from "@/lib/screeners/session-move";
import type { RadarV2CandidateRow } from "@/lib/screeners/radar-v2-adapter";

export type MarketSessionKind =
  | "pre-market"
  | "regular"
  | "after-hours"
  | "closed"
  | "unknown";

export interface NormalizedMarketSnapshot {
  symbol: string;
  price: number | null;
  previousClose: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  dollarVolume: number | null;
  premarketVolume: number | null;
  week52High: number | null;
  week52Low: number | null;
  timestamp: string | null;
  providerTimestamp: string | null;
  session: MarketSessionKind;
  priorSessionVolume: number | null;
  averageVolume20d: number | null;
  sameTimeAverageVolume20d: number | null;
  sameTimeRvol: number | null;
  rvol1m: number | null;
  rvol5m: number | null;
  timeAdjustedRvol: number | null;
  volumeVsPreviousDay: number | null;
}

export function gapPercentFromVerifiedInputs(
  currentPrice: number | null,
  previousClose: number | null,
): number | null {
  if (!isPositiveFinite(currentPrice) || !isPositiveFinite(previousClose)) return null;
  const pct = ((currentPrice - previousClose) / previousClose) * 100;
  if (!Number.isFinite(pct)) return null;
  return Math.round(pct * 10) / 10;
}

export function buildSnapshotFromScreenerRow(
  row: ScreenerResultRow,
  session: MarketSessionKind = "unknown",
): NormalizedMarketSnapshot {
  const price = isPositiveFinite(row.price) ? row.price : null;
  const previousClose = previousCloseFromVerifiedMove(row.price, row.change_percent);
  const volume = row.volume;
  return {
    symbol: row.symbol,
    price,
    previousClose,
    dayHigh: row.day_high,
    dayLow: row.day_low,
    volume,
    dollarVolume: price !== null && volume !== null ? price * volume : null,
    premarketVolume: session === "pre-market" ? volume : null,
    week52High: row.high_52w,
    week52Low: row.low_52w,
    timestamp: row.updated_at,
    providerTimestamp: row.provider_as_of,
    session,
    priorSessionVolume: row.prior_session_volume,
    averageVolume20d: row.avg_volume_20d,
    sameTimeAverageVolume20d: null,
    sameTimeRvol: null,
    rvol1m: null,
    rvol5m: null,
    timeAdjustedRvol: null,
    volumeVsPreviousDay: row.volume_ratio_prior_session,
  };
}

export function buildSnapshotFromRadarCandidate(
  row: RadarV2CandidateRow,
  session: MarketSessionKind,
): NormalizedMarketSnapshot {
  const price = isPositiveFinite(row.last_price) ? row.last_price : null;
  const previousClose = isPositiveFinite(row.previous_close) ? row.previous_close : null;
  const volume = row.session_volume ?? null;
  return {
    symbol: row.symbol.trim().toUpperCase(),
    price,
    previousClose,
    dayHigh: row.session_high,
    dayLow: row.session_low,
    volume,
    dollarVolume: price !== null && volume !== null ? price * volume : null,
    premarketVolume: session === "pre-market" ? volume : null,
    week52High: null,
    week52Low: null,
    timestamp: row.updated_at,
    providerTimestamp: row.provider_as_of,
    session,
    priorSessionVolume: isPositiveFinite(row.prior_session_volume)
      ? row.prior_session_volume
      : null,
    averageVolume20d: null,
    sameTimeAverageVolume20d: null,
    sameTimeRvol: null,
    rvol1m: null,
    rvol5m: row.rvol_5m ?? null,
    timeAdjustedRvol: row.time_adjusted_rvol ?? null,
    volumeVsPreviousDay: null,
  };
}

/** Honest gap for Radar rows when previous close is persisted on the candidate. */
export function verifiedGapPercentFromRadarCandidate(
  row: RadarV2CandidateRow,
): number | null {
  const price = isPositiveFinite(row.last_price) ? row.last_price : null;
  const previousClose = isPositiveFinite(row.previous_close) ? row.previous_close : null;
  return gapPercentFromVerifiedInputs(price, previousClose);
}

export function verifiedMovePercentFromRadarCandidate(
  row: RadarV2CandidateRow,
): number | null {
  return sessionMovePercent(
    isPositiveFinite(row.last_price) ? row.last_price : null,
    isPositiveFinite(row.previous_close) ? row.previous_close : null,
  );
}
