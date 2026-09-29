/**
 * Deterministic Top-10 opportunity ranking for Day Trade Radar.
 *
 * ORDERING DEPENDENCY (catalyst):
 * `buildDayTradeRadarOpportunityBoard()` runs in `DayTradeRadarV2` from screener rows
 * BEFORE panel components call `useCatalystEnrichmentForSymbols` (async).
 * Verified Catalyst DB enrichment is therefore NOT available at initial rank time.
 * Pass `DayTradeRadarScoreContext.verifiedCatalyst` when enrichment is attached to
 * rows upstream; otherwise scanner/promotion fields provide the persisted proxy.
 *
 * Deferred follow-up: "Catalyst-aware Top-10 rerank after verified enrichment"
 * once enrichment is synchronously on rows or a stable single-pass hook exists.
 * Do not async-rerank in React loops in V1.1.
 */

import {
  DAY_TRADE_CATALYST_SCORE,
  DAY_TRADE_OPPORTUNITY_WEIGHTS,
  DAY_TRADE_RADAR_MIN_OPPORTUNITY_SCORE,
  DAY_TRADE_RADAR_MIN_VOL_VELOCITY,
  DAY_TRADE_RADAR_MIN_VOLUME_60S,
  DAY_TRADE_RADAR_SESSION_VOLUME_EXCEPTION,
  DAY_TRADE_RADAR_SOFT_MIN_SESSION_VOLUME,
  DAY_TRADE_RADAR_TOP_N,
  DAY_TRADE_SESSION_VOLUME_BLEND,
  DAY_TRADE_SUB_DOLLAR_MAIN_DESK,
  DAY_TRADE_TRADABILITY_BANDS,
  attentionTierForOpportunityRank,
  type DayTradeAttentionTier,
} from "@/config/day-trade-radar-opportunity.config";
import { isFiniteNumber, parseTimestampMs } from "@/lib/screeners/contract";
import { qualifiesDayTradeFreshness } from "./day-trade-freshness";
import {
  LEGACY_MOVE_MIN_PCT,
  LEGACY_PRICE_MAX,
  LEGACY_PRICE_MIN,
} from "@/lib/screeners/legacy-confirmation";
import {
  evaluateDayTradeEligibility,
  meetsDayTradeParticipation,
  qualifiesDayTradeMomentum,
} from "./day-trade-strategy";
import { finiteMetric } from "@/lib/screeners/screener-metric-display";
import { mapVolumeTrend } from "./multi-radar";
import type {
  DayTradeRadarOpportunityBreakdown,
  DayTradeRadarOpportunityExplain,
  RadarRankedRow,
} from "./types";

export type VerifiedCatalystRankTier = "direct" | "scheduled" | "none";

export interface DayTradeRadarScoreContext {
  /** When verified catalyst enrichment is on the row before scoring. */
  verifiedCatalyst?: VerifiedCatalystRankTier;
}

export interface DayTradeRadarOpportunityScore {
  total: number;
  breakdown: DayTradeRadarOpportunityBreakdown;
  explain: DayTradeRadarOpportunityExplain;
  eligible: boolean;
  ineligibleReason?: string;
}

export interface DayTradeCandidateGateAudit {
  candidateUniverseCount: number;
  missingPriceCount: number;
  priceBelowMinCount: number;
  priceAboveMaxCount: number;
  missingMoveCount: number;
  moveBelowMinimumCount: number;
  missingParticipationCount: number;
  participationBelowMinimumCount: number;
  highFloatCount: number;
  unknownFloatCount: number;
  freshnessRejectedCount: number;
  liquidityRejectedCount: number;
  subDollarRejectedCount: number;
  qualifiedStrategyCount: number;
  qualifiedFreshCount: number;
  rankedOpportunityCount: number;
}

export interface DayTradeRadarOpportunityBoard {
  candidateUniverseCount: number;
  qualifiedCount: number;
  topOpportunities: RadarRankedRow[];
  gateAudit: DayTradeCandidateGateAudit;
}

