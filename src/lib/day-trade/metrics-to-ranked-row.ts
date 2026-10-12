/**
 * Maps backend Day Trade metrics into RadarRankedRow for canonical desk selection.
 */

import type { RadarRankedRow } from "@/features/day-trade-radar-v2/types";

export type DayTradeMetricsLike = {
  symbol: string;
  price: number | null;
  change_percent: number | null;
  float_shares?: number | null;
  volume_ratio_prior_session?: number | null;
  prior_session_volume?: number | null;
  rvol_5m?: number | null;
  time_adjusted_rvol?: number | null;
  rvol_20d?: number | null;
  avg_volume_20d?: number | null;
  volume: number | null;
  provider_as_of?: string | null;
  freshness_class?: string | null;
  vol_velocity?: number | null;
  rolling_volume_60s?: number | null;
  volume_acceleration_pct?: number | null;
  participation_state?: string | null;
  signal_status?: string | null;
  primary_scanner_event_at?: string | null;
  last_hod_break_at?: string | null;
  promoted_at?: string | null;
  volume_rank?: number;
  rank?: number;
};

export function metricsToRankedRow(row: DayTradeMetricsLike, index: number): RadarRankedRow {
  const symbol = row.symbol.trim().toUpperCase();
  return {
    tab_id: "day_trade_radar",
    symbol,
    company_name: symbol,
    price: row.price,
    change_percent: row.change_percent,
    volume: row.volume,
    avg_volume: null,
    rvol: row.rvol_20d,
    float_shares: row.float_shares ?? null,
    gap_percent: null,
    high_52w: null,
    low_52w: null,
    market_cap: null,
    prior_session_volume: row.prior_session_volume ?? null,
    volume_ratio_prior_session: row.volume_ratio_prior_session ?? null,
    avg_volume_20d: row.avg_volume_20d ?? null,
    rvol_20d: row.rvol_20d ?? null,
    day_high: null,
    day_low: null,
    range_event: null,
    provider_as_of: row.provider_as_of ?? null,
    sync_run_id: null,
    updated_at: null,
    rank: row.rank ?? index + 1,
    volume_rank: row.volume_rank ?? index + 1,
    rvol_5m: row.rvol_5m ?? null,
    time_adjusted_rvol: row.time_adjusted_rvol ?? null,
    vol_velocity: row.vol_velocity ?? null,
    rolling_volume_60s: row.rolling_volume_60s ?? null,
    volume_acceleration_pct: row.volume_acceleration_pct ?? null,
    participation_state: row.participation_state ?? null,
    signal_status: row.signal_status ?? null,
    freshness_class: row.freshness_class ?? null,
    primary_scanner_event_at: row.primary_scanner_event_at ?? null,
    last_hod_break_at: row.last_hod_break_at ?? null,
    promoted_at: row.promoted_at ?? null,
  } as RadarRankedRow;
}
