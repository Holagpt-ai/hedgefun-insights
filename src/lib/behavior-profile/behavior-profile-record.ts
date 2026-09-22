import type { BehaviorProfileSampleQuality, BehaviorProfileVersion } from "@/config/behavior-profile.config";
import { emptyBehaviorProfileForwardOutcomes } from "@/lib/behavior-profile/merge-forward-outcome-aggregates";
import type { SecurityBehaviorProfile } from "@/types/behavior-profile";

function num(value: number | null | undefined): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return String(value);
}

function int(value: number): string {
  return String(Math.trunc(value));
}

export function behaviorProfileToRow(profile: SecurityBehaviorProfile): Record<string, string> {
  const fo = profile.forwardOutcomes;
  return {
    security_id: profile.securityId,
    profile_version: profile.version,
    observed_symbol: profile.observedSymbol ?? "",
    computed_at: profile.computedAt,
    history_start_date: profile.coverage.historyStartDate ?? "",
    history_end_date: profile.coverage.historyEndDate ?? "",
    sessions_observed: int(profile.coverage.sessionsObserved),
    episode_count: int(profile.coverage.episodeCount),
    sample_size_quality: profile.coverage.sampleSizeQuality,
    notable_count: int(profile.episodeDistribution.notableCount),
    significant_count: int(profile.episodeDistribution.significantCount),
    extreme_count: int(profile.episodeDistribution.extremeCount),
    positive_episode_count: int(profile.episodeDistribution.positiveEpisodeCount),
    negative_episode_count: int(profile.episodeDistribution.negativeEpisodeCount),
    mixed_episode_count: int(profile.episodeDistribution.mixedEpisodeCount),
    positive_episode_pct: num(profile.episodeDistribution.positiveEpisodePct),
    negative_episode_pct: num(profile.episodeDistribution.negativeEpisodePct),
    median_episode_move_pct: num(profile.moveBehavior.medianEpisodeMovePct),
    average_episode_move_pct: num(profile.moveBehavior.averageEpisodeMovePct),
    max_positive_episode_move_pct: num(profile.moveBehavior.maxPositiveEpisodeMovePct),
    max_negative_episode_move_pct: num(profile.moveBehavior.maxNegativeEpisodeMovePct),
    median_absolute_move_pct: num(profile.moveBehavior.medianAbsoluteMovePct),
    median_episode_volume: num(profile.volumeBehavior.medianEpisodeVolume),
    median_episode_rvol: num(profile.volumeBehavior.medianEpisodeRvol),
    max_episode_rvol: num(profile.volumeBehavior.maxEpisodeRvol),
    median_episode_dollar_volume: num(profile.volumeBehavior.medianEpisodeDollarVolume),
    episodes_per_30_sessions: num(profile.recurrence.episodesPer30Sessions),
    episodes_per_90_sessions: num(profile.recurrence.episodesPer90Sessions),
    median_days_between_episodes: num(profile.recurrence.medianDaysBetweenEpisodes),
    most_recent_episode_date: profile.recurrence.mostRecentEpisodeDate ?? "",
    prior_comparable_episode_count: int(profile.recurrence.priorComparableEpisodeCount),
    positive_close_upper_quartile_pct: num(profile.closeBehavior.positiveEpisodesClosingUpperQuartilePct),
    positive_close_near_high_pct: num(profile.closeBehavior.positiveEpisodesClosingNearHighPct),
    negative_close_near_low_pct: num(profile.closeBehavior.negativeEpisodesClosingNearLowPct),
    continuation_sample_size: int(profile.continuation.continuationSampleSize),
    next_session_positive_continuation_count: int(profile.continuation.nextSessionPositiveContinuationCount),
    next_session_negative_continuation_count: int(profile.continuation.nextSessionNegativeContinuationCount),
    next_session_positive_continuation_rate: num(profile.continuation.nextSessionPositiveContinuationRate),
    next_session_negative_continuation_rate: num(profile.continuation.nextSessionNegativeContinuationRate),
    latest_source_history_date: profile.freshness.latestSourceHistoryDate ?? "",
    latest_episode_date_used: profile.freshness.latestEpisodeDateUsed ?? "",
    source_daily_row_count: int(profile.freshness.sourceDailyRowCount),
    source_episode_count: int(profile.freshness.sourceEpisodeCount),
    episodes_with_d1_outcome: int(fo.episodesWithD1Outcome),
    episodes_with_d5_outcome: int(fo.episodesWithD5Outcome),
    forward_outcome_coverage_pct_d1: num(fo.forwardOutcomeCoveragePctD1),
    forward_outcome_coverage_pct_d5: num(fo.forwardOutcomeCoveragePctD5),
    median_d1_return_pct: num(fo.medianD1ReturnPct),
    positive_d1_count: int(fo.positiveD1Count),
    negative_d1_count: int(fo.negativeD1Count),
    zero_d1_count: int(fo.zeroD1Count),
    positive_d1_pct: num(fo.positiveD1Pct),
    negative_d1_pct: num(fo.negativeD1Pct),
    median_d5_return_pct: num(fo.medianD5ReturnPct),
    positive_d5_count: int(fo.positiveD5Count),
    negative_d5_count: int(fo.negativeD5Count),
    zero_d5_count: int(fo.zeroD5Count),
    positive_d5_pct: num(fo.positiveD5Pct),
    negative_d5_pct: num(fo.negativeD5Pct),
    median_d1_max_gain_pct: num(fo.medianD1MaxGainPct),
    median_d1_max_drawdown_pct: num(fo.medianD1MaxDrawdownPct),
    median_d5_max_gain_pct: num(fo.medianD5MaxGainPct),
    median_d5_max_drawdown_pct: num(fo.medianD5MaxDrawdownPct),
    observed_next_session_sample_size: int(fo.observedNextSessionSampleSize),
    observed_next_session_positive_pct: num(fo.observedNextSessionPositivePct),
    observed_next_session_negative_pct: num(fo.observedNextSessionNegativePct),
    forward_outcome_d1_count: int(profile.freshness.forwardOutcomeD1Count),
    forward_outcome_d5_count: int(profile.freshness.forwardOutcomeD5Count),
  };
}

