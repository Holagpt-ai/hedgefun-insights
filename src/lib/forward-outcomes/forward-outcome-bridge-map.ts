import type { ForwardOutcomeAvailabilityState, ForwardOutcomeSessionHorizon } from "@/config/forward-outcomes.config";
import type { ForwardOutcomeHorizon } from "@/config/security-intelligence.config";
import type { PersistedForwardOutcomeRow } from "@/lib/forward-outcomes/forward-outcome-types";
import type { SecurityId } from "@/types/security-identity";

function readNum(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function readBool(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  return null;
}

function readDate(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  return value.slice(0, 10);
}

export function mapForwardOutcomeRow(row: Record<string, unknown>): PersistedForwardOutcomeRow {
  const horizon = String(row.horizon) as ForwardOutcomeHorizon;
  return {
    episodeId: String(row.episode_id),
    securityId: String(row.security_id) as SecurityId,
    horizonKey: horizon,
    horizon: horizon as ForwardOutcomeSessionHorizon,
    availabilityState: (row.availability_state as ForwardOutcomeAvailabilityState | null) ?? "INVALID_EPISODE",
    dataAvailable: Boolean(row.data_available),
    episodeSessionDate: readDate(row.episode_session_date),
    horizonSessionDate: readDate(row.horizon_session_date),
    referencePrice: readNum(row.reference_price),
    referenceTimestamp: typeof row.reference_timestamp === "string" ? row.reference_timestamp : null,
    outcomePrice: readNum(row.outcome_price),
    returnPct: readNum(row.return_pct),
    openToCloseReturnPct: readNum(row.open_to_close_return_pct),
    gapPct: readNum(row.gap_pct),
    maxGainPct: readNum(row.max_gain_pct),
    maxDrawdownPct: readNum(row.max_drawdown_pct),
    highPrice: readNum(row.high_price),
    lowPrice: readNum(row.low_price),
    sessionVolume: readNum(row.session_volume),
    rvol: readNum(row.rvol),
    horizonSessionMovePct: readNum(row.horizon_session_move_pct),
    closePosition: readNum(row.close_position),
    closedAboveEpisodeClose: readBool(row.closed_above_episode_close),
    closedBelowEpisodeClose: readBool(row.closed_below_episode_close),
    exceededEpisodeHigh: readBool(row.exceeded_episode_high),
    brokeEpisodeLow: readBool(row.broke_episode_low),
  };
}

export function existingForwardOutcomeKeys(rows: readonly PersistedForwardOutcomeRow[]): Set<string> {
  const keys = new Set<string>();
  for (const row of rows) {
    keys.add(`${row.episodeId}:${row.horizonKey}`);
  }
  return keys;
}
