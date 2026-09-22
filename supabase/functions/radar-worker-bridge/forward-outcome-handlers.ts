import type { RadarBridgeAction } from "./actions.ts";
import type { DbClient } from "./handler.ts";
import {
  HISTORICAL_PAGE_MAX,
  type HistoricalSelectQuery,
} from "./historical-handlers.ts";

export const FORWARD_OUTCOME_TABLE = "forward_outcomes";
export const FORWARD_OUTCOME_APPLY_BATCH_RPC = "forward_outcome_apply_batch_v1";
export const FORWARD_OUTCOME_LIST_BY_EPISODES_RPC = "forward_outcome_list_by_episodes_v1";
export const FORWARD_OUTCOME_AGGREGATE_RPC = "forward_outcome_aggregate_for_security_v1";
export const FORWARD_OUTCOME_LIST_CANDIDATES_RPC = "forward_outcome_list_candidates_v1";

export const FORWARD_OUTCOME_SELECT = `
  episode_id, security_id, horizon,
  reference_timestamp, reference_price, outcome_price,
  return_pct, max_gain_pct, max_drawdown_pct,
  high_price, low_price, data_available,
  availability_state, episode_session_date, horizon_session_date,
  open_to_close_return_pct, gap_pct, session_volume, horizon_session_move_pct, rvol, close_position,
  closed_above_episode_close, closed_below_episode_close,
  exceeded_episode_high, broke_episode_low,
  source, source_as_of, fetched_at, computed_at,
  quality, freshness, provenance
`.replace(/\s+/g, " ").trim();

function readUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function readUuidArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const item of value) {
    const id = readUuid(item);
    if (!id) return null;
    out.push(id);
  }
  return out;
}

function readJsonArray(value: unknown): unknown[] | null {
  if (!Array.isArray(value)) return null;
  return value;
}

function readNonNegInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return null;
  return value;
}

function readPositiveInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) return null;
  return value;
}

function readPage(body: Record<string, unknown>): { offset: number; limit: number } | null {
  const offset = body.page_offset === undefined ? 0 : readNonNegInt(body.page_offset);
  const limit = body.page_limit === undefined ? HISTORICAL_PAGE_MAX : readPositiveInt(body.page_limit);
  if (offset === null || limit === null || limit > HISTORICAL_PAGE_MAX) return null;
  return { offset, limit };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleForwardOutcomeAction(
  action: RadarBridgeAction,
  body: Record<string, unknown>,
  db: DbClient,
  rpc: (name: string, args: Record<string, unknown>) => Promise<Response>,
): Promise<Response | null> {
  switch (action) {
    case "forward_outcome_apply_batch": {
      const rows = readJsonArray(body.rows ?? body.p_rows);
      if (!rows || rows.length === 0 || rows.length > HISTORICAL_PAGE_MAX) {
        return jsonResponse({ error: "invalid_body" }, 400);
      }
      return await rpc(FORWARD_OUTCOME_APPLY_BATCH_RPC, { p_rows: rows });
    }
    case "forward_outcome_list_for_security": {
      const securityId = readUuid(body.security_id);
      const page = readPage(body);
      if (!securityId || !page) return jsonResponse({ error: "invalid_body" }, 400);
      const result = await (db.from(FORWARD_OUTCOME_TABLE).select(FORWARD_OUTCOME_SELECT) as unknown as HistoricalSelectQuery)
        .eq("security_id", securityId)
        .order("episode_id", { ascending: true })
        .range(page.offset, page.offset + page.limit - 1);
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
    case "forward_outcome_list_by_episodes": {
      const episodeIds = readUuidArray(body.episode_ids ?? body.p_episode_ids);
      if (!episodeIds || episodeIds.length === 0 || episodeIds.length > HISTORICAL_PAGE_MAX) {
        return jsonResponse({ error: "invalid_body" }, 400);
      }
      return await rpc(FORWARD_OUTCOME_LIST_BY_EPISODES_RPC, { p_episode_ids: episodeIds });
    }
    case "forward_outcome_aggregate_for_security": {
      const securityId = readUuid(body.security_id ?? body.p_security_id);
      if (!securityId) return jsonResponse({ error: "invalid_body" }, 400);
      return await rpc(FORWARD_OUTCOME_AGGREGATE_RPC, { p_security_id: securityId });
    }
    case "forward_outcome_list_candidates": {
      const after = body.after_security_id === undefined || body.after_security_id === null
        ? null
        : readUuid(body.after_security_id);
      if (body.after_security_id != null && !after) return jsonResponse({ error: "invalid_body" }, 400);
      const limit = typeof body.limit === "number" && Number.isInteger(body.limit) ? body.limit : 50;
      return await rpc(FORWARD_OUTCOME_LIST_CANDIDATES_RPC, {
        p_after_security_id: after,
        p_limit: limit,
      });
    }
    default:
      return null;
  }
}
