// Narrow Radar V2.2 worker bridge. Each action maps to one hardcoded RPC or table.
// Does not accept RPC/table names from the caller. Never logs secrets.

import { RADAR_V22_LEASE_KEY } from "../_shared/radar-v22/types.ts";
import { parseValidatedBaselineExclusions } from "../_shared/screeners/baseline-exclusion-publish.ts";
import {
  authorizeRadarWorker,
  type EnvReader,
} from "./auth.ts";
import { isRadarBridgeAction, type RadarBridgeAction } from "./actions.ts";
import { handleBehaviorProfileAction } from "./behavior-handlers.ts";
import { handleHistoricalAction } from "./historical-handlers.ts";

export const ACQUIRE_LEASE_RPC = "try_acquire_radar_v22_lease_v1";
export const HEARTBEAT_LEASE_RPC = "heartbeat_radar_v22_lease_v1";
export const RELEASE_LEASE_RPC = "release_radar_v22_lease_v1";
export const REPLACE_RADAR_RPC = "replace_radar_v22_generation_v1";
export const REPLACE_RADAR_V2_RPC = "replace_radar_v22_candidates_v1";
export const SET_RADAR_STATUS_RPC = "set_radar_v22_feed_status_v1";
export const REPLACE_52W_RPC = "replace_screener_52w_baseline_generation_v1";
export const REPLACE_52W_WITH_EXCLUSIONS_RPC =
  "replace_screener_52w_baseline_generation_with_exclusions_v1";
export const START_52W_PUBLISH_RPC = "start_screener_52w_baseline_publish_v1";
export const APPEND_52W_ROWS_RPC = "append_screener_52w_baseline_rows_v1";
export const APPEND_52W_EXCLUSIONS_RPC =
  "append_screener_52w_baseline_exclusions_v1";
export const APPEND_DAILY_VOLUME_RPC =
  "append_screener_daily_volume_history_v1";
export const FINALIZE_52W_PUBLISH_RPC =
  "finalize_screener_52w_baseline_publish_v1";
export const CALENDAR_TABLE = "market_session_calendar";
export const BASELINE_STATE_TABLE = "screener_52w_baseline_state";

const CALENDAR_SELECT =
  "session_date,market_status,regular_open_et,regular_close_et,after_hours_end_et,holiday_name";
const BASELINE_STATE_SELECT =
  "current_generation_id,status,period_start,period_end,symbol_count,provider_as_of,policy_min_sessions,policy_excluded_count";
const BASELINE_STATE_SELECT_PRE_MIGRATION =
  "current_generation_id,status,period_start,period_end,symbol_count,provider_as_of";

const JSON_HEADERS = { "Content-Type": "application/json" };

type BridgeLogFields = Record<string, string | number | boolean | null>;

function bridgeLog(msg: string, fields: BridgeLogFields): void {
  console.log(JSON.stringify({ msg, ...fields }));
}

function readRequestId(body: Record<string, unknown>): string {
  const raw = body.request_id;
  if (typeof raw === "string") {
    const requestId = raw.trim();
    if (requestId && requestId.length <= 128) return requestId;
  }
  return crypto.randomUUID();
}

export type DbSelectResult = {
  data: Array<Record<string, unknown>> | null;
  error: { message: string } | null;
};

export type DbError = {
  message: string;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
};

// Diagnostic-only: surfaces Supabase/PostgREST error fields in server-side logs.
// Never includes request payloads, headers, secrets or environment values.
function rpcErrorFields(error: DbError | null): BridgeLogFields {
  return {
    rpc_error_code: error?.code ?? null,
    rpc_error_message: error?.message ?? null,
    rpc_error_details: error?.details ?? null,
    rpc_error_hint: error?.hint ?? null,
  };
}

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
  ) => Promise<{ data: unknown; error: DbError | null }>;
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

function payloadBytes(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return -1;
  }
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readNonNegInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return null;
  }
  return value;
}

function readPositiveInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return null;
  }
  return value;
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
  meta: { requestId: string; action: RadarBridgeAction },
): Promise<Response> {
  bridgeLog("radar_bridge_rpc_started", {
    request_id: meta.requestId,
    action: meta.action,
    rpc_name: name,
  });
  const started = Date.now();
  const result = await db.rpc(name, args);
  const rpcElapsedMs = Date.now() - started;
  if (result.error) {
    bridgeLog("radar_bridge_rpc_error", {
      request_id: meta.requestId,
      action: meta.action,
      rpc_name: name,
      rpc_elapsed_ms: rpcElapsedMs,
      ...rpcErrorFields(result.error),
    });
    return json(
      {
        ok: false,
        error: "persist_failed",
        code: result.error.code ?? null,
        detail: result.error.message ?? null,
      },
      502,
    );
  }
  bridgeLog("radar_bridge_rpc_completed", {
    request_id: meta.requestId,
    action: meta.action,
    rpc_name: name,
    rpc_elapsed_ms: rpcElapsedMs,
  });
  return json({ ok: true, result: result.data });
}

