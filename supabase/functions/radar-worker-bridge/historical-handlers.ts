// Historical Intelligence bridge actions — fixed tables/RPCs only.

import type { RadarBridgeAction } from "./actions.ts";
import type { DbClient } from "./handler.ts";

type DbSelectResult = {
  data: Array<Record<string, unknown>> | null;
  error: { message: string } | null;
};

export const HISTORICAL_PAGE_MAX = 500;

export const HISTORICAL_IDENTITY_APPLY_RPC = "historical_identity_apply_diff";
export const HISTORICAL_DAILY_BATCH_RPC = "historical_apply_daily_batch";
export const HISTORICAL_EPISODE_BATCH_RPC = "historical_apply_episode_batch";
export const HISTORICAL_INTERRUPTED_JOB_RPC = "historical_find_interrupted_backfill_job";
export const HISTORICAL_BACKFILLED_SYMBOLS_RPC = "historical_rollout_backfilled_symbols";

export const SECURITIES_TABLE = "securities";
export const SYMBOL_HISTORY_TABLE = "security_symbol_history";
export const IDENTIFIERS_TABLE = "security_reference_identifiers";
export const BACKFILL_JOBS_TABLE = "security_backfill_jobs";
export const TICKER_SEARCH_TABLE = "ticker_search";
export const DAILY_HISTORY_TABLE = "security_daily_history";
export const EPISODES_TABLE = "market_behavior_episodes";

export const SECURITIES_SELECT =
  "security_id, current_symbol, issuer_name, security_type, exchange, country, adr_status, active, resolution_state, created_at, updated_at";
export const SYMBOL_HISTORY_SELECT =
  "security_id, symbol, exchange, effective_from, effective_to, source, source_as_of, provenance, observed_at, fetched_at";
export const IDENTIFIERS_SELECT =
  "security_id, identifier_kind, identifier_value, source, source_as_of, provenance, observed_at, fetched_at";
export const BACKFILL_JOB_SELECT =
  "job_id, job_type, state, date_from, date_to, cursor_date, cursor_token, processed_count, error_count, started_at, updated_at, completed_at, metadata";
export const DAILY_HISTORY_SELECT =
  "security_id, session_date, observed_symbol, exchange, open, high, low, close, volume, dollar_volume, previous_close, move_pct, source, source_as_of, fetched_at, computed_at, quality, freshness, provenance";
export const EPISODE_SELECT =
  "episode_id, security_id, episode_start, episode_end, observed_symbol, direction, tier, start_price, high_price, low_price, end_price, max_positive_move_pct, max_negative_move_pct, volume, dollar_volume, rvol, float_turnover, halt_count, close_strength, detected_by, origin, source, source_as_of, fetched_at, computed_at, quality, freshness, provenance, created_at, updated_at";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HistoricalDb = any;

export type HistoricalTableQuery = {
  select: (cols: string) => HistoricalSelectQuery;
  insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  update: (row: Record<string, unknown>) => HistoricalUpdateQuery;
};

export type HistoricalSelectQuery = {
  eq: (col: string, value: string | boolean) => HistoricalSelectQuery;
  lte: (col: string, value: string) => HistoricalSelectQuery;
  gte: (col: string, value: string) => HistoricalSelectQuery;
  or: (filter: string) => HistoricalSelectQuery;
  order: (col: string, opts?: { ascending?: boolean }) => HistoricalSelectQuery;
  range: (from: number, to: number) => Promise<DbSelectResult>;
  limit: (n: number) => Promise<DbSelectResult>;
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
};

export type HistoricalUpdateQuery = {
  eq: (col: string, value: string) => Promise<{ error: { message: string } | null }>;
};

function readNonNegInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return null;
  return value;
}

function readPositiveInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) return null;
  return value;
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readUuid(value: unknown): string | null {
  const raw = readNonEmptyString(value);
  if (!raw) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)) {
    return null;
  }
  return raw;
}

