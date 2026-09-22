import type { Sql } from "postgres";
import { behaviorProfileFromRow, behaviorProfileToRow } from "@/lib/behavior-profile/behavior-profile-record";
import {
  parseForwardOutcomeSecurityAggregate,
  type ForwardOutcomeSecurityAggregate,
} from "@/lib/behavior-profile/forward-outcome-aggregate-types";
import { HistoricalBridgeClient } from "@/lib/persistence/historical-bridge-client";
import type { SecurityBehaviorProfile } from "@/types/behavior-profile";
import type { SecurityId } from "@/types/security-identity";

export interface BehaviorProfileCandidate {
  securityId: SecurityId;
  maxHistoryDate: string | null;
  maxEpisodeDate: string | null;
  dailyRowCount: number;
  episodeRowCount: number;
  profileComputedAt: string | null;
  profileLatestHistoryDate: string | null;
  profileLatestEpisodeDate: string | null;
  profileVersion: string | null;
  forwardOutcomeD1Count: number;
  forwardOutcomeD5Count: number;
  profileForwardOutcomeD1Count: number | null;
  profileForwardOutcomeD5Count: number | null;
}

export interface ListBehaviorProfileOptions {
  afterSecurityId?: SecurityId | null;
  limit?: number;
  sampleSizeQuality?: SecurityBehaviorProfile["coverage"]["sampleSizeQuality"];
}

export interface BehaviorProfileRepository {
  getSecurityBehaviorProfile(securityId: SecurityId): Promise<SecurityBehaviorProfile | null>;
  upsertSecurityBehaviorProfile(profile: SecurityBehaviorProfile): Promise<void>;
  listSecurityBehaviorProfiles(options?: ListBehaviorProfileOptions): Promise<SecurityBehaviorProfile[]>;
  listRecomputeCandidates(afterSecurityId: SecurityId | null, limit: number): Promise<BehaviorProfileCandidate[]>;
  getForwardOutcomeAggregate(securityId: SecurityId): Promise<ForwardOutcomeSecurityAggregate | null>;
}

const PROFILE_SELECT = `
  security_id, profile_version, observed_symbol, computed_at,
  history_start_date, history_end_date, sessions_observed, episode_count, sample_size_quality,
  notable_count, significant_count, extreme_count,
  positive_episode_count, negative_episode_count, mixed_episode_count,
  positive_episode_pct, negative_episode_pct,
  median_episode_move_pct, average_episode_move_pct,
  max_positive_episode_move_pct, max_negative_episode_move_pct, median_absolute_move_pct,
  median_episode_volume, median_episode_rvol, max_episode_rvol, median_episode_dollar_volume,
  episodes_per_30_sessions, episodes_per_90_sessions, median_days_between_episodes,
  most_recent_episode_date, prior_comparable_episode_count,
  positive_close_upper_quartile_pct, positive_close_near_high_pct, negative_close_near_low_pct,
  continuation_sample_size, next_session_positive_continuation_count,
  next_session_negative_continuation_count, next_session_positive_continuation_rate,
  next_session_negative_continuation_rate,
  latest_source_history_date, latest_episode_date_used,
  source_daily_row_count, source_episode_count,
  episodes_with_d1_outcome, episodes_with_d5_outcome,
  forward_outcome_coverage_pct_d1, forward_outcome_coverage_pct_d5,
  median_d1_return_pct, positive_d1_count, negative_d1_count, zero_d1_count,
  positive_d1_pct, negative_d1_pct,
  median_d5_return_pct, positive_d5_count, negative_d5_count, zero_d5_count,
  positive_d5_pct, negative_d5_pct,
  median_d1_max_gain_pct, median_d1_max_drawdown_pct,
  median_d5_max_gain_pct, median_d5_max_drawdown_pct,
  observed_next_session_sample_size, observed_next_session_positive_pct,
  observed_next_session_negative_pct,
  forward_outcome_d1_count, forward_outcome_d5_count
`;

function mapCandidate(row: Record<string, unknown>): BehaviorProfileCandidate {
  return {
    securityId: String(row.security_id),
    maxHistoryDate: typeof row.max_history_date === "string" ? row.max_history_date.slice(0, 10) : null,
    maxEpisodeDate: typeof row.max_episode_date === "string" ? row.max_episode_date.slice(0, 10) : null,
    dailyRowCount: Number(row.daily_row_count ?? 0),
    episodeRowCount: Number(row.episode_row_count ?? 0),
    profileComputedAt: typeof row.profile_computed_at === "string" ? row.profile_computed_at : null,
    profileLatestHistoryDate: typeof row.profile_latest_history_date === "string"
      ? row.profile_latest_history_date.slice(0, 10)
      : null,
    profileLatestEpisodeDate: typeof row.profile_latest_episode_date === "string"
      ? row.profile_latest_episode_date.slice(0, 10)
      : null,
    profileVersion: typeof row.profile_version === "string" ? row.profile_version : null,
    forwardOutcomeD1Count: Number(row.forward_outcome_d1_count ?? 0),
    forwardOutcomeD5Count: Number(row.forward_outcome_d5_count ?? 0),
    profileForwardOutcomeD1Count: row.profile_forward_outcome_d1_count == null
      ? null
      : Number(row.profile_forward_outcome_d1_count),
    profileForwardOutcomeD5Count: row.profile_forward_outcome_d5_count == null
      ? null
      : Number(row.profile_forward_outcome_d5_count),
  };
}

export class PostgresBehaviorProfileRepository implements BehaviorProfileRepository {
  constructor(private readonly sql: Sql) {}

