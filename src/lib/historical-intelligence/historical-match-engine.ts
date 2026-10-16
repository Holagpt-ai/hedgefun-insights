import { HISTORICAL_MATCH } from "@/config/scanner-intelligence-v2.config";
import { episodeToFeatureSet, type HistoricalEpisodeFeatureSet } from "@/lib/historical-intelligence/episode-features";
import type { RepeatMoverComparableEpisode, RepeatMoverContext } from "@/types/repeat-mover";
import { finiteMetric } from "@/lib/screeners/screener-metric-display";
import type { HistoricalMatchEvidenceQuality } from "@/lib/historical-intelligence/historical-match-summary";

export interface CurrentSetupSnapshot {
  symbol: string;
  movePct: number | null;
  gapPct: number | null;
  volume: number | null;
  rvol: number | null;
  rvol5m: number | null;
  volumeVelocity: number | null;
  volumeAccelerationPct: number | null;
  scannerEvent: string | null;
  vwapSide: string | null;
  distanceFromHodPct: number | null;
  catalystCategory: string | null;
  floatTurnover: number | null;
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
  featuresCompared: number;
  featuresWithBothSides: number;
  matchEvidenceQuality: Exclude<HistoricalMatchEvidenceQuality, "INSUFFICIENT">;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function pctSimilarity(a: number, b: number, scale: number): number {
  const delta = Math.abs(a - b);
  return clamp01(1 - delta / scale);
}

function matchEvidenceFromFeatures(
  featuresWithBothSides: number,
  score: number,
): HistoricalTopMatch["matchEvidenceQuality"] {
  if (featuresWithBothSides <= HISTORICAL_MATCH.sparseFeatureThreshold) return "SPARSE";
  if (
    featuresWithBothSides >= HISTORICAL_MATCH.minFeaturesForStrongMatch &&
    score >= HISTORICAL_MATCH.minSimilarityScore
  ) {
    return "STRONG";
  }
  return "MODERATE";
}

function scoreEpisode(
  current: CurrentSetupSnapshot,
  features: HistoricalEpisodeFeatureSet,
): { score: number; featuresCompared: number; featuresWithBothSides: number } {
  let score = 0;
  let weight = 0;
  let featuresCompared = 0;
  let featuresWithBothSides = 0;

  const addNumeric = (w: number, a: number | null, b: number | null, scale: number) => {
    featuresCompared += 1;
    if (a === null || b === null) return;
    featuresWithBothSides += 1;
    score += w * pctSimilarity(a, b, scale);
    weight += w;
  };

  addNumeric(0.2, current.movePct, features.movePct, 25);
  addNumeric(0.08, finiteMetric(current.gapPct), features.gapPct, 12);
  addNumeric(0.16, finiteMetric(current.rvol), features.rvol, 8);
  addNumeric(0.06, finiteMetric(current.volume), features.sessionVolume, 5_000_000);
  addNumeric(0.05, finiteMetric(current.floatTurnover), features.floatTurnover, 2);
  addNumeric(0.12, finiteMetric(current.rvol5m), features.rvol5m, 6);
  addNumeric(0.12, finiteMetric(current.volumeVelocity), features.volumeVelocity, 80_000);
  addNumeric(
    0.1,
    finiteMetric(current.volumeAccelerationPct),
    features.volumeAccelerationPct,
    40,
  );
  addNumeric(
    0.08,
    finiteMetric(current.distanceFromHodPct),
    features.hodProximityPct,
    8,
  );

  if (current.scannerEvent && features.setupCategory) {
    featuresCompared += 1;
    featuresWithBothSides += 1;
    const w = 0.08;
    score += w * (current.scannerEvent.length > 0 ? 0.7 : 0.3);
    weight += w;
  }
  if (current.catalystCategory && features.catalystType) {
    featuresCompared += 1;
    featuresWithBothSides += 1;
    const w = 0.1;
    score += w * (current.catalystCategory === features.catalystType ? 1 : 0.45);
    weight += w;
  }

  return {
    score: weight > 0 ? score / weight : 0,
    featuresCompared,
    featuresWithBothSides,
  };
}

function normalizeSessionDate(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

/** Exclude current session and future-dated episodes from historical comparison. */
export function filterComparableEpisodesForSession(
  episodes: readonly RepeatMoverComparableEpisode[],
  currentSessionDate: string | null | undefined,
): RepeatMoverComparableEpisode[] {
  const session = normalizeSessionDate(currentSessionDate);
  if (!session) return [...episodes];
  return episodes.filter((ep) => {
    const epDate = normalizeSessionDate(ep.sessionDate);
    if (!epDate) return true;
    return epDate < session;
  });
}

export function dedupeHistoricalTopMatches(matches: HistoricalTopMatch[]): HistoricalTopMatch[] {
  const byId = new Map<string, HistoricalTopMatch>();
  for (const match of matches) {
    const key = match.episodeId.trim();
    if (!key) continue;
    const incumbent = byId.get(key);
    if (!incumbent || match.similarityScore > incumbent.similarityScore) {
      byId.set(key, match);
    }
  }
  return [...byId.values()];
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
    gapPct: null,
    volume: null,
    rvol: null,
    rvol5m: finiteMetric(row.rvol_5m),
    volumeVelocity: finiteMetric(row.volume_velocity),
    volumeAccelerationPct: finiteMetric(row.volume_acceleration_pct),
    scannerEvent: row.primary_scanner_event ?? null,
    vwapSide: null,
    distanceFromHodPct: finiteMetric(row.distance_from_hod_pct),
    catalystCategory: null,
    floatTurnover: null,
  };
}

export function buildCurrentSetupFromRadarRow(row: {
  symbol: string;
  change_percent?: number | null;
  gap_percent?: number | null;
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
  float_turnover?: number | null;
}): CurrentSetupSnapshot {
  return {
    symbol: row.symbol.trim().toUpperCase(),
    movePct: finiteMetric(row.change_percent),
    gapPct: finiteMetric(row.gap_percent),
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
    floatTurnover: finiteMetric(row.float_turnover),
  };
}

export function rankHistoricalMatches(
  current: CurrentSetupSnapshot,
  context: RepeatMoverContext | null | undefined,
): HistoricalTopMatch[] {
  const rawEpisodes = context?.comparableHistory?.closestComparableEpisodes ?? [];
  const currentSessionDate = context?.currentContext?.sessionDate ?? null;
  const episodes = filterComparableEpisodesForSession(rawEpisodes, currentSessionDate);
  const symbol = context?.currentSymbol ?? current.symbol;

  const scored = episodes.map((ep: RepeatMoverComparableEpisode) => {
    const features = episodeToFeatureSet(ep, symbol);
    const scoredEpisode = scoreEpisode(current, features);
    const similarityScore = Math.round(scoredEpisode.score * 100) / 100;
    return {
      date: features.sessionDate,
      similarityScore,
      setup: features.setupCategory,
      catalystType: features.catalystType,
      continuation: features.continuation,
      nextDayReturn: features.nextSessionReturnPct,
      mfe: features.maxFavorableExcursionPct,
      mae: features.maxAdverseExcursionPct,
      episodeId: features.episodeId,
      featuresCompared: scoredEpisode.featuresCompared,
      featuresWithBothSides: scoredEpisode.featuresWithBothSides,
      matchEvidenceQuality: matchEvidenceFromFeatures(
        scoredEpisode.featuresWithBothSides,
        similarityScore,
      ),
    };
  });

  return dedupeHistoricalTopMatches(
    scored
      .filter((m) => m.similarityScore >= HISTORICAL_MATCH.minSimilarityScore)
      .sort((a, b) => b.similarityScore - a.similarityScore)
      .slice(0, HISTORICAL_MATCH.maxTopMatches),
  );
}
