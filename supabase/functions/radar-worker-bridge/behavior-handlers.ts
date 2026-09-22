// Behavior Profile V1 bridge actions — fixed table/RPC only.

import type { RadarBridgeAction } from "./actions.ts";
import type { DbClient } from "./handler.ts";
import {
  HISTORICAL_PAGE_MAX,
  type HistoricalSelectQuery,
} from "./historical-handlers.ts";

export const BEHAVIOR_PROFILE_TABLE = "security_behavior_profiles";
export const BEHAVIOR_PROFILE_UPSERT_RPC = "behavior_profile_upsert_v1";
export const BEHAVIOR_PROFILE_LIST_CANDIDATES_RPC = "behavior_profile_list_candidates_v1";

export const BEHAVIOR_PROFILE_SELECT = `
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
  source_daily_row_count, source_episode_count
`.replace(/\s+/g, " ").trim();

function readNonNegInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return null;
  return value;
}

function readPositiveInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) return null;
  return value;
}

function readUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function readPage(body: Record<string, unknown>): { offset: number; limit: number } | null {
  const offset = body.page_offset === undefined ? 0 : readNonNegInt(body.page_offset);
  const limit = readPositiveInt(body.page_limit);
  if (offset === null || limit === null || limit > HISTORICAL_PAGE_MAX) return null;
  return { offset, limit };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function profileDb(db: DbClient): DbClient {
  return db;
}

async function selectPage(
  db: DbClient,
  page: { offset: number; limit: number },
  apply?: (q: HistoricalSelectQuery) => HistoricalSelectQuery,
): Promise<Response> {
  let query = profileDb(db).from(BEHAVIOR_PROFILE_TABLE).select(BEHAVIOR_PROFILE_SELECT) as unknown as HistoricalSelectQuery;
  if (apply) query = apply(query);
  else query = query.order("security_id", { ascending: true }) as HistoricalSelectQuery;
  const result = await query.range(page.offset, page.offset + page.limit - 1);
  if (result.error) return jsonResponse({ ok: false, error: "persist_failed" }, 502);
  const rows = result.data ?? [];
  return jsonResponse({
    ok: true,
    rows,
    page_offset: page.offset,
    page_limit: page.limit,
    has_more: rows.length === page.limit,
  });
}

function readProfileRow(body: Record<string, unknown>): Record<string, unknown> | null {
  const row = body.row;
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const securityId = readUuid((row as Record<string, unknown>).security_id);
  const computedAt = (row as Record<string, unknown>).computed_at;
  const sampleQuality = (row as Record<string, unknown>).sample_size_quality;
  if (!securityId || typeof computedAt !== "string" || typeof sampleQuality !== "string") return null;
  return row as Record<string, unknown>;
}

export async function handleBehaviorProfileAction(
  action: RadarBridgeAction,
  body: Record<string, unknown>,
  db: DbClient,
  rpc: (name: string, args: Record<string, unknown>) => Promise<Response>,
): Promise<Response | null> {
  switch (action) {
    case "behavior_profile_get": {
      const securityId = readUuid(body.security_id);
      if (!securityId) return jsonResponse({ error: "invalid_body" }, 400);
      const result = await (profileDb(db).from(BEHAVIOR_PROFILE_TABLE)
        .select(BEHAVIOR_PROFILE_SELECT) as unknown as HistoricalSelectQuery)
        .eq("security_id", securityId)
        .maybeSingle();
      if (result.error) return jsonResponse({ ok: false, error: "persist_failed" }, 502);
      return jsonResponse({ ok: true, row: result.data });
    }
    case "behavior_profile_upsert": {
      const row = readProfileRow(body);
      if (!row) return jsonResponse({ error: "invalid_body" }, 400);
      return await rpc(BEHAVIOR_PROFILE_UPSERT_RPC, { p_row: row });
    }
    case "behavior_profile_list": {
      const page = readPage(body);
      if (!page) return jsonResponse({ error: "invalid_body" }, 400);
      const quality = typeof body.sample_size_quality === "string" ? body.sample_size_quality.trim() : null;
      return await selectPage(db, page, quality
        ? (q) => q.eq("sample_size_quality", quality)
        : undefined);
    }
    case "behavior_profile_list_candidates": {
      const limit = readPositiveInt(body.page_limit) ?? readPositiveInt(body.limit);
      if (!limit || limit > HISTORICAL_PAGE_MAX) return jsonResponse({ error: "invalid_body" }, 400);
      const afterSecurityId = body.after_security_id == null ? null : readUuid(body.after_security_id);
      if (body.after_security_id != null && !afterSecurityId) {
        return jsonResponse({ error: "invalid_body" }, 400);
      }
      return await rpc(BEHAVIOR_PROFILE_LIST_CANDIDATES_RPC, {
        p_after_security_id: afterSecurityId,
        p_limit: limit,
      });
    }
    default:
      return null;
  }
}