async function handleAction(
  action: RadarBridgeAction,
  body: Record<string, unknown>,
  db: DbClient,
  requestId: string,
): Promise<Response> {
  const rpcMeta = { requestId, action };
  const historical = await handleHistoricalAction(
    action,
    body,
    db,
    (name, args) => rpcResult(db, name, args, rpcMeta),
  );
  if (historical) return historical;
  const behaviorProfile = await handleBehaviorProfileAction(
    action,
    body,
    db,
    (name, args) => rpcResult(db, name, args, rpcMeta),
  );
  if (behaviorProfile) return behaviorProfile;
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
      }, rpcMeta);
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
      }, rpcMeta);
    }
    case "release_lease": {
      const holderId = readHolderId(body);
      if (holderId === null) return json({ error: "invalid_body" }, 400);
      bridgeLog("radar_bridge_rpc_started", {
        request_id: requestId,
        action,
        rpc_name: RELEASE_LEASE_RPC,
      });
      const rpcStarted = Date.now();
      const result = await db.rpc(RELEASE_LEASE_RPC, {
        p_lease_key: RADAR_V22_LEASE_KEY,
        p_holder_id: holderId,
      });
      const rpcElapsedMs = Date.now() - rpcStarted;
      if (result.error) {
        bridgeLog("radar_bridge_rpc_error", {
          request_id: requestId,
          action,
          rpc_name: RELEASE_LEASE_RPC,
          rpc_elapsed_ms: rpcElapsedMs,
          ...rpcErrorFields(result.error),
        });
        return json(
          {
            ok: false,
            error: "persist_failed",
            code: result.error.code ?? null,
            detail: result.error.message ?? null,
          },
          502,
        );
      }
      bridgeLog("radar_bridge_rpc_completed", {
        request_id: requestId,
        action,
        rpc_name: RELEASE_LEASE_RPC,
        rpc_elapsed_ms: rpcElapsedMs,
      });
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
      }, rpcMeta);
    }
    case "publish_candidates_v2": {
      if (typeof body.p_generation_id !== "string") {
        return json({ error: "invalid_body" }, 400);
      }
      if (typeof body.p_trading_date !== "string") {
        return json({ error: "invalid_body" }, 400);
      }
      if (typeof body.p_session_kind !== "string") {
        return json({ error: "invalid_body" }, 400);
      }
      if (typeof body.p_synced_at !== "string") {
        return json({ error: "invalid_body" }, 400);
      }
      return await rpcResult(db, REPLACE_RADAR_V2_RPC, {
        p_generation_id: body.p_generation_id,
        p_trading_date: body.p_trading_date,
        p_session_kind: body.p_session_kind,
        p_synced_at: body.p_synced_at,
        p_candidates: body.p_candidates,
        p_events: body.p_events,
        p_sentinel_enabled: body.p_sentinel_enabled === true,
        p_last_provider_event_at: body.p_last_provider_event_at ?? null,
        p_last_receive_at: body.p_last_receive_at ?? null,
      }, rpcMeta);
    }
    case "set_feed_status": {
      if (typeof body.p_status !== "string" || typeof body.p_synced_at !== "string") {
        return json({ error: "invalid_body" }, 400);
      }
      return await rpcResult(db, SET_RADAR_STATUS_RPC, {
        p_status: body.p_status,
        p_last_provider_event_at: body.p_last_provider_event_at ?? null,
        p_synced_at: body.p_synced_at,
      }, rpcMeta);
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
      }, rpcMeta);
    }
    case "replace_52w_baseline_with_exclusions": {
      if (typeof body.p_generation_id !== "string") {
        return json({ error: "invalid_body" }, 400);
      }
      const exclusions = parseValidatedBaselineExclusions(
        body.p_exclusions,
        body.p_min_sessions,
        body.p_rows,
      );
      if (!exclusions) {
        return json({ error: "invalid_body" }, 400);
      }
      return await rpcResult(db, REPLACE_52W_WITH_EXCLUSIONS_RPC, {
        p_generation_id: body.p_generation_id,
        p_rows: body.p_rows,
        p_period_start: body.p_period_start,
        p_period_end: body.p_period_end,
        p_provider_as_of: body.p_provider_as_of,
        p_status: body.p_status,
        p_exclusions: exclusions,
        p_min_sessions: body.p_min_sessions,
      }, rpcMeta);
    }
    case "start_52w_baseline_publish": {
      const generationId = readNonEmptyString(body.p_generation_id);
      const periodStart = readNonEmptyString(body.p_period_start);
      const periodEnd = readNonEmptyString(body.p_period_end);
      const providerAsOf = readNonEmptyString(body.p_provider_as_of);
      const expectedBaseline = readNonNegInt(body.p_expected_baseline_count);
      const expectedExclusions = readNonNegInt(body.p_expected_exclusion_count);
      const minSessions = readPositiveInt(body.p_min_sessions);
      if (
        generationId === null ||
        periodStart === null ||
        periodEnd === null ||
        providerAsOf === null ||
        expectedBaseline === null ||
        expectedExclusions === null ||
        minSessions === null
      ) {
        return json({ error: "invalid_body" }, 400);
      }
      return await rpcResult(db, START_52W_PUBLISH_RPC, {
        p_generation_id: generationId,
        p_period_start: periodStart,
        p_period_end: periodEnd,
        p_provider_as_of: providerAsOf,
        p_expected_baseline_count: expectedBaseline,
        p_expected_exclusion_count: expectedExclusions,
        p_min_sessions: minSessions,
      }, rpcMeta);
    }
    case "append_52w_baseline_rows": {
      const generationId = readNonEmptyString(body.p_generation_id);
      if (generationId === null || !Array.isArray(body.p_rows)) {
        return json({ error: "invalid_body" }, 400);
      }
      bridgeLog("radar_bridge_append_payload_bytes", {
        request_id: requestId,
        action,
        payload_bytes: payloadBytes(body),
        chunk_item_count: body.p_rows.length,
      });
      return await rpcResult(db, APPEND_52W_ROWS_RPC, {
        p_generation_id: generationId,
        p_rows: body.p_rows,
      }, rpcMeta);
    }
    case "append_52w_baseline_exclusions": {
      const generationId = readNonEmptyString(body.p_generation_id);
      if (generationId === null || !Array.isArray(body.p_exclusions)) {
        return json({ error: "invalid_body" }, 400);
      }
      bridgeLog("radar_bridge_append_payload_bytes", {
        request_id: requestId,
        action,
        payload_bytes: payloadBytes(body),
        chunk_item_count: body.p_exclusions.length,
      });
      return await rpcResult(db, APPEND_52W_EXCLUSIONS_RPC, {
        p_generation_id: generationId,
        p_exclusions: body.p_exclusions,
      }, rpcMeta);
    }
    case "append_daily_volume_history": {
      const generationId = readNonEmptyString(body.p_generation_id);
      const providerAsOf = readNonEmptyString(body.p_provider_as_of);
      if (
        generationId === null ||
        providerAsOf === null ||
        !Array.isArray(body.p_rows)
      ) {
        return json({ error: "invalid_body" }, 400);
      }
      bridgeLog("radar_bridge_append_payload_bytes", {
        request_id: requestId,
        action,
        payload_bytes: payloadBytes(body),
        chunk_item_count: body.p_rows.length,
      });
      return await rpcResult(db, APPEND_DAILY_VOLUME_RPC, {
        p_generation_id: generationId,
        p_rows: body.p_rows,
        p_provider_as_of: providerAsOf,
      }, rpcMeta);
    }
    case "finalize_52w_baseline_publish": {
      const generationId = readNonEmptyString(body.p_generation_id);
      if (generationId === null) {
        return json({ error: "invalid_body" }, 400);
      }
      return await rpcResult(db, FINALIZE_52W_PUBLISH_RPC, {
        p_generation_id: generationId,
      }, rpcMeta);
    }
    case "get_52w_state": {
      let result = await db
        .from(BASELINE_STATE_TABLE)
        .select(BASELINE_STATE_SELECT)
        .eq("state_key", "current")
        .limit(1) as DbSelectResult;
      if (result.error) {
        result = await db
          .from(BASELINE_STATE_TABLE)
          .select(BASELINE_STATE_SELECT_PRE_MIGRATION)
          .eq("state_key", "current")
          .limit(1) as DbSelectResult;
      }
      if (result.error) return json({ ok: false, error: "persist_failed" }, 502);
      const rows = result.data ?? [];
      return json({ ok: true, state: rows[0] ?? null });
    }
    default:
      return json({ error: "unknown_action" }, 400);
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
  const requestId = readRequestId(body);
  const started = Date.now();
  bridgeLog("radar_bridge_received", {
    request_id: requestId,
    action: body.action,
    received: true,
  });
  try {
    const res = await handleAction(body.action, body, db, requestId);
    bridgeLog("radar_bridge_complete", {
      request_id: requestId,
      action: body.action,
      elapsed_ms: Date.now() - started,
      http_status: res.status,
    });
    return res;
  } catch {
    console.error("[radar-worker-bridge] internal_error");
    bridgeLog("radar_bridge_complete", {
      request_id: requestId,
      action: body.action,
      elapsed_ms: Date.now() - started,
      http_status: 500,
    });
    return json({ error: "internal_error" }, 500);
  }
}
