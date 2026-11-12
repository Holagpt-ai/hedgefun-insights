import {
  PENNY_CONTINUATION_HANDOFF_EXPIRE_STALE_RPC,
  PENNY_CONTINUATION_HANDOFF_LIST_ACTIVE_RPC,
  PENNY_CONTINUATION_HANDOFF_REVOKE_RPC,
  PENNY_CONTINUATION_HANDOFF_UPSERT_RPC,
} from "../_shared/config/penny-continuation-persistence.config.ts";
import { normalizePennyHandoffReadPairs } from "../_shared/am-inbox/penny-continuation-handoff-read-pairs.ts";
import { validatePennyHandoffUpsertPayload } from "../_shared/am-inbox/penny-continuation-handoff-upsert-validation.ts";
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
  return validatePennyHandoffUpsertPayload(row) ? row : null;
}

function readIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return null;
  return value.trim();
}

function readPairs(body: Record<string, unknown>): unknown {
  return body.pairs ?? body.p_pair_requests ?? body.p_pairs;
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
      const pairs = normalizePennyHandoffReadPairs(readPairs(body));
      if (!amDate || !pairs) return jsonResponse({ error: "invalid_body" }, 400);
      return await rpc(PENNY_CONTINUATION_HANDOFF_LIST_ACTIVE_RPC, {
        p_am_session_date: amDate,
        p_pairs: pairs,
      });
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
