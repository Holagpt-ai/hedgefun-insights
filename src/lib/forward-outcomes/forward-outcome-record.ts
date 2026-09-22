import { FORWARD_OUTCOME_GENERATION_DEFAULTS } from "@/config/forward-outcomes.config";
import type { PersistedForwardOutcomeRow } from "@/lib/forward-outcomes/forward-outcome-types";

export function forwardOutcomeRowToJson(row: PersistedForwardOutcomeRow, computedAt: string) {
  return {
    episode_id: row.episodeId,
    security_id: row.securityId,
    horizon: row.horizonKey,
    reference_timestamp: row.referenceTimestamp,
    reference_price: row.referencePrice,
    outcome_price: row.outcomePrice,
    return_pct: row.returnPct,
    max_gain_pct: row.maxGainPct,
    max_drawdown_pct: row.maxDrawdownPct,
    high_price: row.highPrice,
    low_price: row.lowPrice,
    data_available: row.dataAvailable,
    availability_state: row.availabilityState,
    episode_session_date: row.episodeSessionDate,
    horizon_session_date: row.horizonSessionDate,
    open_to_close_return_pct: row.openToCloseReturnPct,
    gap_pct: row.gapPct,
    session_volume: row.sessionVolume,
    horizon_session_move_pct: row.horizonSessionMovePct,
    rvol: row.rvol,
    close_position: row.closePosition,
    closed_above_episode_close: row.closedAboveEpisodeClose,
    closed_below_episode_close: row.closedBelowEpisodeClose,
    exceeded_episode_high: row.exceededEpisodeHigh,
    broke_episode_low: row.brokeEpisodeLow,
    source: FORWARD_OUTCOME_GENERATION_DEFAULTS.defaultSource,
    source_as_of: computedAt,
    fetched_at: computedAt,
    computed_at: computedAt,
    quality: row.dataAvailable ? "DERIVED" : "UNAVAILABLE",
    freshness: "FRESH",
    provenance: "DERIVED",
  };
}

export function forwardOutcomesByEpisodeId(
  rows: readonly PersistedForwardOutcomeRow[],
): Map<string, Map<string, PersistedForwardOutcomeRow>> {
  const out = new Map<string, Map<string, PersistedForwardOutcomeRow>>();
  for (const row of rows) {
    const bucket = out.get(row.episodeId) ?? new Map<string, PersistedForwardOutcomeRow>();
    bucket.set(row.horizonKey, row);
    out.set(row.episodeId, bucket);
  }
  return out;
}