function readDate(value: unknown): string | null {
  const raw = readNonEmptyString(value);
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

function readJsonArray(value: unknown): unknown[] | null {
  if (!Array.isArray(value)) return null;
  return value;
}

function readPage(body: Record<string, unknown>): { offset: number; limit: number } | null {
  const offset = body.page_offset === undefined ? 0 : readNonNegInt(body.page_offset);
  const limit = readPositiveInt(body.page_limit);
  if (offset === null || limit === null || limit > HISTORICAL_PAGE_MAX) return null;
  return { offset, limit };
}

function historicalDb(db: DbClient): HistoricalDb {
  return db;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function selectPage(
  db: DbClient,
  table: string,
  cols: string,
  page: { offset: number; limit: number },
  apply?: (q: HistoricalSelectQuery) => HistoricalSelectQuery,
  orderCol?: string,
): Promise<Response> {
  let query = historicalDb(db).from(table).select(cols);
  if (apply) query = apply(query);
  else if (orderCol) query = query.order(orderCol, { ascending: true }) as HistoricalSelectQuery;
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

function readJobRecord(body: Record<string, unknown>, requireJobId: boolean): Record<string, unknown> | null {
  const jobId = readUuid(body.job_id);
  if (requireJobId && !jobId) return null;
  const jobType = readNonEmptyString(body.job_type);
  const state = readNonEmptyString(body.state);
  const dateFrom = readDate(body.date_from);
  const dateTo = readDate(body.date_to);
  if (requireJobId) {
    if (!state) return null;
    return {
      job_id: jobId,
      state,
      cursor_date: body.cursor_date == null ? null : readDate(body.cursor_date),
      cursor_token: body.cursor_token == null ? null : readNonEmptyString(body.cursor_token),
      processed_count: readNonNegInt(body.processed_count) ?? 0,
      error_count: readNonNegInt(body.error_count) ?? 0,
      started_at: body.started_at == null ? null : readNonEmptyString(body.started_at),
      updated_at: readNonEmptyString(body.updated_at),
      completed_at: body.completed_at == null ? null : readNonEmptyString(body.completed_at),
      metadata: body.metadata ?? null,
    };
  }
  if (!jobId || !jobType || !state || !dateFrom || !dateTo) return null;
  const updatedAt = readNonEmptyString(body.updated_at);
  if (!updatedAt) return null;
  return {
    job_id: jobId,
    job_type: jobType,
    state,
    date_from: dateFrom,
    date_to: dateTo,
    cursor_date: body.cursor_date == null ? null : readDate(body.cursor_date),
    cursor_token: body.cursor_token == null ? null : readNonEmptyString(body.cursor_token),
    processed_count: readNonNegInt(body.processed_count) ?? 0,
    error_count: readNonNegInt(body.error_count) ?? 0,
    started_at: body.started_at == null ? null : readNonEmptyString(body.started_at),
    updated_at: updatedAt,
    completed_at: body.completed_at == null ? null : readNonEmptyString(body.completed_at),
    metadata: body.metadata ?? null,
  };
}

export async function handleHistoricalAction(
  action: RadarBridgeAction,
  body: Record<string, unknown>,
  db: DbClient,
  rpcResult: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<Response>,
): Promise<Response | null> {
  switch (action) {
    case "historical_identity_apply_diff": {
      const pSec = readJsonArray(body.p_securities);
      const pIns = readJsonArray(body.p_history_inserts);
      const pUpd = readJsonArray(body.p_history_updates);
      const pIds = readJsonArray(body.p_identifier_inserts);
      if (pSec === null || pIns === null || pUpd === null || pIds === null) {
        return jsonResponse({ error: "invalid_body" }, 400);
      }
      return await rpcResult(HISTORICAL_IDENTITY_APPLY_RPC, {
        p_securities: pSec,
        p_history_inserts: pIns,
        p_history_updates: pUpd,
        p_identifier_inserts: pIds,
      });
    }
    case "historical_apply_daily_batch": {
      const rows = readJsonArray(body.p_rows);
      if (rows === null) return jsonResponse({ error: "invalid_body" }, 400);
      return await rpcResult(HISTORICAL_DAILY_BATCH_RPC, { p_rows: rows });
    }
    case "historical_apply_episode_batch": {
      const rows = readJsonArray(body.p_rows);
      if (rows === null) return jsonResponse({ error: "invalid_body" }, 400);
      return await rpcResult(HISTORICAL_EPISODE_BATCH_RPC, { p_rows: rows });
    }
    case "historical_find_interrupted_job": {
      const dateFrom = readDate(body.p_date_from);
      const dateTo = readDate(body.p_date_to);
      if (!dateFrom || !dateTo) return jsonResponse({ error: "invalid_body" }, 400);
      return await rpcResult(HISTORICAL_INTERRUPTED_JOB_RPC, {
        p_date_from: dateFrom,
        p_date_to: dateTo,
      });
    }
    case "historical_rollout_backfilled_symbols": {
      const dateFrom = readDate(body.p_date_from);
      const dateTo = readDate(body.p_date_to);
      const minSessions = readPositiveInt(body.p_min_sessions);
      if (!dateFrom || !dateTo || minSessions === null) {
        return jsonResponse({ error: "invalid_body" }, 400);
      }
      return await rpcResult(HISTORICAL_BACKFILLED_SYMBOLS_RPC, {
        p_date_from: dateFrom,
        p_date_to: dateTo,
        p_min_sessions: minSessions,
      });
    }
    case "historical_get_job": {
      const jobId = readUuid(body.job_id);
      if (!jobId) return jsonResponse({ error: "invalid_body" }, 400);
      const result = await historicalDb(db).from(BACKFILL_JOBS_TABLE)
        .select(BACKFILL_JOB_SELECT)
        .eq("job_id", jobId)
        .maybeSingle();
      if (result.error) return jsonResponse({ ok: false, error: "persist_failed" }, 502);
      return jsonResponse({ ok: true, job: result.data });
    }
    case "historical_create_job": {
      const row = readJobRecord(body, false);
      if (!row) return jsonResponse({ error: "invalid_body" }, 400);
      const insert = await historicalDb(db).from(BACKFILL_JOBS_TABLE).insert(row);
      if (insert.error) return jsonResponse({ ok: false, error: "persist_failed" }, 502);
      return jsonResponse({ ok: true });
    }
    case "historical_update_job": {
      const row = readJobRecord(body, true);
      if (!row || !readNonEmptyString(body.updated_at)) {
        return jsonResponse({ error: "invalid_body" }, 400);
      }
      const jobId = String(row.job_id);
      const update = await historicalDb(db).from(BACKFILL_JOBS_TABLE).update(row).eq("job_id", jobId);
      if (update.error) return jsonResponse({ ok: false, error: "persist_failed" }, 502);
      return jsonResponse({ ok: true });
    }
    case "historical_list_eligible_symbols": {
      const page = readPage(body);
      if (!page) return jsonResponse({ error: "invalid_body" }, 400);
      return await selectPage(db, TICKER_SEARCH_TABLE, "symbol, exchange, name", page, (q) =>
        q.eq("active", true).eq("type", "CS"), "symbol");
    }
    case "historical_list_securities": {
      const page = readPage(body);
      if (!page) return jsonResponse({ error: "invalid_body" }, 400);
      return await selectPage(db, SECURITIES_TABLE, SECURITIES_SELECT, page, undefined, "security_id");
    }
    case "historical_list_symbol_history": {
      const page = readPage(body);
      if (!page) return jsonResponse({ error: "invalid_body" }, 400);
      const securityId = body.security_id == null ? null : readUuid(body.security_id);
      if (body.security_id !== undefined && body.security_id !== null && !securityId) {
        return jsonResponse({ error: "invalid_body" }, 400);
      }
      return await selectPage(db, SYMBOL_HISTORY_TABLE, SYMBOL_HISTORY_SELECT, page, (q) => {
        if (securityId) return q.eq("security_id", securityId);
        return q;
      }, "security_id");
    }
    case "historical_list_reference_identifiers": {
      const page = readPage(body);
      if (!page) return jsonResponse({ error: "invalid_body" }, 400);
      const securityId = body.security_id == null ? null : readUuid(body.security_id);
      if (body.security_id !== undefined && body.security_id !== null && !securityId) {
        return jsonResponse({ error: "invalid_body" }, 400);
      }
      return await selectPage(db, IDENTIFIERS_TABLE, IDENTIFIERS_SELECT, page, (q) => {
        if (securityId) return q.eq("security_id", securityId);
        return q;
      }, "security_id");
    }
    case "historical_get_daily_history": {
      const securityId = readUuid(body.security_id);
      const sessionDate = readDate(body.session_date);
      if (!securityId || !sessionDate) return jsonResponse({ error: "invalid_body" }, 400);
      const result = await historicalDb(db).from(DAILY_HISTORY_TABLE)
        .select(DAILY_HISTORY_SELECT)
        .eq("security_id", securityId)
        .eq("session_date", sessionDate)
        .maybeSingle();
      if (result.error) return jsonResponse({ ok: false, error: "persist_failed" }, 502);
      return jsonResponse({ ok: true, row: result.data });
    }
    case "historical_list_daily_history": {
      const page = readPage(body);
      if (!page) return jsonResponse({ error: "invalid_body" }, 400);
      const securityId = body.security_id == null || body.security_id === undefined
        ? null
        : readUuid(body.security_id);
      if (body.security_id != null && !securityId) return jsonResponse({ error: "invalid_body" }, 400);
      const fromDate = body.session_date_from == null ? null : readDate(body.session_date_from);
      const toDate = body.session_date_to == null ? null : readDate(body.session_date_to);
      if (body.session_date_from != null && !fromDate) return jsonResponse({ error: "invalid_body" }, 400);
      if (body.session_date_to != null && !toDate) return jsonResponse({ error: "invalid_body" }, 400);
      return await selectPage(db, DAILY_HISTORY_TABLE, DAILY_HISTORY_SELECT, page, (q) => {
        let next = securityId ? q.eq("security_id", securityId) : q;
        if (fromDate) next = next.gte("session_date", fromDate);
        if (toDate) next = next.lte("session_date", toDate);
        return next;
      }, "session_date");
    }
    case "historical_list_episodes": {
      const page = readPage(body);
      const securityId = readUuid(body.security_id);
      if (!page || !securityId) return jsonResponse({ error: "invalid_body" }, 400);
      return await selectPage(db, EPISODES_TABLE, EPISODE_SELECT, page, (q) =>
        q.eq("security_id", securityId), "episode_start");
    }
    case "historical_symbol_at": {
      const securityId = readUuid(body.security_id);
      const eventDate = readDate(body.event_date);
      if (!securityId || !eventDate) return jsonResponse({ error: "invalid_body" }, 400);
      const result = await historicalDb(db).from(SYMBOL_HISTORY_TABLE)
        .select("security_id, symbol, exchange, effective_from, effective_to")
        .eq("security_id", securityId)
        .lte("effective_from", eventDate)
        .or(`effective_to.is.null,effective_to.gte.${eventDate}`)
        .limit(10);
      if (result.error) return jsonResponse({ ok: false, error: "persist_failed" }, 502);
      const rows = result.data ?? [];
      if (rows.length !== 1) return jsonResponse({ ok: true, symbol: null });
      const row = rows[0];
      return jsonResponse({
        ok: true,
        symbol: {
          security_id: row.security_id,
          symbol: row.symbol,
          exchange: row.exchange,
          effective_from: row.effective_from,
          effective_to: row.effective_to,
        },
      });
    }
    default:
      return null;
  }
}
