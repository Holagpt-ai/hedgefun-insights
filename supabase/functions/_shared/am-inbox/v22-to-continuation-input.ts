import type { RadarV22CandidateRow } from "../radar-v22/persistence-v2.ts";
import type { ContinuationInput, ContinuationTriState } from "../screeners/continuation-types.ts";
import type { ContinuationVelocityState } from "../config/continuation.config.ts";
import {
  CONTINUATION_TIME_ADJUSTED_RVOL_STRONG,
  CONTINUATION_VOLUME_ACCELERATION_QUALIFY_PCT,
} from "../config/continuation.config.ts";
import {
  classifyAfterHoursExtendsSession,
  classifyClosingRejection,
  computeAfterHoursExtensionPct,
  computeClosingRejectionPct,
} from "../screeners/continuation-derived-metrics.ts";
import { computeDollarVolume, isFiniteNumber, isPositiveFinite } from "../screeners/screener-contract-lite.ts";

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

function participationToVelocity(state: string | null | undefined): ContinuationVelocityState {
  const normalized = state?.trim().toUpperCase();
  if (normalized === "SURGING") return "STRONG";
  if (normalized === "RISING") return "MODERATE";
  if (normalized === "STEADY") return "WEAK";
  if (normalized === "FALLING") return "NONE";
  return "UNKNOWN";
}

function resolveVolumeVelocity(row: RadarV22CandidateRow): ContinuationVelocityState {
  const fromParticipation = participationToVelocity(row.participation_state);
  if (fromParticipation !== "UNKNOWN") return fromParticipation;
  const from5m = classifySharesPerMinuteVelocity(row.volume_velocity_5m);
  if (from5m !== "UNKNOWN") return from5m;
  return classifySharesPerMinuteVelocity(row.volume_velocity);
}

function parseEngineEventTypes(events: unknown): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(events)) return out;
  for (const item of events) {
    if (item && typeof item === "object" && "type" in item) {
      const type = (item as { type?: unknown }).type;
      if (typeof type === "string" && type.trim()) out.add(type.trim().toUpperCase());
    }
  }
  return out;
}

function triFromBool(value: boolean): ContinuationTriState {
  return value ? "TRUE" : "FALSE";
}

function ahParticipationStrong(row: RadarV22CandidateRow): boolean {
  const tarvol = row.time_adjusted_rvol;
  if (isFiniteNumber(tarvol) && tarvol >= CONTINUATION_TIME_ADJUSTED_RVOL_STRONG) return true;
  const accel = row.volume_acceleration_pct;
  if (isFiniteNumber(accel) && accel >= CONTINUATION_VOLUME_ACCELERATION_QUALIFY_PCT) return true;
  const velocity = classifySharesPerMinuteVelocity(row.volume_velocity_5m);
  return velocity === "STRONG" || velocity === "MODERATE";
}

function resolveRegularSessionClose(row: RadarV22CandidateRow): number | null {
  if (isPositiveFinite(row.regular_session_close)) return row.regular_session_close;
  if (row.session_kind === "market" && isPositiveFinite(row.last_price)) return row.last_price;
  return null;
}

/**
 * Maps Fly Radar V2 candidate facts into the continuation engine input.
 * Consumes Radar Event Engine + Intraday Participation fields when present.
 */
export function v22CandidateToContinuationInput(row: RadarV22CandidateRow): ContinuationInput {
  const observedAt = row.provider_as_of ?? row.updated_at;
  const engineEvents = parseEngineEventTypes(row.radar_engine_events);
  const lifecycle = row.radar_event_lifecycle?.trim().toUpperCase() ?? "";
  const rejectionPct = computeClosingRejectionPct(row.session_high, row.last_price);
  const regularClose = resolveRegularSessionClose(row);
  const ahExtensionPct = row.session_kind === "after-hours"
    ? computeAfterHoursExtensionPct(regularClose, row.last_price)
    : null;
  const ahExtends = classifyAfterHoursExtendsSession({
    sessionKind: row.session_kind,
    extensionPct: ahExtensionPct,
    distanceFromHodPct: row.distance_from_hod_pct,
    ahParticipationStrong: ahParticipationStrong(row),
  });
  const holdingVwap =
    row.last_vwap_reclaim_at && (!row.last_vwap_loss_at || row.last_vwap_reclaim_at >= row.last_vwap_loss_at)
      ? "TRUE"
      : null;

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
    holdingVwapAfterReclaim: holdingVwap,
    volumeVelocity: resolveVolumeVelocity(row),
    rvol20d: row.time_adjusted_rvol ?? row.rvol_5m,
    timeAdjustedRvol: row.time_adjusted_rvol,
    volumeAccelerationPct: row.volume_acceleration_pct,
    participationState: row.participation_state,
    scannerPrimaryEvent: row.primary_scanner_event,
    radarEventLifecycle: row.radar_event_lifecycle,
    radarHasReAcceleration: triFromBool(
      engineEvents.has("RE_ACCELERATION") || lifecycle.includes("RE_ACCELER"),
    ),
    radarHasSecondLeg: triFromBool(
      engineEvents.has("SECOND_LEG") || lifecycle.includes("SECOND"),
    ),
    radarHasNewHod: triFromBool(engineEvents.has("NEW_HOD") || engineEvents.has("HOD_BREAK")),
    closingRejection: classifyClosingRejection(rejectionPct),
    afterHoursExtendsSession: ahExtends,
    afterHoursExtensionPct: ahExtensionPct,
    regularSessionClose: regularClose,
  };
}
