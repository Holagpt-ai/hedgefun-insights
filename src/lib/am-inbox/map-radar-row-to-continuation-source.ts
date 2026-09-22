import type { RadarV2ScreenerRow } from "@/lib/screeners/radar-v2-adapter";
import type { ScreenerContinuationSource } from "@/lib/screeners/screener-continuation";

export function mapRadarRowToContinuationSource(row: RadarV2ScreenerRow): ScreenerContinuationSource {
  return {
    symbol: row.symbol,
    price: row.price ?? null,
    volume: row.volume ?? null,
    rvol_20d: row.rvol_20d ?? row.rvol ?? null,
    change_percent: row.move_60s_pct ?? row.change_percent ?? null,
    gap_percent: row.gap_percent ?? null,
    provider_as_of: row.provider_as_of ?? null,
    updated_at: row.updated_at ?? null,
    radar_trading_date: row.radar_trading_date ?? null,
    hod_distance_percent: row.hod_distance_percent ?? null,
    close_distance_from_hod_pct: row.hod_distance_percent ?? null,
    acceleration_5m: row.acceleration_5m ?? null,
    day_high: row.day_high ?? null,
  };
}
