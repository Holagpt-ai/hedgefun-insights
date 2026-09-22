/**
 * Historical Behavior Profile V1 — production recompute runner.
 *
 * Server-side only. Uses the tested profile builder and orchestration.
 * Does not change formulas, thresholds, or schema. Never prints credentials.
 *
 * Candidate enumeration and the profile write mirror
 * behavior_profile_list_candidates_v1 / behavior_profile_upsert_v1 exactly;
 * they are issued inline because the authorized server session used here is
 * not the service_role that owns EXECUTE on those SECURITY DEFINER functions.
 */

import postgres from "postgres";
import { behaviorProfileFromRow, behaviorProfileToRow } from "@/lib/behavior-profile/behavior-profile-record";
import type {
  BehaviorProfileCandidate,
  BehaviorProfileRepository,
  ListBehaviorProfileOptions,
} from "@/lib/behavior-profile/behavior-profile-repository";
import { recomputeSecurityBehaviorProfiles } from "@/lib/behavior-profile/recompute-security-behavior-profiles";
import { PostgresSecurityIntelligenceRepository } from "@/lib/security-intelligence/postgres-security-intelligence";
import type { SecurityBehaviorProfile } from "@/types/behavior-profile";
import type { SecurityId } from "@/types/security-identity";

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) throw new Error("SUPABASE_DB_URL missing");

const BATCH_SIZE = Number(process.env.PROFILE_BATCH_SIZE ?? 50);
const MAX_BATCHES = Number(process.env.PROFILE_MAX_BATCHES ?? 10000);

const CANDIDATE_SQL = `
  WITH daily AS (
    SELECT d.security_id, max(d.session_date) AS max_history_date, count(*)::bigint AS daily_row_count
    FROM public.security_daily_history d
    GROUP BY d.security_id
  ),
  episodes AS (
    SELECT e.security_id, max((e.episode_start AT TIME ZONE 'UTC')::date) AS max_episode_date,
           count(*)::bigint AS episode_row_count
    FROM public.market_behavior_episodes e
    GROUP BY e.security_id
  )
  SELECT
    daily.security_id,
    daily.max_history_date::text AS max_history_date,
    episodes.max_episode_date::text AS max_episode_date,
    daily.daily_row_count,
    coalesce(episodes.episode_row_count, 0::bigint) AS episode_row_count,
    profiles.computed_at AS profile_computed_at,
    profiles.latest_source_history_date::text AS profile_latest_history_date,
    profiles.latest_episode_date_used::text AS profile_latest_episode_date,
    profiles.profile_version
  FROM daily
  LEFT JOIN episodes ON episodes.security_id = daily.security_id
  LEFT JOIN public.security_behavior_profiles profiles ON profiles.security_id = daily.security_id
  WHERE $1::uuid IS NULL OR daily.security_id > $1::uuid
  ORDER BY daily.security_id
  LIMIT greatest(1, least(coalesce($2::integer, 50), 500))
`;

const INSERT_SQL = `
  WITH r AS (SELECT $1::jsonb AS p)
  INSERT INTO public.security_behavior_profiles (
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
    source_daily_row_count, source_episode_count, updated_at
  )
  SELECT
    (p->>'security_id')::uuid,
    coalesce(nullif(p->>'profile_version', ''), 'v1'),
    nullif(p->>'observed_symbol', ''),
    (p->>'computed_at')::timestamptz,
    nullif(p->>'history_start_date', '')::date,
    nullif(p->>'history_end_date', '')::date,
    coalesce((p->>'sessions_observed')::integer, 0),
    coalesce((p->>'episode_count')::integer, 0),
    p->>'sample_size_quality',
    coalesce((p->>'notable_count')::integer, 0),
    coalesce((p->>'significant_count')::integer, 0),
    coalesce((p->>'extreme_count')::integer, 0),
    coalesce((p->>'positive_episode_count')::integer, 0),
    coalesce((p->>'negative_episode_count')::integer, 0),
    coalesce((p->>'mixed_episode_count')::integer, 0),
    nullif(p->>'positive_episode_pct', '')::numeric,
    nullif(p->>'negative_episode_pct', '')::numeric,
    nullif(p->>'median_episode_move_pct', '')::numeric,
    nullif(p->>'average_episode_move_pct', '')::numeric,
    nullif(p->>'max_positive_episode_move_pct', '')::numeric,
    nullif(p->>'max_negative_episode_move_pct', '')::numeric,
    nullif(p->>'median_absolute_move_pct', '')::numeric,
    nullif(p->>'median_episode_volume', '')::numeric,
    nullif(p->>'median_episode_rvol', '')::numeric,
    nullif(p->>'max_episode_rvol', '')::numeric,
    nullif(p->>'median_episode_dollar_volume', '')::numeric,
    nullif(p->>'episodes_per_30_sessions', '')::numeric,
    nullif(p->>'episodes_per_90_sessions', '')::numeric,
    nullif(p->>'median_days_between_episodes', '')::numeric,
    nullif(p->>'most_recent_episode_date', '')::date,
    coalesce((p->>'prior_comparable_episode_count')::integer, 0),
    nullif(p->>'positive_close_upper_quartile_pct', '')::numeric,
    nullif(p->>'positive_close_near_high_pct', '')::numeric,
    nullif(p->>'negative_close_near_low_pct', '')::numeric,
    coalesce((p->>'continuation_sample_size')::integer, 0),
    coalesce((p->>'next_session_positive_continuation_count')::integer, 0),
    coalesce((p->>'next_session_negative_continuation_count')::integer, 0),
    nullif(p->>'next_session_positive_continuation_rate', '')::numeric,
    nullif(p->>'next_session_negative_continuation_rate', '')::numeric,
    nullif(p->>'latest_source_history_date', '')::date,
    nullif(p->>'latest_episode_date_used', '')::date,
    coalesce((p->>'source_daily_row_count')::integer, 0),
    coalesce((p->>'source_episode_count')::integer, 0),
    now()
  FROM r
`;

