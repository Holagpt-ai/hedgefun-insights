/**
 * Deno-safe Repeat Movers V1 assembly (mirrors src/lib/repeat-movers/get-repeat-mover-context.ts).
 * Evidence only — no prediction fields.
 */

import { getComparableHistoricalEpisodes } from "./comparable-historical-episodes.ts";
import { deriveRepeatMoverEvidenceLabels } from "./derive-evidence-labels.ts";
import { normalizeRepeatMoverCurrentContext } from "./normalize-context.ts";
import type {
  RepeatMoverContext,
  RepeatMoverContextInput,
  RepeatMoverProfileSnapshot,
} from "./types.ts";

export const REPEAT_MOVER_VERSION = "v1";
const DEFAULT_COMPARABLE_LIMIT = 10;
const COMPARABLE_MOVE_PCT_TOLERANCE = 3;
const COMPARABLE_EXCLUDE_IDENTICAL_ABS_MOVE = true;

export function unavailableRepeatMoverProfileSnapshot(): RepeatMoverProfileSnapshot {
  return {
    profileAvailable: false,
    sampleSizeQuality: null,
    sessionsObserved: null,
    episodeCount: null,
    notableCount: null,
    significantCount: null,
    extremeCount: null,
    positiveEpisodeCount: null,
    negativeEpisodeCount: null,
    mixedEpisodeCount: null,
    positiveEpisodePct: null,
    negativeEpisodePct: null,
    episodesPer30Sessions: null,
    episodesPer90Sessions: null,
    medianDaysBetweenEpisodes: null,
    positiveCloseUpperQuartilePct: null,
    positiveCloseNearHighPct: null,
    negativeCloseNearLowPct: null,
    nextSessionPositiveContinuationRate: null,
    nextSessionNegativeContinuationRate: null,
    historyStartDate: null,
    historyEndDate: null,
    computedAt: null,
    latestSourceHistoryDate: null,
    latestEpisodeDateUsed: null,
    sourceDailyRowCount: null,
    sourceEpisodeCount: null,
  };
}

function readNum(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readInt(value: unknown): number | null {
  const parsed = readNum(value);
  return parsed === null ? null : Math.trunc(parsed);
}

function readDate(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  return value.slice(0, 10);
}

export function repeatMoverProfileSnapshotFromProfileRow(
  row: Record<string, unknown>,
): RepeatMoverProfileSnapshot {
  return {
    profileAvailable: true,
    sampleSizeQuality: typeof row.sample_size_quality === "string"
      ? row.sample_size_quality
      : null,
    sessionsObserved: readInt(row.sessions_observed),
    episodeCount: readInt(row.episode_count),
    notableCount: readInt(row.notable_count),
    significantCount: readInt(row.significant_count),
    extremeCount: readInt(row.extreme_count),
    positiveEpisodeCount: readInt(row.positive_episode_count),
    negativeEpisodeCount: readInt(row.negative_episode_count),
    mixedEpisodeCount: readInt(row.mixed_episode_count),
    positiveEpisodePct: readNum(row.positive_episode_pct),
    negativeEpisodePct: readNum(row.negative_episode_pct),
    episodesPer30Sessions: readNum(row.episodes_per_30_sessions),
    episodesPer90Sessions: readNum(row.episodes_per_90_sessions),
    medianDaysBetweenEpisodes: readNum(row.median_days_between_episodes),
    positiveCloseUpperQuartilePct: readNum(row.positive_close_upper_quartile_pct),
    positiveCloseNearHighPct: readNum(row.positive_close_near_high_pct),
    negativeCloseNearLowPct: readNum(row.negative_close_near_low_pct),
    nextSessionPositiveContinuationRate: readNum(row.next_session_positive_continuation_rate),
    nextSessionNegativeContinuationRate: readNum(row.next_session_negative_continuation_rate),
    historyStartDate: readDate(row.history_start_date),
    historyEndDate: readDate(row.history_end_date),
    computedAt: typeof row.computed_at === "string" ? row.computed_at : null,
    latestSourceHistoryDate: readDate(row.latest_source_history_date),
    latestEpisodeDateUsed: readDate(row.latest_episode_date_used),
    sourceDailyRowCount: readInt(row.source_daily_row_count),
    sourceEpisodeCount: readInt(row.source_episode_count),
  };
}

export function assembleRepeatMoverContext(input: {
  securityId: string;
  profileRow: Record<string, unknown> | null;
  dailyHistory: readonly Record<string, unknown>[];
  episodes: readonly Record<string, unknown>[];
  currentContext: RepeatMoverContextInput;
  assembledAt?: string;
  comparableLimit?: number;
}): RepeatMoverContext {
  const assembledAt = input.assembledAt ?? new Date().toISOString();
  const currentContext = normalizeRepeatMoverCurrentContext(input.currentContext);
  const limit = input.comparableLimit ?? DEFAULT_COMPARABLE_LIMIT;

  if (!input.profileRow) {
    const profile = unavailableRepeatMoverProfileSnapshot();
    const comparableHistory = {
      comparableEpisodeCount: 0,
      closestComparableEpisodes: [],
      mostRecentComparableEpisode: null,
    };
    return {
      version: REPEAT_MOVER_VERSION,
      securityId: input.securityId,
      currentSymbol: currentContext.observedSymbol,
      currentContext,
      profile,
      comparableHistory,
      evidenceLabels: deriveRepeatMoverEvidenceLabels({ profile, comparableHistory }),
      assembledAt,
    };
  }

  let comparables = getComparableHistoricalEpisodes({
    securityId: input.securityId,
    dailyHistory: input.dailyHistory,
    episodes: input.episodes,
    currentContext: {
      direction: currentContext.direction ?? undefined,
      movePct: currentContext.movePct,
      tier: currentContext.tier ?? undefined,
      sessionDate: currentContext.sessionDate,
    },
    comparableMovePctTolerance: COMPARABLE_MOVE_PCT_TOLERANCE,
    limit,
  });

  if (COMPARABLE_EXCLUDE_IDENTICAL_ABS_MOVE) {
    comparables = comparables.filter((episode) => episode.similarity.movePctDelta !== 0);
  }

  const mostRecentComparableEpisode = comparables.length === 0
    ? null
    : [...comparables].sort(
      (left, right) => (right.sessionDate ?? "").localeCompare(left.sessionDate ?? ""),
    )[0] ?? null;

  const comparableHistory = {
    comparableEpisodeCount: comparables.length,
    closestComparableEpisodes: comparables,
    mostRecentComparableEpisode,
  };

  const profile = repeatMoverProfileSnapshotFromProfileRow(input.profileRow);
  const observedSymbol = typeof input.profileRow.observed_symbol === "string"
    ? input.profileRow.observed_symbol
    : null;

  return {
    version: REPEAT_MOVER_VERSION,
    securityId: input.securityId,
    currentSymbol: currentContext.observedSymbol ?? observedSymbol,
    currentContext,
    profile,
    comparableHistory,
    evidenceLabels: deriveRepeatMoverEvidenceLabels({ profile, comparableHistory }),
    assembledAt,
  };
}