  async getSecurityBehaviorProfile(securityId: SecurityId): Promise<SecurityBehaviorProfile | null> {
    const rows = await this.sql.unsafe(`
      SELECT ${PROFILE_SELECT}
      FROM public.security_behavior_profiles
      WHERE security_id = $1
      LIMIT 1
    `, [securityId]) as Record<string, unknown>[];
    const row = rows[0];
    return row ? behaviorProfileFromRow(row) : null;
  }

  async upsertSecurityBehaviorProfile(profile: SecurityBehaviorProfile): Promise<void> {
    await this.sql.unsafe(
      "select public.behavior_profile_upsert_v1($1::jsonb)",
      [JSON.stringify(behaviorProfileToRow(profile))],
    );
  }

  async listSecurityBehaviorProfiles(options: ListBehaviorProfileOptions = {}): Promise<SecurityBehaviorProfile[]> {
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
    const quality = options.sampleSizeQuality ?? null;
    const rows = quality
      ? await this.sql.unsafe(`
        SELECT ${PROFILE_SELECT}
        FROM public.security_behavior_profiles
        WHERE sample_size_quality = $1
        ORDER BY security_id
        LIMIT $2
      `, [quality, limit]) as Record<string, unknown>[]
      : await this.sql.unsafe(`
        SELECT ${PROFILE_SELECT}
        FROM public.security_behavior_profiles
        ORDER BY security_id
        LIMIT $1
      `, [limit]) as Record<string, unknown>[];
    return rows.map(behaviorProfileFromRow);
  }

  async listRecomputeCandidates(afterSecurityId: SecurityId | null, limit: number): Promise<BehaviorProfileCandidate[]> {
    const rows = await this.sql.unsafe(`
      SELECT *
      FROM public.behavior_profile_list_candidates_v1($1::uuid, $2::integer)
    `, [afterSecurityId, limit]) as Record<string, unknown>[];
    return rows.map(mapCandidate);
  }

  async getForwardOutcomeAggregate(securityId: SecurityId): Promise<ForwardOutcomeSecurityAggregate | null> {
    const rows = await this.sql.unsafe(
      "select public.forward_outcome_aggregate_for_security_v1($1::uuid) as aggregate",
      [securityId],
    ) as Record<string, unknown>[];
    return parseForwardOutcomeSecurityAggregate(rows[0]?.aggregate);
  }
}

export class BridgeBehaviorProfileRepository implements BehaviorProfileRepository {
  constructor(private readonly bridge: HistoricalBridgeClient) {}

  async getSecurityBehaviorProfile(securityId: SecurityId): Promise<SecurityBehaviorProfile | null> {
    const res = await this.bridge.call("behavior_profile_get", { security_id: securityId });
    return res.row ? behaviorProfileFromRow(res.row as Record<string, unknown>) : null;
  }

  async upsertSecurityBehaviorProfile(profile: SecurityBehaviorProfile): Promise<void> {
    await this.bridge.call("behavior_profile_upsert", { row: behaviorProfileToRow(profile) });
  }

  async listSecurityBehaviorProfiles(options: ListBehaviorProfileOptions = {}): Promise<SecurityBehaviorProfile[]> {
    const rows = await this.bridge.fetchAllRows("behavior_profile_list", {
      sample_size_quality: options.sampleSizeQuality ?? null,
      page_limit: options.limit ?? 100,
    });
    return rows.map(behaviorProfileFromRow);
  }

  async listRecomputeCandidates(afterSecurityId: SecurityId | null, limit: number): Promise<BehaviorProfileCandidate[]> {
    const res = await this.bridge.call("behavior_profile_list_candidates", {
      after_security_id: afterSecurityId,
      page_limit: limit,
    });
    const payload = res.result ?? res.rows;
    const rows = Array.isArray(payload) ? payload as Record<string, unknown>[] : [];
    return rows.map(mapCandidate);
  }

  async getForwardOutcomeAggregate(securityId: SecurityId): Promise<ForwardOutcomeSecurityAggregate | null> {
    const res = await this.bridge.call("forward_outcome_aggregate_for_security", { security_id: securityId });
    return parseForwardOutcomeSecurityAggregate(res.result ?? res);
  }
}

export class MemoryBehaviorProfileRepository implements BehaviorProfileRepository {
  private readonly rows = new Map<string, SecurityBehaviorProfile>();
  readonly candidates: BehaviorProfileCandidate[] = [];

  async getSecurityBehaviorProfile(securityId: SecurityId): Promise<SecurityBehaviorProfile | null> {
    return this.rows.get(securityId) ?? null;
  }

  async upsertSecurityBehaviorProfile(profile: SecurityBehaviorProfile): Promise<void> {
    this.rows.set(profile.securityId, profile);
  }

  async listSecurityBehaviorProfiles(options: ListBehaviorProfileOptions = {}): Promise<SecurityBehaviorProfile[]> {
    let values = [...this.rows.values()].sort((a, b) => a.securityId.localeCompare(b.securityId));
    if (options.sampleSizeQuality) {
      values = values.filter((row) => row.coverage.sampleSizeQuality === options.sampleSizeQuality);
    }
    const limit = options.limit ?? values.length;
    return values.slice(0, limit);
  }

  async listRecomputeCandidates(afterSecurityId: SecurityId | null, limit: number): Promise<BehaviorProfileCandidate[]> {
    const filtered = this.candidates
      .filter((row) => !afterSecurityId || row.securityId > afterSecurityId)
      .sort((a, b) => a.securityId.localeCompare(b.securityId));
    return filtered.slice(0, limit);
  }

  async getForwardOutcomeAggregate(_securityId: SecurityId): Promise<ForwardOutcomeSecurityAggregate | null> {
    return null;
  }
}
