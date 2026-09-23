import type { RadarV22CandidateRow } from "../radar-v22/persistence-v2.ts";
import type { ContinuationInput, ContinuationTriState } from "../screeners/continuation-types.ts";
import type { ContinuationVelocityState } from "../config/continuation.config.ts";
import { computeDollarVolume } from "../screeners/screener-contract-lite.ts";

function triFromVwapSide(side: RadarV22CandidateRow["vwap_side"]): ContinuationTriState | null {
  if (side === "above") return "TRUE";
  if (side === "below") return "FALSE";
  return null;
}

function classifySharesPerMinuteVelocity(
  sharesPerMinute: number | null | undefined,
): ContinuationVelocityState {
  if (sharesPerMinute === null || sharesPerMinute === undefined || !Number.isFinite(sharesPerMinute)) {
    return "UNKNOWN";
  }
  if (sharesPerMinute >= 50_000) return "STRONG";
  if (sharesPerMinute >= 25_000) return "MODERATE";
  if (sharesPerMinute >= 10_000) return "WEAK";
  return "NONE";
}

/**
 * Maps Fly Radar V2 candidate facts into the continuation engine input.
 * Does not fabricate velocity, RVOL, or catalyst fields missing from Radar.
 */
export function v22CandidateToContinuationInput(row: RadarV22CandidateRow): ContinuationInput {
  const observedAt = row.provider_as_of ?? row.updated_at;
  return {
    symbol: row.symbol,
    sessionDate: row.trading_date,
    observedAt,
    price: row.last_price,
    sessionHigh: row.session_high,
    sessionLow: row.session_low,
    currentSessionVolume: row.session_volume,
    dollarVolume: computeDollarVolume(row.last_price, row.session_volume),
    distanceFromHodPct: row.distance_from_hod_pct,
    aboveVwap: triFromVwapSide(row.vwap_side),
    volumeVelocity: classifySharesPerMinuteVelocity(row.volume_velocity),
    rvol20d: row.rvol_5m,
    scannerPrimaryEvent: row.primary_scanner_event,
  };
}
