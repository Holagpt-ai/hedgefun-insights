import type { RadarBridgeAction } from "./actions.ts";
import type { DbClient } from "./handler.ts";
import {
  HISTORICAL_PAGE_MAX,
  type HistoricalSelectQuery,
} from "./historical-handlers.ts";

export const CATALYST_EVENTS_TABLE = "catalyst_events";
export const CATALYST_EVENTS_SELECT =
  "dedupe_key, symbol, event_type, event_date, event_time, title, description, source_name, source_url, provider, provider_article_id, published_at, facts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HistoricalDb = any;

function historicalDb(db: DbClient): HistoricalDb {
  return db as HistoricalDb;
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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

export const CORPORATE_EVENT_APPLY_BATCH_RPC = "corporate_event_apply_batch_v1";
export const EVENT_REACTION_LINK_APPLY_BATCH_RPC = "event_reaction_link_apply_batch_v1";
export const CORPORATE_EVENT_LIST_FOR_SECURITY_RPC = "corporate_event_list_for_security_v1";
export const EVENT_REACTION_LINK_LIST_FOR_EPISODES_RPC = "event_reaction_link_list_for_episodes_v1";

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

function readPositiveInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) return null;
  return value;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function selectCatalystPage(
  db: DbClient,
  page: { offset: number; limit: number },
): Promise<Response> {
  const result = await (historicalDb(db).from(CATALYST_EVENTS_TABLE).select(CATALYST_EVENTS_SELECT)
    .order("dedupe_key", { ascending: true }) as HistoricalSelectQuery)
    .range(page.offset, page.offset + page.limit - 1);
  if (result.error) {
    return jsonResponse({ ok: false, error: "persist_failed" }, 502);
  }
  return jsonResponse({ ok: true, result: result.data ?? [] });
}

export async function handleCorporateEventAction(
  action: RadarBridgeAction,
  body: Record<string, unknown>,
  db: DbClient,
  rpc: (name: string, args: Record<string, unknown>) => Promise<Response>,
): Promise<Response | null> {
  switch (action) {
    case "catalyst_event_list": {
      const page = readPage(body);
      if (!page) return jsonResponse({ error: "invalid_body" }, 400);
      return await selectCatalystPage(db, page);
    }
    case "corporate_event_apply_batch": {
      const rows = readJsonArray(body.rows);
      if (!rows) return jsonResponse({ error: "invalid_body" }, 400);
      return await rpc(CORPORATE_EVENT_APPLY_BATCH_RPC, { p_rows: rows });
    }
    case "event_reaction_link_apply_batch": {
      const rows = readJsonArray(body.rows);
      if (!rows) return jsonResponse({ error: "invalid_body" }, 400);
      return await rpc(EVENT_REACTION_LINK_APPLY_BATCH_RPC, { p_rows: rows });
    }
    case "corporate_event_list_for_security": {
      const securityId = readUuid(body.security_id);
      if (!securityId) return jsonResponse({ error: "invalid_body" }, 400);
      const limit = body.limit === undefined ? HISTORICAL_PAGE_MAX : readPositiveInt(body.limit);
      if (limit === null || limit > 2000) return jsonResponse({ error: "invalid_body" }, 400);
      const afterEventAt = typeof body.after_event_at === "string" ? body.after_event_at : null;
      return await rpc(CORPORATE_EVENT_LIST_FOR_SECURITY_RPC, {
        p_security_id: securityId,
        p_after_event_at: afterEventAt,
        p_limit: limit,
      });
    }
    case "event_reaction_link_list_for_episodes": {
      const episodeIds = readUuidArray(body.episode_ids);
      if (!episodeIds || episodeIds.length === 0) return jsonResponse({ error: "invalid_body" }, 400);
      return await rpc(EVENT_REACTION_LINK_LIST_FOR_EPISODES_RPC, {
        p_episode_ids: episodeIds,
      });
    }
    default:
      return null;
  }
}
