import {
  DAY_TRADE_OPPORTUNITY_WEIGHTS,
  DAY_TRADE_RADAR_MIN_OPPORTUNITY_SCORE,
  DAY_TRADE_RADAR_MIN_VOLUME_60S,
  DAY_TRADE_RADAR_SESSION_VOLUME_EXCEPTION,
  DAY_TRADE_RADAR_SOFT_MIN_SESSION_VOLUME,
  DAY_TRADE_RADAR_TOP_N,
  attentionTierForOpportunityRank,
  type DayTradeAttentionTier,
} from "@/config/day-trade-radar-opportunity.config";
import { isFiniteNumber, parseTimestampMs } from "@/lib/screeners/contract";
import { mapVolumeTrend } from "./multi-radar";
import type { DayTradeRadarOpportunityBreakdown, RadarRankedRow } from "./types";

export interface DayTradeRadarOpportunityScore {
  total: number;
  breakdown: DayTradeRadarOpportunityBreakdown;
  eligible: boolean;
  ineligibleReason?: string;
}

export interface DayTradeRadarOpportunityBoard {
  candidateUniverseCount: number;
  qualifiedCount: number;
  topOpportunities: RadarRankedRow[];
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

function tradabilityFactor(row: RadarRankedRow): number {
  const p = finiteOrNull(row.price);
  if (p === null || p <= 0) return 0.35;
  if (p < 1) {
    const dollar60 = finiteOrNull(row.rolling_dollar_volume_60s);
    return dollar60 !== null && dollar60 >= 500_000 ? 0.6 : 0.3;
  }
  if (p <= 20) return 1;
  if (p <= 50) return 0.92;
  if (p <= 100) return 0.78;
  if (p <= 250) return 0.55;
  return 0.35;
}

function catalystEventFactor(row: RadarRankedRow): number {
  if (typeof row.primary_scanner_event === "string" && row.primary_scanner_event.trim()) {
    return 0.85;
  }
  if (row.promotion_reason && typeof row.promotion_reason === "object") return 0.55;
  if (typeof row.promotion_reason === "string" && row.promotion_reason.trim()) return 0.55;
  return 0.15;
}

function historicalFactor(row: RadarRankedRow): number {
  const ctx = row.historicalContext;
  if (!ctx?.profile?.profileAvailable) return 0.2;
  const comparable = ctx.comparableCount ?? 0;
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

function momentumFactor(row: RadarRankedRow): number {
  const signal = typeof row.signal_status === "string" ? row.signal_status.toUpperCase() : "";
  const signalScore = SIGNAL_MOMENTUM[signal] ?? 0.45;
  const trend = mapVolumeTrend(row.volume_acceleration_pct).label;
  const trendScore = VOLUME_TREND_MOMENTUM[trend] ?? 0.45;
  const move60 = Math.abs(finiteOrNull(row.move_60s_pct) ?? 0);
  const move15 = Math.abs(finiteOrNull(row.move_15s_pct) ?? 0);
  const moveScore = clamp01(Math.max(move60, move15) / 8);
  return clamp01(signalScore * 0.45 + trendScore * 0.4 + moveScore * 0.15);
}

function volumeLiquidityFactor(row: RadarRankedRow, peers: PeerStats): number {
  const session = logNorm(finiteOrNull(row.volume), peers.sessionVolumes);
  const vol60 = logNorm(finiteOrNull(row.rolling_volume_60s), peers.volume60s);
  const velocity = logNorm(finiteOrNull(row.vol_velocity), peers.velocities);
  const dollars = logNorm(finiteOrNull(row.rolling_dollar_volume_60s), peers.dollar60s);
  const rvol5 = logNorm(finiteOrNull(row.rvol_5m), peers.rvol5m);
  const timeAdj = logNorm(finiteOrNull(row.time_adjusted_rvol), peers.timeAdjustedRvol);
  const nowParticipation = clamp01(
    vol60 * 0.32 + velocity * 0.28 + dollars * 0.2 + rvol5 * 0.12 + timeAdj * 0.08,
  );
  return clamp01(session * 0.42 + nowParticipation * 0.58);
}

interface PeerStats {
  sessionVolumes: number[];
  volume60s: number[];
  velocities: number[];
  dollar60s: number[];
  rvol5m: number[];
  timeAdjustedRvol: number[];
}

function buildPeerStats(rows: readonly RadarRankedRow[]): PeerStats {
  const sessionVolumes: number[] = [];
  const volume60s: number[] = [];
  const velocities: number[] = [];
  const dollar60s: number[] = [];
  const rvol5m: number[] = [];
  const timeAdjustedRvol: number[] = [];
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
  }
  return { sessionVolumes, volume60s, velocities, dollar60s, rvol5m, timeAdjustedRvol };
}

export function meetsDayTradeRadarLiquidityGate(row: RadarRankedRow): boolean {
  const session = finiteOrNull(row.volume);
  if (session === null || session <= 0) return false;
  const vol60 = finiteOrNull(row.rolling_volume_60s);
  const velocity = finiteOrNull(row.vol_velocity);
  if (session >= DAY_TRADE_RADAR_SESSION_VOLUME_EXCEPTION) return true;
  if (vol60 !== null && vol60 >= DAY_TRADE_RADAR_MIN_VOLUME_60S) return true;
  if (velocity !== null && velocity >= 2_500) return true;
  if (session >= DAY_TRADE_RADAR_SOFT_MIN_SESSION_VOLUME && vol60 !== null && vol60 > 0) {
    return true;
  }
  return false;
}

export function computeDayTradeRadarScore(
  row: RadarRankedRow,
  peers: PeerStats,
  nowMs: number,
): DayTradeRadarOpportunityScore {
  if (!meetsDayTradeRadarLiquidityGate(row)) {
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
      eligible: false,
      ineligibleReason: "insufficient_liquidity",
    };
  }

