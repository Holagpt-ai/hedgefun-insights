import type { RadarBridgeAction } from "./actions.ts";
import type { DbClient } from "./handler.ts";

export const LATE_SESSION_HANDOFF_UPSERT_RPC = "late_session_handoff_upsert_v1";
export const LATE_SESSION_HANDOFF_LIST_ACTIVE_RPC = "late_session_handoff_list_active_v1";
export const LATE_SESSION_HANDOFF_EXPIRE_STALE_RPC = "late_session_handoff_expire_stale_v1";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readHandoffRow(body: Record<string, unknown>): Record<string, unknown> | null {
  const row = body.row ?? body.p_row;
  if (!isRecord(row)) return null;
  if (typeof row.symbol !== "string" || !row.symbol.trim()) return null;
  if (typeof row.source_session_date !== "string") return null;
  if (typeof row.source_category !== "string") return null;
  return row;
}

function readIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return null;
  return value.trim();
}

export async function handleLateSessionHandoffAction(
  action: RadarBridgeAction,
  body: Record<string, unknown>,
  rpc: (name: string, args: Record<string, unknown>) => Promise<Response>,
): Promise<Response | null> {
  switch (action) {
    case "late_session_handoff_upsert": {
      const row = readHandoffRow(body);
      if (!row) return jsonResponse({ error: "invalid_body" }, 400);
      return await rpc(LATE_SESSION_HANDOFF_UPSERT_RPC, { p_row: row });
    }
    case "late_session_handoff_list_active": {
      const amDate = readIsoDate(body.am_session_date ?? body.p_am_session_date);
      if (!amDate) return jsonResponse({ error: "invalid_body" }, 400);
      return await rpc(LATE_SESSION_HANDOFF_LIST_ACTIVE_RPC, { p_am_session_date: amDate });
    }
    case "late_session_handoff_expire_stale": {
      const asOf = readIsoDate(body.as_of_session_date ?? body.p_as_of_session_date);
      if (!asOf) return jsonResponse({ error: "invalid_body" }, 400);
      return await rpc(LATE_SESSION_HANDOFF_EXPIRE_STALE_RPC, { p_as_of_session_date: asOf });
    }
    default:
      return null;
  }
}

export async function persistLateSessionHandoffRows(
  db: DbClient,
  rows: readonly Record<string, unknown>[],
  rpc: (name: string, args: Record<string, unknown>) => Promise<Response>,
): Promise<void> {
  for (const row of rows) {
    await rpc(LATE_SESSION_HANDOFF_UPSERT_RPC, { p_row: row });
  }
  void db;
}
