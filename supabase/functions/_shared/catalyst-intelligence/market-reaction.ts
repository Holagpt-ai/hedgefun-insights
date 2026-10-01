import { DEFAULT_REACTION_MAX_AGE_MS } from "./config.ts";
import type { MarketObservation, ReactionRecord, ReactionWindow } from "./types.ts";

export function pickLatestRadarRows(rows: readonly Record<string, unknown>[]): Record<string, unknown>[] {
  const latest = new Map<string, { at: number; row: Record<string, unknown> }>();
  for (const raw of rows) {
    const symbol = typeof raw.symbol === "string" ? raw.symbol.toUpperCase() : "";
    if (!symbol) continue;
    const provider = Date.parse(typeof raw.provider_as_of === "string" ? raw.provider_as_of : "");
    const updated = Date.parse(typeof raw.updated_at === "string" ? raw.updated_at : "");
    const at = Number.isFinite(provider) ? provider : Number.isFinite(updated) ? updated : Number.NEGATIVE_INFINITY;
    const prev = latest.get(symbol);
    if (!prev || at >= prev.at) latest.set(symbol, { at, row: raw });
  }
  return [...latest.values()].map((entry) => entry.row);
}

/** Keep stored RVOL, VWAP, and velocity when a newer snapshot does not include them. */
export function preserveObservedMetrics(next: ReactionRecord, existing: ReactionRecord | null): ReactionRecord {
  const referencePrice = next.referencePrice ?? existing?.referencePrice ?? null;
  const currentPrice = next.currentPrice ?? existing?.currentPrice ?? null;
  const payload = { ...(existing?.payload ?? {}), ...next.payload };
  if (
    existing?.referencePrice != null &&
    existing.referencePrice > 0 &&
    referencePrice === existing.referencePrice &&
    typeof existing.payload?.reference_provenance === "object"
  ) {
    payload.reference_provenance = existing.payload.reference_provenance;
  }
  if (!existing || existing.availability !== "available") {
    return { ...next, referencePrice, currentPrice, percentMove: percentMove(referencePrice, currentPrice), payload };
  }
  return {
    ...next,
    referencePrice,
    currentPrice,
    percentMove: percentMove(referencePrice, currentPrice),
    rvol5m: next.rvol5m ?? existing.rvol5m,
    timeAdjustedRvol: next.timeAdjustedRvol ?? existing.timeAdjustedRvol,
    volumeVelocity: next.volumeVelocity ?? existing.volumeVelocity,
    volumeAcceleration: next.volumeAcceleration ?? existing.volumeAcceleration,
    vwap: next.vwap ?? existing.vwap,
    vwapSide: next.vwapSide ?? existing.vwapSide,
    payload,
  };
}