const FRESHNESS_SCORE: Record<string, number> = {
  fresh: 1,
  active: 0.82,
  cooling: 0.45,
  stale: 0.15,
  unknown: 0.35,
};

const SIGNAL_MOMENTUM: Record<string, number> = {
  EXPLOSIVE: 1,
  REACTIVATED: 0.95,
  BUILDING: 0.78,
  CONFIRMING: 0.72,
  COOLING: 0.25,
  STALE: 0.1,
  INACTIVE: 0,
};

const VOLUME_TREND_MOMENTUM: Record<string, number> = {
  "EXTREME ↑↑": 1,
  "SURGING ↑↑": 0.88,
  "RISING ↑": 0.72,
  STEADY: 0.45,
  "COOLING ↓": 0.2,
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function finiteOrNull(value: unknown): number | null {
  return isFiniteNumber(value) ? (value as number) : null;
}

function percentileRank(value: number | null, peers: readonly number[]): number {
  if (value === null || peers.length === 0) return 0;
  const sorted = [...peers].sort((a, b) => a - b);
  let below = 0;
  for (const p of sorted) {
    if (p < value) below += 1;
  }
  return clamp01(below / sorted.length);
}

function logNorm(value: number | null, peers: readonly number[]): number {
  if (value === null || value <= 0 || peers.length === 0) return 0;
  const logs = peers.filter((p) => p > 0).map((p) => Math.log10(p + 1));
  if (logs.length === 0) return 0;
  return percentileRank(Math.log10(value + 1), logs);
}

function freshnessClassScore(cls: string | null | undefined): number {
  if (typeof cls !== "string" || !cls.trim()) return FRESHNESS_SCORE.unknown;
  const key = cls.trim().toLowerCase();
  return FRESHNESS_SCORE[key] ?? FRESHNESS_SCORE.unknown;
}

function recencyBoost(iso: string | null | undefined, nowMs: number): number {
  const ms = parseTimestampMs(iso ?? null);
  if (ms === null) return 0.35;
  const ageMin = Math.max(0, (nowMs - ms) / 60_000);
  if (ageMin <= 15) return 1;
  if (ageMin <= 45) return 0.85;
  if (ageMin <= 120) return 0.65;
  if (ageMin <= 240) return 0.4;
  return 0.2;
}

function sessionVolumeBlend(row: RadarRankedRow): number {
  const cls = typeof row.freshness_class === "string" ? row.freshness_class.toLowerCase() : "";
  const signal = typeof row.signal_status === "string" ? row.signal_status.toUpperCase() : "";
  if (cls === "stale" || signal === "STALE" || signal === "COOLING") {
    return DAY_TRADE_SESSION_VOLUME_BLEND.staleSessionShare;
  }
  if (cls === "cooling") return DAY_TRADE_SESSION_VOLUME_BLEND.coolingSessionShare;
  return DAY_TRADE_SESSION_VOLUME_BLEND.baseSessionShare;
}

/** Generic price accessibility — never bans a ticker by identity. */
export function tradabilityFactor(row: RadarRankedRow): number {
  const p = finiteOrNull(row.price);
  if (p === null || p <= 0) return 0.35;
  const bands = DAY_TRADE_TRADABILITY_BANDS;
  if (p < 1) return subDollarTradabilityMultiplier(row);
  if (p <= bands.accessibleMax) return bands.accessibleMultiplier;
  if (p <= bands.midMax) return bands.midMultiplier;
  if (p <= bands.highMax) return bands.highMultiplier;
  return bands.ultraMultiplier;
}

function subDollarTradabilityMultiplier(row: RadarRankedRow): number {
  const cfg = DAY_TRADE_SUB_DOLLAR_MAIN_DESK;
  const session = finiteOrNull(row.volume) ?? 0;
  const vel = finiteOrNull(row.vol_velocity) ?? 0;
  const v60 = finiteOrNull(row.rolling_volume_60s) ?? 0;
  const d60 = finiteOrNull(row.rolling_dollar_volume_60s);
  if (
    session >= cfg.minSessionVolumeStrong &&
    vel >= cfg.minVelocityStrong &&
    v60 >= cfg.minVolume60sStrong &&
    (d60 === null || d60 >= cfg.minDollar60sStrong)
  ) {
    return 0.82;
  }
  if (session >= cfg.maxSessionVolumeIfVelocityBelow && vel >= cfg.maxVelocityWeak) {
    return 0.55;
  }
  return 0.25;
}

export function meetsSubDollarMainDeskBar(row: RadarRankedRow): boolean {
  const p = finiteOrNull(row.price);
  if (p === null || p >= 1) return true;
  const cfg = DAY_TRADE_SUB_DOLLAR_MAIN_DESK;
  const session = finiteOrNull(row.volume) ?? 0;
  const vel = finiteOrNull(row.vol_velocity) ?? 0;
  const v60 = finiteOrNull(row.rolling_volume_60s) ?? 0;
  const d60 = finiteOrNull(row.rolling_dollar_volume_60s);
  if (session <= cfg.maxSessionVolumeIfVelocityBelow && vel < cfg.maxVelocityWeak) {
    return false;
  }
  if (
    session >= cfg.minSessionVolumeStrong &&
    vel >= cfg.minVelocityStrong &&
    v60 >= cfg.minVolume60sStrong
  ) {
    return d60 === null || d60 >= cfg.minDollar60sStrong;
  }
  return false;
}

function catalystEventFactor(row: RadarRankedRow, ctx?: DayTradeRadarScoreContext): number {
  if (ctx?.verifiedCatalyst === "direct") return DAY_TRADE_CATALYST_SCORE.directTicker;
  if (ctx?.verifiedCatalyst === "scheduled") return DAY_TRADE_CATALYST_SCORE.scheduledTicker;
  if (typeof row.primary_scanner_event === "string" && row.primary_scanner_event.trim()) {
    return DAY_TRADE_CATALYST_SCORE.scannerEventOnly;
  }
  if (row.promotion_reason && typeof row.promotion_reason === "object") {
    return DAY_TRADE_CATALYST_SCORE.scannerEventOnly;
  }
  if (typeof row.promotion_reason === "string" && row.promotion_reason.trim()) {
    return DAY_TRADE_CATALYST_SCORE.scannerEventOnly;
  }
  return DAY_TRADE_CATALYST_SCORE.none;
}

function historicalFactor(row: RadarRankedRow): number {
  const ctx = row.historicalContext;
  if (!ctx?.profile?.profileAvailable) return 0.2;
  const comparable = ctx.comparableHistory?.comparableEpisodeCount ?? 0;
  if (comparable >= 3) return 0.9;
  if (comparable >= 1) return 0.65;
  if ((ctx.profile.episodeCount ?? 0) >= 5) return 0.55;
  return 0.35;
}

function hodStructureFactor(row: RadarRankedRow): number {
  const dist = finiteOrNull(row.distance_from_hod_pct ?? row.hod_distance_percent);
  if (dist === null) return 0.35;
  if (dist <= 0.5) return 1;
  if (dist <= 1.5) return 0.9;
  if (dist <= 3) return 0.75;
  if (dist <= 6) return 0.5;
  return 0.25;
}

function momentumFactor(row: RadarRankedRow): { score: number; trendLabel: string; signal: string } {
  const signal = typeof row.signal_status === "string" ? row.signal_status.toUpperCase() : "";
  const signalScore = SIGNAL_MOMENTUM[signal] ?? 0.45;
  const trend = mapVolumeTrend(row.volume_acceleration_pct).label;
  const trendScore = VOLUME_TREND_MOMENTUM[trend] ?? 0.45;
  const move60 = Math.abs(finiteOrNull(row.move_60s_pct) ?? 0);
  const move15 = Math.abs(finiteOrNull(row.move_15s_pct) ?? 0);
  const moveScore = clamp01(Math.max(move60, move15) / 8);
  const accel5 = finiteOrNull(row.acceleration_5m);
  const accelBoost = accel5 !== null && accel5 > 0 ? clamp01(accel5 / 5) * 0.12 : 0;
  return {
    signal,
    trendLabel: trend,
    score: clamp01(signalScore * 0.42 + trendScore * 0.38 + moveScore * 0.12 + accelBoost),
  };
}

function volumeLiquidityFactor(
  row: RadarRankedRow,
  peers: PeerStats,
): { score: number; sessionShare: number; nowParticipation: number } {
  const session = logNorm(finiteOrNull(row.volume), peers.sessionVolumes);
  const vol60 = logNorm(finiteOrNull(row.rolling_volume_60s), peers.volume60s);
  const velocity = logNorm(finiteOrNull(row.vol_velocity), peers.velocities);
  const dollars = logNorm(finiteOrNull(row.rolling_dollar_volume_60s), peers.dollar60s);
  const rvol5 = logNorm(finiteOrNull(row.rvol_5m), peers.rvol5m);
  const timeAdj = logNorm(finiteOrNull(row.time_adjusted_rvol), peers.timeAdjustedRvol);
  const accel5 = logNorm(
    finiteOrNull(row.acceleration_5m) !== null && (row.acceleration_5m as number) > 0
      ? row.acceleration_5m
      : null,
    peers.acceleration5m,
  );
  const nowParticipation = clamp01(
    vol60 * 0.28 +
      velocity * 0.26 +
      dollars * 0.18 +
      rvol5 * 0.1 +
      timeAdj * 0.08 +
      accel5 * 0.1,
  );
  const sessionShare = sessionVolumeBlend(row);
  return {
    sessionShare,
    nowParticipation,
    score: clamp01(session * sessionShare + nowParticipation * (1 - sessionShare)),
  };
}

interface PeerStats {
  sessionVolumes: number[];
  volume60s: number[];
  velocities: number[];
  dollar60s: number[];
  rvol5m: number[];
  timeAdjustedRvol: number[];
  acceleration5m: number[];
}

function buildPeerStats(rows: readonly RadarRankedRow[]): PeerStats {
  const sessionVolumes: number[] = [];
  const volume60s: number[] = [];
  const velocities: number[] = [];
  const dollar60s: number[] = [];
  const rvol5m: number[] = [];
  const timeAdjustedRvol: number[] = [];
  const acceleration5m: number[] = [];
  for (const row of rows) {
    const vol = finiteOrNull(row.volume);
    if (vol !== null && vol > 0) sessionVolumes.push(vol);
    const v60 = finiteOrNull(row.rolling_volume_60s);
    if (v60 !== null && v60 > 0) volume60s.push(v60);
    const vel = finiteOrNull(row.vol_velocity);
    if (vel !== null && vel > 0) velocities.push(vel);
    const d60 = finiteOrNull(row.rolling_dollar_volume_60s);
    if (d60 !== null && d60 > 0) dollar60s.push(d60);
    const r5 = finiteOrNull(row.rvol_5m);
    if (r5 !== null && r5 > 0) rvol5m.push(r5);
    const tar = finiteOrNull(row.time_adjusted_rvol);
    if (tar !== null && tar > 0) timeAdjustedRvol.push(tar);
    const a5 = finiteOrNull(row.acceleration_5m);
    if (a5 !== null && a5 > 0) acceleration5m.push(a5);
  }
  return { sessionVolumes, volume60s, velocities, dollar60s, rvol5m, timeAdjustedRvol, acceleration5m };
}

export function meetsDayTradeRadarLiquidityGate(row: RadarRankedRow): boolean {
  const session = finiteOrNull(row.volume);
  if (session === null || session <= 0) return false;
  const vol60 = finiteOrNull(row.rolling_volume_60s);
  const velocity = finiteOrNull(row.vol_velocity);
  if (session >= DAY_TRADE_RADAR_SESSION_VOLUME_EXCEPTION) return true;
  if (vol60 !== null && vol60 >= DAY_TRADE_RADAR_MIN_VOLUME_60S) return true;
  if (velocity !== null && velocity >= DAY_TRADE_RADAR_MIN_VOL_VELOCITY) return true;
  if (session >= DAY_TRADE_RADAR_SOFT_MIN_SESSION_VOLUME && vol60 !== null && vol60 > 0) {
    return true;
  }
  return false;
}

export function meetsDayTradeRadarEligibility(row: RadarRankedRow): boolean {
  if (!meetsDayTradeRadarLiquidityGate(row)) return false;
  if (!meetsSubDollarMainDeskBar(row)) return false;
  return true;
}

function buildExplain(input: {
  volumeLiquidity: number;
  momentum: number;
  freshness: number;
  hodStructure: number;
  catalystEvent: number;
  tradability: number;
  historical: number;
  reasons: string[];
  penalties: string[];
}): DayTradeRadarOpportunityExplain {
  const w = DAY_TRADE_OPPORTUNITY_WEIGHTS;
  const pct = (n: number) => Math.round(n * 100);
  const breakdown: DayTradeRadarOpportunityBreakdown = {
    volumeLiquidity: pct(input.volumeLiquidity),
    momentum: pct(input.momentum),
    freshness: pct(input.freshness),
    hodStructure: pct(input.hodStructure),
    catalystEvent: pct(input.catalystEvent),
    tradability: pct(input.tradability),
    historical: pct(input.historical),
  };
  const weighted: DayTradeRadarOpportunityBreakdown = {
    volumeLiquidity: Math.round(input.volumeLiquidity * w.volumeLiquidity * 10) / 10,
    momentum: Math.round(input.momentum * w.momentum * 10) / 10,
    freshness: Math.round(input.freshness * w.freshness * 10) / 10,
    hodStructure: Math.round(input.hodStructure * w.hodStructure * 10) / 10,
    catalystEvent: Math.round(input.catalystEvent * w.catalystEvent * 10) / 10,
    tradability: Math.round(input.tradability * w.tradability * 10) / 10,
    historical: Math.round(input.historical * w.historical * 10) / 10,
  };
  return { components: breakdown, weighted, reasons: input.reasons, penalties: input.penalties };
}

export function computeDayTradeRadarScore(
  row: RadarRankedRow,
  peers: PeerStats,
  nowMs: number,
  ctx?: DayTradeRadarScoreContext,
): DayTradeRadarOpportunityScore {
  const reasons: string[] = [];
  const penalties: string[] = [];

  if (!meetsDayTradeRadarEligibility(row)) {
    if (!meetsDayTradeRadarLiquidityGate(row)) penalties.push("insufficient_liquidity");
    if (!meetsSubDollarMainDeskBar(row)) penalties.push("sub_dollar_quality_bar");
    return {
      total: 0,
      breakdown: {
        volumeLiquidity: 0,
        momentum: 0,
        freshness: 0,
        hodStructure: 0,
        catalystEvent: 0,
        tradability: 0,
        historical: 0,
      },
      explain: buildExplain({
        volumeLiquidity: 0,
        momentum: 0,
        freshness: 0,
        hodStructure: 0,
        catalystEvent: 0,
        tradability: 0,
        historical: 0,
        reasons,
        penalties,
      }),
      eligible: false,
      ineligibleReason: penalties[0] ?? "insufficient_liquidity",
    };
  }

  const vol = volumeLiquidityFactor(row, peers);
  const mom = momentumFactor(row);
  const freshnessBase = freshnessClassScore(row.freshness_class);
  const freshnessTime = recencyBoost(row.promoted_at ?? row.primary_scanner_event_at, nowMs);
  const freshness = clamp01(freshnessBase * 0.55 + freshnessTime * 0.45);
  const hodStructure = hodStructureFactor(row);
  const catalystEvent = catalystEventFactor(row, ctx);
  const tradability = tradabilityFactor(row);
  const historical = historicalFactor(row);

  if (vol.nowParticipation >= 0.55) reasons.push("strong_current_participation");
  if (mom.trendLabel === "EXTREME ↑↑" || mom.trendLabel === "SURGING ↑↑") {
    reasons.push("volume_surge");
  }
  if (freshnessTime >= 0.85) reasons.push("fresh_trigger");
  if (hodStructure >= 0.9) reasons.push("near_hod");
  if (ctx?.verifiedCatalyst === "direct") reasons.push("verified_catalyst");
  if (tradability < 0.55) penalties.push("price_accessibility");
  if (freshnessBase <= 0.2) penalties.push("stale_freshness_class");
  if (mom.signal === "COOLING" || mom.trendLabel === "COOLING ↓") {
    penalties.push("cooling_momentum");
  }

  const w = DAY_TRADE_OPPORTUNITY_WEIGHTS;
  const total =
    vol.score * w.volumeLiquidity +
    mom.score * w.momentum +
    freshness * w.freshness +
    hodStructure * w.hodStructure +
    catalystEvent * w.catalystEvent +
    tradability * w.tradability +
    historical * w.historical;

  const eligible = total >= DAY_TRADE_RADAR_MIN_OPPORTUNITY_SCORE;

  return {
    total: Math.round(total * 10) / 10,
    breakdown: buildExplain({
      volumeLiquidity: vol.score,
      momentum: mom.score,
      freshness,
      hodStructure,
      catalystEvent,
      tradability,
      historical,
      reasons,
      penalties,
    }).components,
    explain: buildExplain({
      volumeLiquidity: vol.score,
      momentum: mom.score,
      freshness,
      hodStructure,
      catalystEvent,
      tradability,
      historical,
      reasons,
      penalties,
    }),
    eligible,
    ineligibleReason: eligible ? undefined : "below_opportunity_threshold",
  };
}

export function summarizeDayTradeCandidateGates(
  rankedUniverse: readonly RadarRankedRow[],
  nowMs: number,
  rankedOpportunityCount = 0,
): DayTradeCandidateGateAudit {
  const audit: DayTradeCandidateGateAudit = {
    candidateUniverseCount: rankedUniverse.length,
    missingPriceCount: 0,
    priceBelowMinCount: 0,
    priceAboveMaxCount: 0,
    missingMoveCount: 0,
    moveBelowMinimumCount: 0,
    missingParticipationCount: 0,
    participationBelowMinimumCount: 0,
    highFloatCount: 0,
    unknownFloatCount: 0,
    freshnessRejectedCount: 0,
    liquidityRejectedCount: 0,
    subDollarRejectedCount: 0,
    qualifiedStrategyCount: 0,
    qualifiedFreshCount: 0,
    rankedOpportunityCount,
  };

  for (const row of rankedUniverse) {
    const price = finiteMetric(row.price);
    if (price === null) {
      audit.missingPriceCount += 1;
    } else {
      if (price < LEGACY_PRICE_MIN) audit.priceBelowMinCount += 1;
      if (price > LEGACY_PRICE_MAX) audit.priceAboveMaxCount += 1;
    }

    const move = finiteMetric(row.change_percent);
    if (move === null) {
      audit.missingMoveCount += 1;
    } else if (move < LEGACY_MOVE_MIN_PCT) {
      audit.moveBelowMinimumCount += 1;
    }

    const eligibility = evaluateDayTradeEligibility(row);
    const participation = meetsDayTradeParticipation(row);
    const hasParticipationMetric =
      participation.classicRvol !== null ||
      finiteMetric(row.volume_ratio_prior_session) !== null ||
      finiteMetric(row.rvol_5m) !== null ||
      finiteMetric(row.time_adjusted_rvol) !== null;
    if (!hasParticipationMetric) {
      audit.missingParticipationCount += 1;
    } else if (!participation.pass) {
      audit.participationBelowMinimumCount += 1;
    }

    if (eligibility.floatGate === "fail_high_float") audit.highFloatCount += 1;
    if (eligibility.floatGate === "unknown") audit.unknownFloatCount += 1;

    if (!meetsDayTradeRadarLiquidityGate(row)) audit.liquidityRejectedCount += 1;
    if (!meetsSubDollarMainDeskBar(row)) audit.subDollarRejectedCount += 1;

    if (qualifiesDayTradeMomentum(row)) {
      audit.qualifiedStrategyCount += 1;
      if (qualifiesDayTradeFreshness(row, nowMs)) {
        audit.qualifiedFreshCount += 1;
      } else {
        audit.freshnessRejectedCount += 1;
      }
    }
  }

  return audit;
}

function compareOpportunity(
  a: { row: RadarRankedRow; score: DayTradeRadarOpportunityScore },
  b: { row: RadarRankedRow; score: DayTradeRadarOpportunityScore },
): number {
  if (a.score.total !== b.score.total) return b.score.total - a.score.total;
  const velA = finiteOrNull(a.row.vol_velocity) ?? 0;
  const velB = finiteOrNull(b.row.vol_velocity) ?? 0;
  if (velB !== velA) return velB - velA;
  const volA = finiteOrNull(a.row.volume) ?? 0;
  const volB = finiteOrNull(b.row.volume) ?? 0;
  if (volB !== volA) return volB - volA;
  return (a.row.volume_rank ?? a.row.rank) - (b.row.volume_rank ?? b.row.rank);
}

/**
 * Rank the Day Trade desk from the full volume-first universe.
 * Preserves discovery order on each row as `volume_rank`.
 */
export function buildDayTradeRadarOpportunityBoard(
  rankedUniverse: readonly RadarRankedRow[],
  nowMs: number,
  ctx?: DayTradeRadarScoreContext,
): DayTradeRadarOpportunityBoard {
  const candidateUniverseCount = rankedUniverse.length;
  if (candidateUniverseCount === 0) {
    return {
      candidateUniverseCount: 0,
      qualifiedCount: 0,
      topOpportunities: [],
      gateAudit: summarizeDayTradeCandidateGates(rankedUniverse, nowMs, 0),
    };
  }

  const withVolumeRank = rankedUniverse.map((row) => ({
    ...row,
    volume_rank: row.volume_rank ?? row.rank,
  }));

  const strategyUniverse = withVolumeRank.filter(
    (row) => qualifiesDayTradeMomentum(row) && qualifiesDayTradeFreshness(row, nowMs),
  );

  const peers = buildPeerStats(strategyUniverse);
  const scored = strategyUniverse.map((row) => ({
    row,
    score: computeDayTradeRadarScore(row, peers, nowMs, ctx),
  }));

  const qualified = scored.filter((entry) => entry.score.eligible);
  qualified.sort(compareOpportunity);

  const top = qualified.slice(0, DAY_TRADE_RADAR_TOP_N).map((entry, index) => {
    const opportunityRank = index + 1;
    const tier: DayTradeAttentionTier | null = attentionTierForOpportunityRank(opportunityRank);
    return {
      ...entry.row,
      volume_rank: entry.row.volume_rank ?? entry.row.rank,
      day_trade_rank: opportunityRank,
      rank: opportunityRank,
      radar_rank: opportunityRank,
      opportunity_score: entry.score.total,
      opportunity_breakdown: entry.score.breakdown,
      opportunity_explain: entry.score.explain,
      attention_tier: tier,
    };
  });

  return {
    candidateUniverseCount,
    qualifiedCount: qualified.length,
    topOpportunities: top,
    gateAudit: summarizeDayTradeCandidateGates(rankedUniverse, nowMs, top.length),
  };
}

export function formatDayTradeRadarStatusSuffix(input: {
  candidateUniverseCount: number;
  topOpportunityCount: number;
  qualifiedCount?: number;
}): string | null {
  const { candidateUniverseCount, topOpportunityCount } = input;
  if (candidateUniverseCount <= 0) return null;
  if (topOpportunityCount <= 0) {
    return `${candidateUniverseCount} candidates detected · 0 ranked opportunities`;
  }
  if (candidateUniverseCount === topOpportunityCount) {
    return `${candidateUniverseCount} qualifying Radar opportunities`;
  }
  return `${candidateUniverseCount} candidates detected · ${topOpportunityCount} ranked for Radar`;
}