function readNum(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readInt(value: unknown, fallback = 0): number {
  const parsed = readNum(value);
  return parsed === null ? fallback : Math.trunc(parsed);
}

function readDate(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  return value.slice(0, 10);
}

function readQuality(value: unknown): BehaviorProfileSampleQuality {
  const raw = typeof value === "string" ? value : "";
  if (raw === "LIMITED" || raw === "ADEQUATE" || raw === "ROBUST" || raw === "INSUFFICIENT") return raw;
  return "INSUFFICIENT";
}

function readVersion(value: unknown): BehaviorProfileVersion {
  return value === "v2" ? "v2" : "v1";
}

function readForwardOutcomes(row: Record<string, unknown>) {
  const hasV2 = row.episodes_with_d1_outcome !== undefined && row.episodes_with_d1_outcome !== null;
  if (!hasV2) return emptyBehaviorProfileForwardOutcomes();
  return {
    episodesWithD1Outcome: readInt(row.episodes_with_d1_outcome),
    episodesWithD5Outcome: readInt(row.episodes_with_d5_outcome),
    forwardOutcomeCoveragePctD1: readNum(row.forward_outcome_coverage_pct_d1),
    forwardOutcomeCoveragePctD5: readNum(row.forward_outcome_coverage_pct_d5),
    medianD1ReturnPct: readNum(row.median_d1_return_pct),
    positiveD1Count: readInt(row.positive_d1_count),
    negativeD1Count: readInt(row.negative_d1_count),
    zeroD1Count: readInt(row.zero_d1_count),
    positiveD1Pct: readNum(row.positive_d1_pct),
    negativeD1Pct: readNum(row.negative_d1_pct),
    medianD5ReturnPct: readNum(row.median_d5_return_pct),
    positiveD5Count: readInt(row.positive_d5_count),
    negativeD5Count: readInt(row.negative_d5_count),
    zeroD5Count: readInt(row.zero_d5_count),
    positiveD5Pct: readNum(row.positive_d5_pct),
    negativeD5Pct: readNum(row.negative_d5_pct),
    medianD1MaxGainPct: readNum(row.median_d1_max_gain_pct),
    medianD1MaxDrawdownPct: readNum(row.median_d1_max_drawdown_pct),
    medianD5MaxGainPct: readNum(row.median_d5_max_gain_pct),
    medianD5MaxDrawdownPct: readNum(row.median_d5_max_drawdown_pct),
    observedNextSessionSampleSize: readInt(row.observed_next_session_sample_size),
    observedNextSessionPositivePct: readNum(row.observed_next_session_positive_pct),
    observedNextSessionNegativePct: readNum(row.observed_next_session_negative_pct),
  };
}

export function behaviorProfileFromRow(row: Record<string, unknown>): SecurityBehaviorProfile {
  const forwardOutcomes = readForwardOutcomes(row);
  return {
    version: readVersion(row.profile_version),
    securityId: String(row.security_id),
    observedSymbol: typeof row.observed_symbol === "string" && row.observed_symbol.length > 0
      ? row.observed_symbol
      : null,
    computedAt: typeof row.computed_at === "string" ? row.computed_at : new Date(0).toISOString(),
    coverage: {
      historyStartDate: readDate(row.history_start_date),
      historyEndDate: readDate(row.history_end_date),
      sessionsObserved: readInt(row.sessions_observed),
      episodeCount: readInt(row.episode_count),
      sampleSizeQuality: readQuality(row.sample_size_quality),
    },
    episodeDistribution: {
      notableCount: readInt(row.notable_count),
      significantCount: readInt(row.significant_count),
      extremeCount: readInt(row.extreme_count),
      positiveEpisodeCount: readInt(row.positive_episode_count),
      negativeEpisodeCount: readInt(row.negative_episode_count),
      mixedEpisodeCount: readInt(row.mixed_episode_count),
      positiveEpisodePct: readNum(row.positive_episode_pct),
      negativeEpisodePct: readNum(row.negative_episode_pct),
    },
    moveBehavior: {
      medianEpisodeMovePct: readNum(row.median_episode_move_pct),
      averageEpisodeMovePct: readNum(row.average_episode_move_pct),
      maxPositiveEpisodeMovePct: readNum(row.max_positive_episode_move_pct),
      maxNegativeEpisodeMovePct: readNum(row.max_negative_episode_move_pct),
      medianAbsoluteMovePct: readNum(row.median_absolute_move_pct),
    },
    volumeBehavior: {
      medianEpisodeVolume: readNum(row.median_episode_volume),
      medianEpisodeRvol: readNum(row.median_episode_rvol),
      maxEpisodeRvol: readNum(row.max_episode_rvol),
      medianEpisodeDollarVolume: readNum(row.median_episode_dollar_volume),
    },
    recurrence: {
      episodesPer30Sessions: readNum(row.episodes_per_30_sessions),
      episodesPer90Sessions: readNum(row.episodes_per_90_sessions),
      medianDaysBetweenEpisodes: readNum(row.median_days_between_episodes),
      mostRecentEpisodeDate: readDate(row.most_recent_episode_date),
      priorComparableEpisodeCount: readInt(row.prior_comparable_episode_count),
    },
    closeBehavior: {
      positiveEpisodesClosingUpperQuartilePct: readNum(row.positive_close_upper_quartile_pct),
      positiveEpisodesClosingNearHighPct: readNum(row.positive_close_near_high_pct),
      negativeEpisodesClosingNearLowPct: readNum(row.negative_close_near_low_pct),
    },
    continuation: {
      nextSessionPositiveContinuationCount: readInt(row.next_session_positive_continuation_count),
      nextSessionNegativeContinuationCount: readInt(row.next_session_negative_continuation_count),
      continuationSampleSize: readInt(row.continuation_sample_size),
      nextSessionPositiveContinuationRate: readNum(row.next_session_positive_continuation_rate),
      nextSessionNegativeContinuationRate: readNum(row.next_session_negative_continuation_rate),
    },
    forwardOutcomes,
    freshness: {
      latestSourceHistoryDate: readDate(row.latest_source_history_date),
      latestEpisodeDateUsed: readDate(row.latest_episode_date_used),
      sourceDailyRowCount: readInt(row.source_daily_row_count),
      sourceEpisodeCount: readInt(row.source_episode_count),
      forwardOutcomeD1Count: readInt(row.forward_outcome_d1_count ?? row.episodes_with_d1_outcome),
      forwardOutcomeD5Count: readInt(row.forward_outcome_d5_count ?? row.episodes_with_d5_outcome),
    },
  };
}