export interface ReactionAssessment {
  availability: ReactionRecord["availability"];
  referencePrice: number | null;
  currentPrice: number | null;
  percentMove: number | null;
  intradayHigh: number | null;
  intradayLow: number | null;
  volume: number | null;
  dollarVolume: number | null;
  rvol5m: number | null;
  timeAdjustedRvol: number | null;
  volumeVelocity: number | null;
  volumeAcceleration: number | null;
  vwap: number | null;
  vwapSide: string | null;
  hodDistancePct: number | null;
  lodDistancePct: number | null;
  floatTurnover: number | null;
  reactionScore: number | null;
  scoreComponents: Record<string, unknown>;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function percentMove(reference: number | null, current: number | null): number | null {
  if (reference == null || current == null || reference === 0) return null;
  return ((current - reference) / reference) * 100;
}

/** Radar/session context is optional; event-time reference may exist without a live observation. */
export function observationWithEventReference(
  observation: MarketObservation | null,
  symbol: string,
  eventReferencePrice: number | null,
): MarketObservation | null {
  if (eventReferencePrice == null) return observation;
  if (observation) return { ...observation, referencePrice: eventReferencePrice };
  return {
    symbol: symbol.toUpperCase(),
    observedAt: null,
    freshness: "unknown",
    referencePrice: eventReferencePrice,
    currentPrice: null,
    intradayHigh: null,
    intradayLow: null,
    volume: null,
    dollarVolume: null,
    rvol5m: null,
    timeAdjustedRvol: null,
    volumeVelocity: null,
    volumeAcceleration: null,
    vwap: null,
    vwapSide: null,
    hodDistancePct: null,
    floatTurnover: null,
  };
}

/**
 * Session metrics require a fresh Radar observation. Event reference price is
 * persisted even when availability stays unavailable (no current price / score).
 */
export function assessReactionMarketContext(
  observation: MarketObservation | null,
  eventReferencePrice: number | null,
  now: Date,
  maxAgeMs = DEFAULT_REACTION_MAX_AGE_MS,
): ReactionAssessment {
  const merged = observationWithEventReference(observation, observation?.symbol ?? "", eventReferencePrice);
  const assessment = assessMarketObservation(merged, now, maxAgeMs);
  if (eventReferencePrice == null || assessment.referencePrice != null) return assessment;
  return {
    ...blank("unavailable"),
    referencePrice: eventReferencePrice,
    percentMove: percentMove(eventReferencePrice, finite(observation?.currentPrice ?? null)),
  };
}

/**
 * Copies observed Radar/screener fields. Does not recompute RVOL, VWAP, or
 * volume velocity. Missing inputs stay null and are never coerced to zero.
 */
export function assessMarketObservation(
  observation: MarketObservation | null,
  now: Date,
  maxAgeMs = DEFAULT_REACTION_MAX_AGE_MS,
): ReactionAssessment {
  const empty = blank("unavailable");
  if (!observation) return empty;
  const observedMs = observation.observedAt ? Date.parse(observation.observedAt) : NaN;
  const stale = observation.freshness === "stale" ||
    !Number.isFinite(observedMs) ||
    now.getTime() - observedMs > maxAgeMs;
  if (stale) return blank("stale");

  const currentPrice = finite(observation.currentPrice);
  const referencePrice = finite(observation.referencePrice);
  const intradayHigh = finite(observation.intradayHigh);
  const intradayLow = finite(observation.intradayLow);
  const volume = finite(observation.volume);
  const rvol5m = finite(observation.rvol5m);
  const timeAdjustedRvol = finite(observation.timeAdjustedRvol);
  const volumeVelocity = finite(observation.volumeVelocity);
  const volumeAcceleration = finite(observation.volumeAcceleration);
  const vwap = finite(observation.vwap);
  const hodDistancePct = finite(observation.hodDistancePct);
  const floatTurnover = finite(observation.floatTurnover);
  const dollarVolume = finite(observation.dollarVolume);
  const move = percentMove(referencePrice, currentPrice);
  let vwapSide = observation.vwapSide ?? null;
  if (!vwapSide && vwap != null && currentPrice != null) {
    vwapSide = currentPrice >= vwap ? "above" : "below";
  }
  const lodDistancePct = currentPrice != null && intradayLow != null && currentPrice !== 0
    ? ((currentPrice - intradayLow) / currentPrice) * 100
    : null;
  const any = [
    currentPrice, referencePrice, volume, rvol5m, timeAdjustedRvol, volumeVelocity,
    volumeAcceleration, vwap, hodDistancePct, floatTurnover, dollarVolume,
  ].some((value) => value != null);
  if (!any) return blank("unavailable");

  const pricePart = move == null ? null : clamp(Math.abs(move) * 8);
  const rvolPart = rvol5m == null ? null : clamp(rvol5m * 25);
  const accelPart = volumeAcceleration == null ? null : clamp(Math.abs(volumeAcceleration));
  const volumeParts = [rvolPart, accelPart].filter((value): value is number => value != null);
  let reactionScore: number | null = null;
  if (volumeParts.length === 0 && pricePart != null) reactionScore = clamp(pricePart * 0.6);
  else if (volumeParts.length > 0 && pricePart == null) {
    reactionScore = clamp(volumeParts.reduce((sum, value) => sum + value, 0) / volumeParts.length);
  } else if (volumeParts.length > 0 && pricePart != null) {
    const volumeScore = volumeParts.reduce((sum, value) => sum + value, 0) / volumeParts.length;
    reactionScore = clamp(volumeScore * 0.65 + pricePart * 0.35);
  }

  return {
    availability: "available",
    referencePrice,
    currentPrice,
    percentMove: move,
    intradayHigh,
    intradayLow,
    volume,
    dollarVolume,
    rvol5m,
    timeAdjustedRvol,
    volumeVelocity,
    volumeAcceleration,
    vwap,
    vwapSide,
    hodDistancePct,
    lodDistancePct,
    floatTurnover,
    reactionScore,
    scoreComponents: {
      price_component: pricePart,
      rvol_component: rvolPart,
      acceleration_component: accelPart,
      volume_weight: volumeParts.length > 0 ? 0.65 : 0,
    },
  };
}

export function reactionFromAssessment(
  eventId: string,
  windowKind: ReactionWindow,
  observedAt: string | null,
  assessment: ReactionAssessment,
  id: string,
): ReactionRecord {
  return {
    id,
    eventId,
    windowKind,
    observedAt,
    availability: assessment.availability,
    referencePrice: assessment.referencePrice,
    currentPrice: assessment.currentPrice,
    percentMove: assessment.percentMove,
    intradayHigh: assessment.intradayHigh,
    intradayLow: assessment.intradayLow,
    volume: assessment.volume,
    dollarVolume: assessment.dollarVolume,
    rvol5m: assessment.rvol5m,
    timeAdjustedRvol: assessment.timeAdjustedRvol,
    volumeVelocity: assessment.volumeVelocity,
    volumeAcceleration: assessment.volumeAcceleration,
    vwap: assessment.vwap,
    vwapSide: assessment.vwapSide,
    hodDistancePct: assessment.hodDistancePct,
    lodDistancePct: assessment.lodDistancePct,
    floatTurnover: assessment.floatTurnover,
    payload: assessment.scoreComponents,
  };
}

/** Map a radar_v22_candidates row without recomputing its metrics. */
export function observationFromRadarRow(row: Record<string, unknown>): MarketObservation {
  return {
    symbol: typeof row.symbol === "string" ? row.symbol.toUpperCase() : "",
    observedAt: typeof row.provider_as_of === "string"
      ? row.provider_as_of
      : typeof row.updated_at === "string"
      ? row.updated_at
      : null,
    freshness: row.freshness_class === "stale" ? "stale" : "unknown",
    referencePrice: null,
    currentPrice: finite(row.last_price),
    intradayHigh: finite(row.session_high),
    intradayLow: finite(row.session_low),
    volume: finite(row.session_volume),
    dollarVolume: null,
    rvol5m: finite(row.rvol_5m),
    timeAdjustedRvol: finite(row.time_adjusted_rvol),
    volumeVelocity: finite(row.volume_velocity),
    volumeAcceleration: finite(row.volume_acceleration_pct),
    vwap: finite(row.session_vwap),
    vwapSide: typeof row.vwap_side === "string" ? row.vwap_side : null,
    hodDistancePct: finite(row.distance_from_hod_pct),
    floatTurnover: finite(row.float_turnover),
    payload: {
      dollar_volume_60s: finite(row.dollar_volume_60s),
      volume_velocity_5m: finite(row.volume_velocity_5m),
      volume_velocity_15m: finite(row.volume_velocity_15m),
      volume_velocity_60m: finite(row.volume_velocity_60m),
    },
  };
}

function blank(availability: ReactionAssessment["availability"]): ReactionAssessment {
  return {
    availability,
    referencePrice: null,
    currentPrice: null,
    percentMove: null,
    intradayHigh: null,
    intradayLow: null,
    volume: null,
    dollarVolume: null,
    rvol5m: null,
    timeAdjustedRvol: null,
    volumeVelocity: null,
    volumeAcceleration: null,
    vwap: null,
    vwapSide: null,
    hodDistancePct: null,
    lodDistancePct: null,
    floatTurnover: null,
    reactionScore: null,
    scoreComponents: {},
  };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}