type Sql = ReturnType<typeof postgres>;

class ProductionBehaviorProfileRepository implements BehaviorProfileRepository {
  constructor(private readonly sql: Sql) {}

  async getSecurityBehaviorProfile(securityId: SecurityId): Promise<SecurityBehaviorProfile | null> {
    const rows = await this.sql.unsafe(
      "SELECT * FROM public.security_behavior_profiles WHERE security_id = $1 LIMIT 1",
      [securityId],
    ) as Record<string, unknown>[];
    return rows[0] ? behaviorProfileFromRow(rows[0]) : null;
  }

  async upsertSecurityBehaviorProfile(profile: SecurityBehaviorProfile): Promise<void> {
    await this.sql.unsafe(INSERT_SQL, [JSON.stringify(behaviorProfileToRow(profile))]);
  }

  async listSecurityBehaviorProfiles(options: ListBehaviorProfileOptions = {}): Promise<SecurityBehaviorProfile[]> {
    const rows = await this.sql.unsafe(
      "SELECT * FROM public.security_behavior_profiles ORDER BY security_id LIMIT $1",
      [options.limit ?? 100],
    ) as Record<string, unknown>[];
    return rows.map(behaviorProfileFromRow);
  }

  async listRecomputeCandidates(afterSecurityId: SecurityId | null, limit: number): Promise<BehaviorProfileCandidate[]> {
    const rows = await this.sql.unsafe(CANDIDATE_SQL, [afterSecurityId, limit]) as Record<string, unknown>[];
    return rows.map((row) => ({
      securityId: String(row.security_id),
      maxHistoryDate: typeof row.max_history_date === "string" ? row.max_history_date.slice(0, 10) : null,
      maxEpisodeDate: typeof row.max_episode_date === "string" ? row.max_episode_date.slice(0, 10) : null,
      dailyRowCount: Number(row.daily_row_count ?? 0),
      episodeRowCount: Number(row.episode_row_count ?? 0),
      profileComputedAt: row.profile_computed_at ? new Date(row.profile_computed_at as string).toISOString() : null,
      profileLatestHistoryDate: typeof row.profile_latest_history_date === "string"
        ? row.profile_latest_history_date.slice(0, 10)
        : null,
      profileLatestEpisodeDate: typeof row.profile_latest_episode_date === "string"
        ? row.profile_latest_episode_date.slice(0, 10)
        : null,
      profileVersion: typeof row.profile_version === "string" ? row.profile_version : null,
    }));
  }
}

async function main(): Promise<void> {
  const sql = postgres(dbUrl!, { max: 2, prepare: false, connect_timeout: 15 });
  const profiles = new ProductionBehaviorProfileRepository(sql);
  const intelligence = new PostgresSecurityIntelligenceRepository(sql);
  const source = {
    listDailyHistory: (securityId: SecurityId) => intelligence.listDailyHistory(securityId),
    listEpisodes: (securityId: SecurityId) => intelligence.listEpisodes(securityId),
  };

  const started = Date.now();
  let cursor: SecurityId | null = null;
  let batches = 0;
  let processed = 0;
  let recomputed = 0;
  let skipped = 0;
  let firstBatch: unknown = null;

  try {
    for (; batches < MAX_BATCHES; batches += 1) {
      const result = await recomputeSecurityBehaviorProfiles({
        profiles,
        source,
        afterSecurityId: cursor,
        batchSize: BATCH_SIZE,
      });
      processed += result.processed;
      recomputed += result.recomputed;
      skipped += result.skipped;
      if (firstBatch === null) firstBatch = result;
      console.log(JSON.stringify({ event: "batch", batch: batches + 1, ...result }));
      if (result.done) break;
      cursor = result.nextAfterSecurityId;
      if (!cursor) break;
    }
  } finally {
    const totals = await sql.unsafe(
      "SELECT count(*)::int AS profiles FROM public.security_behavior_profiles",
    ) as Array<{ profiles: number }>;
    console.log(JSON.stringify({
      event: "summary",
      batches: batches + 1,
      processed,
      recomputed,
      skipped,
      firstBatch,
      totalProfiles: totals[0]?.profiles ?? null,
      runtimeSeconds: Math.round((Date.now() - started) / 1000),
    }));
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ event: "fatal", error: String(error instanceof Error ? error.message : error) }));
  process.exit(1);
});
