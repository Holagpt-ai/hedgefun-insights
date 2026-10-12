/** Maps backend metrics into a minimal ranked row for desk selection (edge-safe). */

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

export type RadarRankedRowLite = DayTradeMetricsLike & {
  tab_id: string;
  company_name: string;
  volume_rank: number;
  rank: number;
};

export function metricsToRankedRow(row: DayTradeMetricsLike, index: number): RadarRankedRowLite {
  const symbol = row.symbol.trim().toUpperCase();
  return {
    ...row,
    tab_id: "day_trade_radar",
    symbol,
    company_name: symbol,
    volume_rank: row.volume_rank ?? index + 1,
    rank: row.rank ?? index + 1,
  };
}