  const volumeLiquidity = volumeLiquidityFactor(row, peers);
  const momentum = momentumFactor(row);
  const freshnessBase = freshnessClassScore(row.freshness_class);
  const freshnessTime = recencyBoost(row.promoted_at ?? row.primary_scanner_event_at, nowMs);
  const freshness = clamp01(freshnessBase * 0.55 + freshnessTime * 0.45);
  const hodStructure = hodStructureFactor(row);
  const catalystEvent = catalystEventFactor(row);
  const tradability = tradabilityFactor(row);
  const historical = historicalFactor(row);

  const w = DAY_TRADE_OPPORTUNITY_WEIGHTS;
  const total =
    volumeLiquidity * w.volumeLiquidity +
    momentum * w.momentum +
    freshness * w.freshness +
    hodStructure * w.hodStructure +
    catalystEvent * w.catalystEvent +
    tradability * w.tradability +
    historical * w.historical;

  const eligible = total >= DAY_TRADE_RADAR_MIN_OPPORTUNITY_SCORE;

  return {
    total: Math.round(total * 10) / 10,
    breakdown: {
      volumeLiquidity: Math.round(volumeLiquidity * 100),
      momentum: Math.round(momentum * 100),
      freshness: Math.round(freshness * 100),
      hodStructure: Math.round(hodStructure * 100),
      catalystEvent: Math.round(catalystEvent * 100),
      tradability: Math.round(tradability * 100),
      historical: Math.round(historical * 100),
    },
    eligible,
    ineligibleReason: eligible ? undefined : "below_opportunity_threshold",
  };
}

function compareOpportunity(
  a: { row: RadarRankedRow; score: DayTradeRadarOpportunityScore },
  b: { row: RadarRankedRow; score: DayTradeRadarOpportunityScore },
): number {
  if (a.score.total !== b.score.total) return b.score.total - a.score.total;
  const volA = finiteOrNull(a.row.volume) ?? 0;
  const volB = finiteOrNull(b.row.volume) ?? 0;
  if (volB !== volA) return volB - volA;
  const velA = finiteOrNull(a.row.vol_velocity) ?? 0;
  const velB = finiteOrNull(b.row.vol_velocity) ?? 0;
  if (velB !== velA) return velB - velA;
  return (a.row.volume_rank ?? a.row.rank) - (b.row.volume_rank ?? b.row.rank);
}

/**
 * Rank the Day Trade desk from the full volume-first universe.
 * Preserves discovery order on each row as `volume_rank`.
 */
export function buildDayTradeRadarOpportunityBoard(
  rankedUniverse: readonly RadarRankedRow[],
  nowMs: number,
): DayTradeRadarOpportunityBoard {
  const candidateUniverseCount = rankedUniverse.length;
  if (candidateUniverseCount === 0) {
    return { candidateUniverseCount: 0, qualifiedCount: 0, topOpportunities: [] };
  }

  const withVolumeRank = rankedUniverse.map((row) => ({
    ...row,
    volume_rank: row.volume_rank ?? row.rank,
  }));

  /** Main desk: sub-$1 names stay on the Penny panel, not the Top-10 opportunity desk. */
  const deskUniverse = withVolumeRank.filter((row) => {
    const price = finiteOrNull(row.price);
    return price === null || price >= 1;
  });

  const peers = buildPeerStats(deskUniverse.length > 0 ? deskUniverse : withVolumeRank);
  const scored = (deskUniverse.length > 0 ? deskUniverse : withVolumeRank).map((row) => ({
    row,
    score: computeDayTradeRadarScore(row, peers, nowMs),
  }));

  const qualified = scored.filter((entry) => entry.score.eligible);
  qualified.sort(compareOpportunity);

  const top = qualified.slice(0, DAY_TRADE_RADAR_TOP_N).map((entry, index) => {
    const opportunityRank = index + 1;
    const tier: DayTradeAttentionTier | null = attentionTierForOpportunityRank(opportunityRank);
    return {
      ...entry.row,
      volume_rank: entry.row.volume_rank ?? entry.row.rank,
      rank: opportunityRank,
      radar_rank: opportunityRank,
      opportunity_score: entry.score.total,
      opportunity_breakdown: entry.score.breakdown,
      attention_tier: tier,
    };
  });

  return {
    candidateUniverseCount,
    qualifiedCount: qualified.length,
    topOpportunities: top,
  };
}

export function formatDayTradeRadarStatusSuffix(input: {
  candidateUniverseCount: number;
  topOpportunityCount: number;
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
