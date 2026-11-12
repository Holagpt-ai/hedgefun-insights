import {
  PENNY_CONTINUATION_HANDOFF_EXPIRE_STALE_RPC,
  PENNY_CONTINUATION_HANDOFF_LIST_ACTIVE_RPC,
  PENNY_CONTINUATION_HANDOFF_REVOKE_RPC,
  PENNY_CONTINUATION_HANDOFF_UPSERT_RPC,
} from "../_shared/config/penny-continuation-persistence.config.ts";
import type { RadarBridgeAction } from "./actions.ts";

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
  if (typeof row.publication_idempotency_key !== "string") return null;
  return row;
}

function readIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return null;
  return value.trim();
}

function readLimit(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return Math.floor(value);
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.floor(n);
  }
  return undefined;
}

export async function handlePennyContinuationHandoffAction(
  action: RadarBridgeAction,
  body: Record<string, unknown>,
  rpc: (name: string, args: Record<string, unknown>) => Promise<Response>,
): Promise<Response | null> {
  switch (action) {
    case "penny_continuation_handoff_upsert": {
      const row = readHandoffRow(body);
      if (!row) return jsonResponse({ error: "invalid_body" }, 400);
      return await rpc(PENNY_CONTINUATION_HANDOFF_UPSERT_RPC, { p_row: row });
    }
    case "penny_continuation_handoff_list_active": {
      const amDate = readIsoDate(body.am_session_date ?? body.p_am_session_date);
      if (!amDate) return jsonResponse({ error: "invalid_body" }, 400);
      const limit = readLimit(body.limit ?? body.p_limit);
      const args: Record<string, unknown> = { p_am_session_date: amDate };
      if (limit !== undefined) args.p_limit = limit;
      return await rpc(PENNY_CONTINUATION_HANDOFF_LIST_ACTIVE_RPC, args);
    }
    case "penny_continuation_handoff_revoke": {
      const symbol = body.symbol ?? body.p_symbol;
      const sessionDate = readIsoDate(
        body.source_session_date ?? body.p_source_session_date,
      );
      if (typeof symbol !== "string" || !symbol.trim() || !sessionDate) {
        return jsonResponse({ error: "invalid_body" }, 400);
      }
      return await rpc(PENNY_CONTINUATION_HANDOFF_REVOKE_RPC, {
        p_symbol: symbol,
        p_source_session_date: sessionDate,
      });
    }
    case "penny_continuation_handoff_expire_stale": {
      const asOf = readIsoDate(body.as_of_session_date ?? body.p_as_of_session_date);
      if (!asOf) return jsonResponse({ error: "invalid_body" }, 400);
      return await rpc(PENNY_CONTINUATION_HANDOFF_EXPIRE_STALE_RPC, {
        p_as_of_session_date: asOf,
      });
    }
    default:
      return null;
  }
}
