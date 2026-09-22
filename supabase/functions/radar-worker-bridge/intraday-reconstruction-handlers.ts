import type { RadarBridgeAction } from "./actions.ts";
import type { DbClient } from "./handler.ts";

export const INTRADAY_RECONSTRUCTION_APPLY_BATCH_RPC = "intraday_reconstruction_apply_batch_v1";
export const INTRADAY_EPISODE_EVENT_APPLY_BATCH_RPC = "intraday_episode_event_apply_batch_v1";
export const INTRADAY_RECONSTRUCTION_LIST_EPISODES_RPC = "intraday_reconstruction_list_episodes_v1";
export const INTRADAY_RECONSTRUCTION_LIST_BY_EPISODES_RPC = "intraday_reconstruction_list_by_episodes_v1";

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

function readBoolean(value: unknown, defaultValue: boolean): boolean {
  if (typeof value === "boolean") return value;
  return defaultValue;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleIntradayReconstructionAction(
  action: RadarBridgeAction,
  body: Record<string, unknown>,
  _db: DbClient,
  rpc: (name: string, args: Record<string, unknown>) => Promise<Response>,
): Promise<Response | null> {
  switch (action) {
    case "intraday_reconstruction_apply_batch": {
      const rows = readJsonArray(body.rows);
      if (!rows) return jsonResponse({ error: "invalid_body" }, 400);
      return await rpc(INTRADAY_RECONSTRUCTION_APPLY_BATCH_RPC, { p_rows: rows });
    }
    case "intraday_episode_event_apply_batch": {
      const rows = readJsonArray(body.rows);
      if (!rows) return jsonResponse({ error: "invalid_body" }, 400);
      return await rpc(INTRADAY_EPISODE_EVENT_APPLY_BATCH_RPC, { p_rows: rows });
    }
    case "intraday_reconstruction_list_episodes": {
      const limit = body.page_limit === undefined ? 50 : readPositiveInt(body.page_limit);
      if (limit === null || limit > 500) return jsonResponse({ error: "invalid_body" }, 400);
      const afterEpisodeId = body.after_episode_id == null ? null : readUuid(body.after_episode_id);
      if (body.after_episode_id !== undefined && body.after_episode_id !== null && !afterEpisodeId) {
        return jsonResponse({ error: "invalid_body" }, 400);
      }
      return await rpc(INTRADAY_RECONSTRUCTION_LIST_EPISODES_RPC, {
        p_after_episode_id: afterEpisodeId,
        p_limit: limit,
        p_include_reconstructed: readBoolean(body.include_reconstructed, false),
      });
    }
    case "intraday_reconstruction_list_by_episodes": {
      const episodeIds = readUuidArray(body.episode_ids);
      if (!episodeIds || episodeIds.length === 0) return jsonResponse({ error: "invalid_body" }, 400);
      return await rpc(INTRADAY_RECONSTRUCTION_LIST_BY_EPISODES_RPC, {
        p_episode_ids: episodeIds,
      });
    }
    default:
      return null;
  }
}
