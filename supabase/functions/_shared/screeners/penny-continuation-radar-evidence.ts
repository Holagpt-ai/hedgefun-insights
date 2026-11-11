/**
 * Maps verified Radar V2.2 candidate facts into Penny Continuation evidence fields.
 * Does not invent CS1 velocity windows — those require explicit completed window records.
 */

import type { RadarV22CandidateRow } from "../radar-v22/persistence-v2.ts";
import type { ContinuationTriState } from "./continuation-types.ts";
import { isFiniteNumber, isPositiveFinite } from "./screener-contract-lite.ts";

function triFromVwapSide(
  side: RadarV22CandidateRow["vwap_side"],
): ContinuationTriState | null {
  if (side === "above") return "TRUE";
  if (side === "below") return "FALSE";
  return null;
}

function parseEngineEventTypes(events: unknown): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(events)) return out;
  for (const item of events) {
    if (item && typeof item === "object" && "type" in item) {
      const type = (item as { type?: unknown }).type;
      if (typeof type === "string" && type.trim()) {
        out.add(type.trim().toUpperCase());
      }
    }
  }
  return out;
}

function triFromBool(value: boolean): ContinuationTriState {
  return value ? "TRUE" : "FALSE";
}

function parseProviderMs(iso: string | null | undefined): number | null {
  if (typeof iso !== "string" || !iso.trim()) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

export interface PennyContinuationRadarFacts {
  price: number | null;
  previousRegularClose: number | null;
  sessionVolumeShares: number | null;
  dollarVolume: number | null;
  distanceFromHodPct: number | null;
  sessionHigh: number | null;
  priceVsSessionHighDropPct: number | null;
  vwap: number | null;
  aboveVwap: ContinuationTriState | null;
  holdingVwapAfterReclaim: ContinuationTriState | null;
  volumeAccelerationPct: number | null;
  timeAdjustedRvol: number | null;
  sharesPerMinute10m: number | null;
  radarHasReAcceleration: ContinuationTriState | null;
  radarHasSecondLeg: ContinuationTriState | null;
  providerAsOfMs: number | null;
  providerAsOfIso: string | null;
  tradingDate: string;
  sessionKind: RadarV22CandidateRow["session_kind"];
}

export function extractPennyFactsFromRadarV22Row(
  row: RadarV22CandidateRow,
): PennyContinuationRadarFacts {
  const engineEvents = parseEngineEventTypes(row.radar_engine_events);
  const lifecycle = row.radar_event_lifecycle?.trim().toUpperCase() ?? "";
  const holdingVwap =
    row.last_vwap_reclaim_at &&
      (!row.last_vwap_loss_at || row.last_vwap_reclaim_at >= row.last_vwap_loss_at)
      ? ("TRUE" as const)
      : null;

  const price = isPositiveFinite(row.last_price) ? row.last_price : null;
  const sessionVol = isFiniteNumber(row.session_volume) && row.session_volume >= 0
    ? row.session_volume
    : null;
  const dollarVolume =
    price !== null && sessionVol !== null ? price * sessionVol : null;

  let priceVsSessionHighDropPct: number | null = null;
  if (
    isPositiveFinite(row.session_high) &&
    isPositiveFinite(row.last_price) &&
    row.session_high! > 0
  ) {
    const drop = ((row.session_high! - row.last_price!) / row.session_high!) * 100;
    if (Number.isFinite(drop)) priceVsSessionHighDropPct = drop;
  }

  const providerAsOfIso = row.provider_as_of ?? null;
  const providerAsOfMs = parseProviderMs(providerAsOfIso);

  const velocity5m = isFiniteNumber(row.volume_velocity_5m) && row.volume_velocity_5m >= 0
    ? row.volume_velocity_5m
    : isFiniteNumber(row.volume_velocity) && row.volume_velocity >= 0
    ? row.volume_velocity
    : null;

  return {
    price,
    previousRegularClose: isPositiveFinite(row.previous_close) ? row.previous_close : null,
    sessionVolumeShares: sessionVol,
    dollarVolume,
    distanceFromHodPct: isFiniteNumber(row.distance_from_hod_pct)
      ? row.distance_from_hod_pct
      : null,
    sessionHigh: isPositiveFinite(row.session_high) ? row.session_high : null,
    priceVsSessionHighDropPct,
    vwap: isPositiveFinite(row.session_vwap) ? row.session_vwap : null,
    aboveVwap: row.vwap_partial ? null : triFromVwapSide(row.vwap_side),
    holdingVwapAfterReclaim: row.vwap_partial ? null : holdingVwap,
    volumeAccelerationPct: isFiniteNumber(row.volume_acceleration_pct)
      ? row.volume_acceleration_pct
      : null,
    timeAdjustedRvol: isFiniteNumber(row.time_adjusted_rvol)
      ? row.time_adjusted_rvol
      : isFiniteNumber(row.rvol_5m)
      ? row.rvol_5m
      : null,
    sharesPerMinute10m: velocity5m,
    radarHasReAcceleration: triFromBool(
      engineEvents.has("RE_ACCELERATION") || lifecycle.includes("RE_ACCELER"),
    ),
    radarHasSecondLeg: triFromBool(
      engineEvents.has("SECOND_LEG") || lifecycle.includes("SECOND"),
    ),
    providerAsOfMs,
    providerAsOfIso,
    tradingDate: row.trading_date,
    sessionKind: row.session_kind,
  };
}
