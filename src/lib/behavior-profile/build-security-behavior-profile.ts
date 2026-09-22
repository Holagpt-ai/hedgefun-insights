/**
 * Derives Security Behavior Profile V1 from persisted daily history and episodes.
 * Deterministic, evidence-only. Does not predict future behavior.
 */

import {
  behaviorProfileConfig,
  type BehaviorProfileConfig,
  type BehaviorProfileSampleQuality,
} from "@/config/behavior-profile.config";
import { etSessionBounds } from "@/lib/historical-backfill/dates";
import type { SecurityBehaviorProfile } from "@/types/behavior-profile";
import type {
  MarketBehaviorEpisode,
  SecurityDailyHistory,
} from "@/types/security-intelligence";
import type { SecurityId } from "@/types/security-identity";

export interface BuildSecurityBehaviorProfileInput {
  securityId: SecurityId;
  dailyHistory: readonly SecurityDailyHistory[];
  episodes: readonly MarketBehaviorEpisode[];
  computedAt: string;
  config?: Partial<BehaviorProfileConfig>;
}

function finiteNumbers(values: Array<number | null | undefined>): number[] {
  return values.filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function maxValue(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.max(...values);
}

export function closePosition(daily: SecurityDailyHistory): number | null {
  const { high, low, close } = daily;
  if (high === null || low === null || close === null) return null;
  if (!Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) return null;
  const range = high - low;
  if (range <= 0) return null;
  const position = (close - low) / range;
  return Number.isFinite(position) ? position : null;
}

export function buildEpisodeSessionMaps(dailyRows: readonly SecurityDailyHistory[]): {
  openTimestampToDate: Map<string, string>;
  dailyByDate: Map<string, SecurityDailyHistory>;
} {
  const openTimestampToDate = new Map<string, string>();
  const dailyByDate = new Map<string, SecurityDailyHistory>();
  for (const daily of dailyRows) {
    dailyByDate.set(daily.sessionDate, daily);
    const bounds = etSessionBounds(daily.sessionDate);
    if (bounds) openTimestampToDate.set(bounds.open, daily.sessionDate);
  }
  return { openTimestampToDate, dailyByDate };
}

export function episodeSessionDate(
  episode: MarketBehaviorEpisode,
  openTimestampToDate: Map<string, string>,
): string | null {
  const mapped = openTimestampToDate.get(episode.episodeStart);
  if (mapped) return mapped;
  return episode.episodeStart.length >= 10 ? episode.episodeStart.slice(0, 10) : null;
}

export function episodeMovePct(
  episode: MarketBehaviorEpisode,
  dailyByDate: Map<string, SecurityDailyHistory>,
  sessionDate: string | null,
): number | null {
  if (sessionDate) {
    const daily = dailyByDate.get(sessionDate);
    if (daily?.movePct !== null && daily.movePct !== undefined && Number.isFinite(daily.movePct)) {
      return daily.movePct;
    }
  }
  if (episode.endPrice !== null && episode.startPrice !== null && episode.startPrice !== 0) {
    const derived = ((episode.endPrice - episode.startPrice) / episode.startPrice) * 100;
    return Number.isFinite(derived) ? derived : null;
  }
  return null;
}

function absoluteMovePct(episode: MarketBehaviorEpisode, signedMove: number | null): number | null {
  if (signedMove !== null) return Math.abs(signedMove);
  const pos = episode.maxPositiveMovePct;
  const neg = episode.maxNegativeMovePct;
  const candidates = finiteNumbers([
    pos !== null ? Math.abs(pos) : null,
    neg !== null ? Math.abs(neg) : null,
  ]);
  return candidates.length > 0 ? Math.max(...candidates) : null;
}

function isComparableEpisode(
  candidate: MarketBehaviorEpisode,
  reference: MarketBehaviorEpisode,
  referenceMove: number | null,
  candidateMove: number | null,
  config: BehaviorProfileConfig,
): boolean {
  if (candidate.episodeId === reference.episodeId) return false;
  if (config.comparableRequireSameDirection && candidate.direction !== reference.direction) return false;
  if (referenceMove === null || candidateMove === null) return false;
  return Math.abs(Math.abs(referenceMove) - Math.abs(candidateMove)) <= config.comparableMovePctTolerance;
}

function sampleSizeQuality(
  sessionsObserved: number,
  episodeCount: number,
  config: BehaviorProfileConfig,
): BehaviorProfileSampleQuality {
  if (episodeCount === 0 || sessionsObserved < config.minSessionsForLimitedQuality) return "INSUFFICIENT";
  if (
    episodeCount >= config.minEpisodesForRobustQuality
    && sessionsObserved >= config.minSessionsForRobustQuality
  ) {
    return "ROBUST";
  }
  if (
    episodeCount >= config.minEpisodesForAdequateQuality
    && sessionsObserved >= config.minSessionsForAdequateQuality
  ) {
    return "ADEQUATE";
  }
  if (episodeCount >= config.minEpisodesForLimitedQuality) return "LIMITED";
  return "INSUFFICIENT";
}

function medianDaysBetween(sortedDates: string[]): number | null {
  if (sortedDates.length < 2) return null;
  const gaps: number[] = [];
  for (let index = 1; index < sortedDates.length; index += 1) {
    const prev = Date.parse(`${sortedDates[index - 1]}T12:00:00Z`);
    const next = Date.parse(`${sortedDates[index]}T12:00:00Z`);
    if (!Number.isFinite(prev) || !Number.isFinite(next)) continue;
    gaps.push(Math.round((next - prev) / 86_400_000));
  }
  return median(gaps);
}

export function buildSecurityBehaviorProfile(
  input: BuildSecurityBehaviorProfileInput,
): SecurityBehaviorProfile {
  const config = behaviorProfileConfig(input.config);
  const dailyRows = [...input.dailyHistory]
    .filter((row) => row.securityId === input.securityId)
    .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate));
  const episodeRows = [...input.episodes]
    .filter((row) => row.securityId === input.securityId)
    .sort((a, b) => a.episodeStart.localeCompare(b.episodeStart));

  const { openTimestampToDate, dailyByDate } = buildEpisodeSessionMaps(dailyRows);

  const sessionsObserved = dailyRows.filter((row) =>
    row.open !== null && row.high !== null && row.low !== null && row.close !== null,
  ).length;

  const historyStartDate = dailyRows[0]?.sessionDate ?? null;
  const historyEndDate = dailyRows[dailyRows.length - 1]?.sessionDate ?? null;
  const observedSymbol = dailyRows[dailyRows.length - 1]?.observedSymbol
    ?? episodeRows[episodeRows.length - 1]?.observedSymbol
    ?? null;

  const notableCount = episodeRows.filter((row) => row.tier === "NOTABLE").length;
  const significantCount = episodeRows.filter((row) => row.tier === "SIGNIFICANT").length;
  const extremeCount = episodeRows.filter((row) => row.tier === "EXTREME").length;
  const positiveEpisodeCount = episodeRows.filter((row) => row.direction === "POSITIVE").length;
  const negativeEpisodeCount = episodeRows.filter((row) => row.direction === "NEGATIVE").length;
  const mixedEpisodeCount = episodeRows.filter((row) => row.direction === "MIXED").length;
  const directionalTotal = positiveEpisodeCount + negativeEpisodeCount;
  const positiveEpisodePct = directionalTotal > 0 ? (positiveEpisodeCount / directionalTotal) * 100 : null;
  const negativeEpisodePct = directionalTotal > 0 ? (negativeEpisodeCount / directionalTotal) * 100 : null;

  const signedMoves: number[] = [];
  const absoluteMoves: number[] = [];
  const positivePeaks: number[] = [];
  const negativeTroughs: number[] = [];

  for (const episode of episodeRows) {
    const sessionDate = episodeSessionDate(episode, openTimestampToDate);
    const move = episodeMovePct(episode, dailyByDate, sessionDate);
    if (move !== null) signedMoves.push(move);
    const absMove = absoluteMovePct(episode, move);
    if (absMove !== null) absoluteMoves.push(absMove);
    if (episode.maxPositiveMovePct !== null && Number.isFinite(episode.maxPositiveMovePct)) {
      positivePeaks.push(episode.maxPositiveMovePct);
    }
    if (episode.maxNegativeMovePct !== null && Number.isFinite(episode.maxNegativeMovePct)) {
      negativeTroughs.push(episode.maxNegativeMovePct);
    }
  }

  const episodeVolumes = finiteNumbers(episodeRows.map((row) => row.volume));
  const episodeRvols = finiteNumbers(episodeRows.map((row) => row.rvol));
  const episodeDollarVolumes = finiteNumbers(episodeRows.map((row) => row.dollarVolume));

  const episodeDates = episodeRows
    .map((episode) => episodeSessionDate(episode, openTimestampToDate))
    .filter((date): date is string => date !== null)
    .sort((a, b) => a.localeCompare(b));

  const episodeCount = episodeRows.length;
  const episodesPer30Sessions = sessionsObserved >= config.recurrenceWindowSessions30
    ? (episodeCount / sessionsObserved) * config.recurrenceWindowSessions30
    : null;
  const episodesPer90Sessions = sessionsObserved >= config.recurrenceWindowSessions90
    ? (episodeCount / sessionsObserved) * config.recurrenceWindowSessions90
    : null;

  const mostRecentEpisodeDate = episodeDates[episodeDates.length - 1] ?? null;
  const mostRecentEpisode = episodeRows[episodeRows.length - 1] ?? null;
  let priorComparableEpisodeCount = 0;
  if (mostRecentEpisode && mostRecentEpisodeDate) {
    const referenceMove = episodeMovePct(
      mostRecentEpisode,
      dailyByDate,
      mostRecentEpisodeDate,
    );
    for (const episode of episodeRows) {
      const sessionDate = episodeSessionDate(episode, openTimestampToDate);
      if (!sessionDate || sessionDate >= mostRecentEpisodeDate) continue;
      const candidateMove = episodeMovePct(episode, dailyByDate, sessionDate);
      if (isComparableEpisode(episode, mostRecentEpisode, referenceMove, candidateMove, config)) {
        priorComparableEpisodeCount += 1;
      }
    }
  }

  const positiveClosePositions: number[] = [];
  const negativeClosePositions: number[] = [];
  for (const episode of episodeRows) {
    const sessionDate = episodeSessionDate(episode, openTimestampToDate);
    if (!sessionDate) continue;
    const daily = dailyByDate.get(sessionDate);
    if (!daily) continue;
    const position = closePosition(daily);
    if (position === null) continue;
    if (episode.direction === "POSITIVE") positiveClosePositions.push(position);
    if (episode.direction === "NEGATIVE") negativeClosePositions.push(position);
  }

  const pctAbove = (values: number[], threshold: number): number | null =>
    values.length === 0 ? null : (values.filter((value) => value >= threshold).length / values.length) * 100;
  const pctBelow = (values: number[], threshold: number): number | null =>
    values.length === 0 ? null : (values.filter((value) => value <= threshold).length / values.length) * 100;

  let nextSessionPositiveContinuationCount = 0;
  let nextSessionNegativeContinuationCount = 0;
  let continuationSampleSize = 0;
  let positiveContinuationSampleSize = 0;
  let negativeContinuationSampleSize = 0;
  const sessionIndex = new Map(dailyRows.map((row, index) => [row.sessionDate, index]));

  for (const episode of episodeRows) {
    if (episode.direction !== "POSITIVE" && episode.direction !== "NEGATIVE") continue;
    const sessionDate = episodeSessionDate(episode, openTimestampToDate);
    if (!sessionDate) continue;
    const index = sessionIndex.get(sessionDate);
    if (index === undefined || index + 1 >= dailyRows.length) continue;
    const nextDaily = dailyRows[index + 1];
    if (nextDaily.movePct === null || !Number.isFinite(nextDaily.movePct)) continue;
    continuationSampleSize += 1;
    if (episode.direction === "POSITIVE") {
      positiveContinuationSampleSize += 1;
      if (nextDaily.movePct >= config.continuationMinMovePct) {
        nextSessionPositiveContinuationCount += 1;
      }
    }
    if (episode.direction === "NEGATIVE") {
      negativeContinuationSampleSize += 1;
      if (nextDaily.movePct <= -config.continuationMinMovePct) {
        nextSessionNegativeContinuationCount += 1;
      }
    }
  }

  const latestSourceHistoryDate = historyEndDate;
  const latestEpisodeDateUsed = mostRecentEpisodeDate;

  return {
    version: "v1",
    securityId: input.securityId,
    observedSymbol,
    computedAt: input.computedAt,
    coverage: {
      historyStartDate,
      historyEndDate,
      sessionsObserved,
      episodeCount,
      sampleSizeQuality: sampleSizeQuality(sessionsObserved, episodeCount, config),
    },
    episodeDistribution: {
      notableCount,
      significantCount,
      extremeCount,
      positiveEpisodeCount,
      negativeEpisodeCount,
      mixedEpisodeCount,
      positiveEpisodePct,
      negativeEpisodePct,
    },
    moveBehavior: {
      medianEpisodeMovePct: median(signedMoves),
      averageEpisodeMovePct: average(signedMoves),
      maxPositiveEpisodeMovePct: maxValue(positivePeaks),
      maxNegativeEpisodeMovePct: negativeTroughs.length > 0 ? Math.min(...negativeTroughs) : null,
      medianAbsoluteMovePct: median(absoluteMoves),
    },
    volumeBehavior: {
      medianEpisodeVolume: median(episodeVolumes),
      medianEpisodeRvol: median(episodeRvols),
      maxEpisodeRvol: maxValue(episodeRvols),
      medianEpisodeDollarVolume: median(episodeDollarVolumes),
    },
    recurrence: {
      episodesPer30Sessions,
      episodesPer90Sessions,
      medianDaysBetweenEpisodes: medianDaysBetween(episodeDates),
      mostRecentEpisodeDate,
      priorComparableEpisodeCount,
    },
    closeBehavior: {
      positiveEpisodesClosingUpperQuartilePct: pctAbove(positiveClosePositions, config.closeUpperQuartileMin),
      positiveEpisodesClosingNearHighPct: pctAbove(positiveClosePositions, config.closeNearHighMin),
      negativeEpisodesClosingNearLowPct: pctBelow(negativeClosePositions, config.closeNearLowMax),
    },
    continuation: {
      nextSessionPositiveContinuationCount,
      nextSessionNegativeContinuationCount,
      continuationSampleSize,
      nextSessionPositiveContinuationRate: positiveContinuationSampleSize > 0
        ? (nextSessionPositiveContinuationCount / positiveContinuationSampleSize) * 100
        : null,
      nextSessionNegativeContinuationRate: negativeContinuationSampleSize > 0
        ? (nextSessionNegativeContinuationCount / negativeContinuationSampleSize) * 100
        : null,
    },
    freshness: {
      latestSourceHistoryDate,
      latestEpisodeDateUsed,
      sourceDailyRowCount: dailyRows.length,
      sourceEpisodeCount: episodeRows.length,
    },
  };
}
