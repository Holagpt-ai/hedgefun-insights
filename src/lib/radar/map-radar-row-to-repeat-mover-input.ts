import type { EpisodeTier } from "@/config/security-intelligence.config";
import type { RadarV2ScreenerRow } from "@/lib/screeners/radar-v2-adapter";
import type { RepeatMoverContextInput } from "@/lib/repeat-movers/normalize-repeat-mover-context";
import type { RadarHistoricalContextEnrichmentRequest } from "@/lib/radar/radar-historical-context-types";

function readEpisodeTier(value: unknown): EpisodeTier | null {
  if (value === "NOTABLE" || value === "SIGNIFICANT" || value === "EXTREME") return value;
  return null;
}

function shortWindowMovePct(row: RadarV2ScreenerRow): number | null {
  const move60 = row.move_60s_pct;
  if (typeof move60 === "number" && Number.isFinite(move60)) return move60;
  const move15 = row.move_15s_pct;
  if (typeof move15 === "number" && Number.isFinite(move15)) return move15;
  const change = row.change_percent;
  if (typeof change === "number" && Number.isFinite(change)) return change;
  return null;
}

/**
 * Maps verified Radar fields only. Does not infer RVOL, tier, or day move when absent.
 */
export function mapRadarRowToRepeatMoverInput(
  row: RadarV2ScreenerRow,
): RepeatMoverContextInput {
  return {
    symbol: row.symbol,
    movePct: shortWindowMovePct(row),
    volume: row.volume ?? null,
    rvol: row.rvol ?? null,
    dollarVolume: row.rolling_dollar_volume_60s ?? null,
    direction: null,
    tier: readEpisodeTier(row.signal_tier),
    sessionDate: row.radar_trading_date ?? null,
    recordedAt: row.provider_as_of ?? row.updated_at ?? null,
  };
}

export function mapRadarEnrichmentRequest(
  row: RadarV2ScreenerRow,
): RadarHistoricalContextEnrichmentRequest {
  const input = mapRadarRowToRepeatMoverInput(row);
  return {
    symbol: row.symbol,
    securityId: row.securityId ?? null,
    movePct: input.movePct ?? null,
    volume: input.volume ?? null,
    rvol: input.rvol ?? null,
    dollarVolume: input.dollarVolume ?? null,
    direction: input.direction ?? null,
    tier: input.tier ?? null,
    sessionDate: input.sessionDate ?? null,
    recordedAt: input.recordedAt ?? null,
  };
}
