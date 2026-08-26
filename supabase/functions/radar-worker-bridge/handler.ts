// Narrow Radar V2.2 worker bridge. Each action maps to one hardcoded RPC or table.
// Does not accept RPC/table names from the caller. Never logs secrets.

import { RADAR_V22_LEASE_KEY } from "../_shared/radar-v22/types.ts";
import {
  authorizeRadarWorker,
  type EnvReader,
} from "./auth.ts";
import { isRadarBridgeAction, type RadarBridgeAction } from "./actions.ts";

export const ACQUIRE_LEASE_RPC = "try_acquire_radar_v22_lease_v1";
export const HEARTBEAT_LEASE_RPC = "heartbeat_radar_v22_lease_v1";
export const RELEASE_LEASE_RPC = "release_radar_v22_lease_v1";
export const REPLACE_RADAR_RPC = "replace_radar_v22_generation_v1";
export const SET_RADAR_STATUS_RPC = "set_radar_v22_feed_status_v1";
export const REPLACE_52W_RPC = "replace_screener_52w_baseline_generation_v1";
export const CALENDAR_TABLE = "market_session_calendar";
export const BASELINE_STATE_TABLE = "screener_52w_baseline_state";

const CALENDAR_SELECT =
  "session_date,market_status,regular_open_et,regular_close_et,after_hours_end_et,holiday_name";
const BASELINE_STATE_SELECT =
  "current_generation_id,status,period_start,period_end,symbol_count,provider_as_of";

const JSON_HEADERS = { "Content-Type": "application/json" };

export type DbSelectResult = {
  data: Array<Record<string, unknown>> | null;
  error: { message: string } | null;
};

export type DbQuery = {
  eq: (col: string, value: string) => DbQuery;
  limit: (n: number) => DbQuery;
  then: (
    onfulfilled?: ((value: DbSelectResult) => unknown) | null,
    onrejected?: ((reason: unknown) => unknown) | null,
  ) => Promise<unknown>;
};

export type DbClient = {
  from: (table: string) => { select: (cols: string) => DbQuery };
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export type BridgeDeps = {
  env: EnvReader;
  createClient: (url: string, key: string) => DbClient;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readHolderId(body: Record<string, unknown>): string | null {
  const raw = body.holder_id;
  if (typeof raw !== "string") return null;
  const holderId = raw.trim();
  if (!holderId || holderId.length > 200) return null;
  return holderId;
}

function readTtlMs(body: Record<string, unknown>): number | null {
  const raw = body.ttl_ms;
  if (typeof raw !== "number" || !Number.isInteger(raw)) return null;
  if (raw < 1 || raw > 600_000) return null;
  return raw;
}

async function rpcResult(
  db: DbClient,
  name: string,
  args: Record<string, unknown>,
): Promise<Response> {
  const result = await db.rpc(name, args);
  if (result.error) return json({ ok: false, error: "persist_failed" }, 502);
  return json({ ok: true, result: result.data });
}

async function handleAction(
  action: RadarBridgeAction,
  body: Record<string, unknown>,
  db: DbClient,
): Promise<Response> {
  switch (action) {
    case "acquire_lease": {
      const holderId = readHolderId(body);
      const ttlMs = readTtlMs(body);
      if (holderId === null || ttlMs === null) {
        return json({ error: "invalid_body" }, 400);
      }
      return await rpcResult(db, ACQUIRE_LEASE_RPC, {
        p_lease_key: RADAR_V22_LEASE_KEY,
        p_holder_id: holderId,
        p_ttl_ms: ttlMs,
      });
    }
    case "heartbeat_lease": {
      const holderId = readHolderId(body);
      const ttlMs = readTtlMs(body);
      if (holderId === null || ttlMs === null) {
        return json({ error: "invalid_body" }, 400);
      }
      return await rpcResult(db, HEARTBEAT_LEASE_RPC, {
        p_lease_key: RADAR_V22_LEASE_KEY,
        p_holder_id: holderId,
        p_ttl_ms: ttlMs,
      });
    }
    case "release_lease": {
      const holderId = readHolderId(body);
      if (holderId === null) return json({ error: "invalid_body" }, 400);
      const result = await db.rpc(RELEASE_LEASE_RPC, {
        p_lease_key: RADAR_V22_LEASE_KEY,
        p_holder_id: holderId,
      });
      if (result.error) return json({ ok: false, error: "persist_failed" }, 502);
      return json({ ok: true });
    }
    case "get_calendar": {
      const result = await db.from(CALENDAR_TABLE).select(CALENDAR_SELECT) as DbSelectResult;
      if (result.error) return json({ ok: false, error: "persist_failed" }, 502);
      return json({ ok: true, rows: result.data ?? [] });
    }
    case "publish_generation": {
      if (typeof body.p_generation_id !== "string") {
        return json({ error: "invalid_body" }, 400);
      }
      return await rpcResult(db, REPLACE_RADAR_RPC, {
        p_generation_id: body.p_generation_id,
        p_rows: body.p_rows,
        p_archive: body.p_archive,
        p_session_date: body.p_session_date,
        p_synced_at: body.p_synced_at,
        p_status: body.p_status,
        p_last_provider_event_at: body.p_last_provider_event_at ?? null,
      });
    }
    case "set_feed_status": {
      if (typeof body.p_status !== "string" || typeof body.p_synced_at !== "string") {
        return json({ error: "invalid_body" }, 400);
      }
      return await rpcResult(db, SET_RADAR_STATUS_RPC, {
        p_status: body.p_status,
        p_last_provider_event_at: body.p_last_provider_event_at ?? null,
        p_synced_at: body.p_synced_at,
      });
    }
    case "replace_52w_baseline": {
      if (typeof body.p_generation_id !== "string") {
        return json({ error: "invalid_body" }, 400);
      }
      return await rpcResult(db, REPLACE_52W_RPC, {
        p_generation_id: body.p_generation_id,
        p_rows: body.p_rows,
        p_period_start: body.p_period_start,
        p_period_end: body.p_period_end,
        p_provider_as_of: body.p_provider_as_of,
        p_status: body.p_status,
      });
    }
    case "get_52w_state": {
      const result = await db
        .from(BASELINE_STATE_TABLE)
        .select(BASELINE_STATE_SELECT)
        .eq("state_key", "current")
        .limit(1) as DbSelectResult;
      if (result.error) return json({ ok: false, error: "persist_failed" }, 502);
      const rows = result.data ?? [];
      return json({ ok: true, state: rows[0] ?? null });
    }
  }
}

export async function handleRadarWorkerBridge(
  req: Request,
  deps: BridgeDeps,
): Promise<Response> {
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const auth = await authorizeRadarWorker(
    req.headers.get("Authorization"),
    deps.env,
  );
  if (!auth.ok) {
    return json({ error: auth.error }, auth.status);
  }

  const supabaseUrl = deps.env("SUPABASE_URL") ?? "";
  const serviceKey = deps.env("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    console.error("[radar-worker-bridge] server_misconfigured");
    return json({ error: "internal_error" }, 500);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_body" }, 400);
  }
  if (!isRecord(body) || !isRadarBridgeAction(body.action)) {
    return json({ error: "unknown_action" }, 400);
  }

  const db = deps.createClient(supabaseUrl, serviceKey);
  try {
    return await handleAction(body.action, body, db);
  } catch {
    console.error("[radar-worker-bridge] internal_error");
    return json({ error: "internal_error" }, 500);
  }
}
