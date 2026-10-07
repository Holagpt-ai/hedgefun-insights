import { HISTORICAL_MATCH } from "@/config/scanner-intelligence-v2.config";
import { episodeToFeatureSet, type HistoricalEpisodeFeatureSet } from "@/lib/historical-intelligence/episode-features";
import type { RepeatMoverComparableEpisode, RepeatMoverContext } from "@/types/repeat-mover";
import { finiteMetric } from "@/lib/screeners/screener-metric-display";

export interface CurrentSetupSnapshot {
  symbol: string;
  movePct: number | null;
  volume: number | null;
  rvol: number | null;
  rvol5m: number | null;
  volumeVelocity: number | null;
  volumeAccelerationPct: number | null;
  scannerEvent: string | null;
  vwapSide: string | null;
  distanceFromHodPct: number | null;
  catalystCategory: string | null;
}

export interface HistoricalTopMatch {
  date: string | null;
  similarityScore: number;
  setup: string | null;
  catalystType: string | null;
  continuation: boolean | null;
  nextDayReturn: number | null;
  mfe: number | null;
  mae: number | null;
  episodeId: string;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function pctSimilarity(a: number | null, b: number | null, scale: number): number {
  if (a === null || b === null) return 0.35;
  const delta = Math.abs(a - b);
  return clamp01(1 - delta / scale);
}

function scoreEpisode(
  current: CurrentSetupSnapshot,
  features: HistoricalEpisodeFeatureSet,
): number {
  let score = 0;
  let weight = 0;
  const add = (w: number, s: number) => {
    score += w * s;
    weight += w;
  };

  add(0.22, pctSimilarity(current.movePct, features.movePct, 25));
  add(0.18, pctSimilarity(finiteMetric(current.rvol), features.rvol, 8));
  add(0.12, pctSimilarity(finiteMetric(current.rvol5m), features.rvol5m, 6));
  add(0.12, pctSimilarity(finiteMetric(current.volumeVelocity), features.volumeVelocity, 80_000));
  add(
    0.1,
    pctSimilarity(finiteMetric(current.volumeAccelerationPct), features.volumeAccelerationPct, 40),
  );
  add(
    0.08,
    pctSimilarity(finiteMetric(current.distanceFromHodPct), features.hodProximityPct, 8),
  );

  if (current.scannerEvent && features.setupCategory) {
    add(0.08, current.scannerEvent.length > 0 ? 0.7 : 0.3);
  }
  if (current.catalystCategory && features.catalystType) {
    add(0.1, current.catalystCategory === features.catalystType ? 1 : 0.45);
  }

  return weight > 0 ? score / weight : 0;
}

export function buildCurrentSetupFromRadarCandidate(row: {
  symbol: string;
  last_price?: number | null;
  change_percent?: number | null;
  rvol_5m?: number | null;
  volume_velocity?: number | null;
  volume_acceleration_pct?: number | null;
  primary_scanner_event?: string | null;
  distance_from_hod_pct?: number | null;
}): CurrentSetupSnapshot {
  return {
    symbol: row.symbol.trim().toUpperCase(),
    movePct: null,
    volume: null,
    rvol: null,
    rvol5m: finiteMetric(row.rvol_5m),
    volumeVelocity: finiteMetric(row.volume_velocity),
    volumeAccelerationPct: finiteMetric(row.volume_acceleration_pct),
    scannerEvent: row.primary_scanner_event ?? null,
    vwapSide: null,
    distanceFromHodPct: finiteMetric(row.distance_from_hod_pct),
    catalystCategory: null,
  };
}

export function buildCurrentSetupFromRadarRow(row: {
  symbol: string;
  change_percent?: number | null;
  volume?: number | null;
  rvol?: number | null;
  rvol_5m?: number | null;
  vol_velocity?: number | null;
  volume_velocity?: number | null;
  volume_acceleration_pct?: number | null;
  primary_scanner_event?: string | null;
  vwap_side?: string | null;
  distance_from_hod_pct?: number | null;
  hod_distance_percent?: number | null;
}): CurrentSetupSnapshot {
  return {
    symbol: row.symbol.trim().toUpperCase(),
    movePct: finiteMetric(row.change_percent),
    volume: finiteMetric(row.volume),
    rvol: finiteMetric(row.rvol),
    rvol5m: finiteMetric(row.rvol_5m),
    volumeVelocity:
      finiteMetric(row.vol_velocity) ?? finiteMetric(row.volume_velocity),
    volumeAccelerationPct: finiteMetric(row.volume_acceleration_pct),
    scannerEvent: row.primary_scanner_event ?? null,
    vwapSide: row.vwap_side ?? null,
    distanceFromHodPct:
      finiteMetric(row.distance_from_hod_pct) ?? finiteMetric(row.hod_distance_percent),
    catalystCategory: null,
  };
}

export function rankHistoricalMatches(
  current: CurrentSetupSnapshot,
  context: RepeatMoverContext | null | undefined,
): HistoricalTopMatch[] {
  const episodes = context?.comparableHistory?.closestComparableEpisodes ?? [];
  const symbol = context?.currentSymbol ?? current.symbol;
  const scored = episodes.map((ep: RepeatMoverComparableEpisode) => {
    const features = episodeToFeatureSet(ep, symbol);
    const similarityScore = scoreEpisode(current, features);
    return {
      date: features.sessionDate,
      similarityScore: Math.round(similarityScore * 100) / 100,
      setup: features.setupCategory,
      catalystType: features.catalystType,
      continuation: features.continuation,
      nextDayReturn: features.nextSessionReturnPct,
      mfe: features.maxFavorableExcursionPct,
      mae: features.maxAdverseExcursionPct,
      episodeId: features.episodeId,
    };
  });

  return scored
    .filter((m) => m.similarityScore >= HISTORICAL_MATCH.minSimilarityScore)
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .slice(0, HISTORICAL_MATCH.maxTopMatches);
}
