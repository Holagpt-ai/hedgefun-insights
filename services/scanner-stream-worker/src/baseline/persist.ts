import {
  type CalendarExceptionRow,
  isIsoDate,
} from "../../../../supabase/functions/_shared/markets/session-schedule.ts";
import type { Candidate } from "./deque.ts";
import type { FetchLike } from "./grouped.ts";
import { isValidHighLow, normalizeSymbol } from "./grouped.ts";

export const REPLACE_GENERATION_RPC =
  "replace_screener_52w_baseline_generation_v1";
export const STATE_TABLE = "screener_52w_baseline_state";
export const STATE_KEY = "current";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type BaselineStatus =
  | "initializing"
  | "available"
  | "empty"
  | "unavailable";

export type BaselineRow = {
  symbol: string;
  period_start: string;
  period_end: string;
  high_52w: number;
  low_52w: number;
  high_candidates: Candidate[];
  low_candidates: Candidate[];
  sessions_observed: number;
  provider_as_of: string;
};

export type BaselineState = {
  current_generation_id: string | null;
  status: BaselineStatus;
  period_start: string | null;
  period_end: string | null;
  symbol_count: number;
  provider_as_of: string | null;
};

export type ReplaceGenerationArgs = {
  p_generation_id: string;
  p_rows: BaselineRow[];
  p_period_start: string;
  p_period_end: string;
  p_provider_as_of: string;
  p_status: "available" | "empty";
};

export type RpcFn = (
  args: ReplaceGenerationArgs,
) => Promise<{ error: { message: string } | null }>;

export type LoadStateFn = () => Promise<BaselineState | null>;

export type PublishResult =
  | { ok: true; state: BaselineState }
  | { ok: false; code: "validation_failed" | "persist_failed" };

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() === "") return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms);
}

function isCandidateArray(value: unknown): value is Candidate[] {
  if (!Array.isArray(value)) return false;
  return value.every((item) => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return false;
    }
    const row = item as { d?: unknown; v?: unknown };
    return isIsoDate(row.d) && Number.isFinite(Number(row.v)) &&
      Number(row.v) > 0;
  });
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Usable for Radar boot: AVAILABLE pointer with a generation and rows. */
export function isUsableAvailableBaseline(state: BaselineState): boolean {
  return (
    state.status === "available" &&
    isUuid(state.current_generation_id) &&
    Number.isInteger(state.symbol_count) &&
    state.symbol_count >= 1 &&
    state.period_end !== null &&
    isIsoDate(state.period_end)
  );
}

export function validateGeneration(
  rows: BaselineRow[],
  periodStart: string,
  periodEnd: string,
  generationId: string,
  providerAsOf: string,
): boolean {
  if (!isUuid(generationId)) return false;
  if (
    !isIsoDate(periodStart) || !isIsoDate(periodEnd) || periodStart > periodEnd
  ) {
    return false;
  }
  if (!isIsoTimestamp(providerAsOf)) return false;
  if (!Array.isArray(rows)) return false;

  const seen = new Set<string>();
  for (const row of rows) {
    if (row === null || typeof row !== "object") return false;
    const symbol = normalizeSymbol(row.symbol);
    if (!symbol || symbol !== row.symbol) return false;
    if (seen.has(symbol)) return false;
    seen.add(symbol);
    if (row.period_start !== periodStart || row.period_end !== periodEnd) {
      return false;
    }
    if (!isValidHighLow(row.high_52w, row.low_52w)) return false;
    if (!Number.isInteger(row.sessions_observed) || row.sessions_observed < 1) {
      return false;
    }
    if (
      !isCandidateArray(row.high_candidates) ||
      !isCandidateArray(row.low_candidates)
    ) {
      return false;
    }
    if (row.high_candidates.length < 1 || row.low_candidates.length < 1) {
      return false;
    }
    if (row.high_candidates[0].v !== row.high_52w) return false;
    if (row.low_candidates[0].v !== row.low_52w) return false;
    if (row.provider_as_of !== providerAsOf) return false;
  }
  return true;
}

export async function publishGeneration(
  rpc: RpcFn,
  input: {
    generationId: string;
    rows: BaselineRow[];
    periodStart: string;
    periodEnd: string;
    providerAsOf: string;
  },
): Promise<PublishResult> {
  const status: "available" | "empty" = input.rows.length === 0
    ? "empty"
    : "available";
  if (
    !validateGeneration(
      input.rows,
      input.periodStart,
      input.periodEnd,
      input.generationId,
      input.providerAsOf,
    )
  ) {
    return { ok: false, code: "validation_failed" };
  }

  const args: ReplaceGenerationArgs = {
    p_generation_id: input.generationId,
    p_rows: input.rows,
    p_period_start: input.periodStart,
    p_period_end: input.periodEnd,
    p_provider_as_of: input.providerAsOf,
    p_status: status,
  };

  try {
    const result = await rpc(args);
    if (result.error) return { ok: false, code: "persist_failed" };
  } catch {
    return { ok: false, code: "persist_failed" };
  }

  return {
    ok: true,
    state: {
      current_generation_id: input.generationId,
      status,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      symbol_count: input.rows.length,
      provider_as_of: input.providerAsOf,
    },
  };
}

export function parseStateRow(raw: unknown): BaselineState | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const row = raw as Record<string, unknown>;
  const generationId = row.current_generation_id;
  if (generationId !== null && !isUuid(generationId)) return null;
  const status = row.status;
  if (
    status !== "initializing" &&
    status !== "available" &&
    status !== "empty" &&
    status !== "unavailable"
  ) {
    return null;
  }
  const periodStart = row.period_start;
  const periodEnd = row.period_end;
  if (periodStart !== null && !isIsoDate(periodStart)) return null;
  if (periodEnd !== null && !isIsoDate(periodEnd)) return null;
  const symbolCount = Number(row.symbol_count ?? 0);
  if (!Number.isFinite(symbolCount) || symbolCount < 0) return null;
  const providerAsOf = row.provider_as_of;
  if (providerAsOf !== null && !isIsoTimestamp(providerAsOf)) return null;
  return {
    current_generation_id: generationId === null ? null : generationId,
    status,
    period_start: periodStart === null ? null : periodStart,
    period_end: periodEnd === null ? null : periodEnd,
    symbol_count: Math.trunc(symbolCount),
    provider_as_of: providerAsOf === null ? null : providerAsOf,
  };
}

export function emptyState(): BaselineState {
  return {
    current_generation_id: null,
    status: "initializing",
    period_start: null,
    period_end: null,
    symbol_count: 0,
    provider_as_of: null,
  };
}

export function createSupabaseRpc(opts: {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetch: FetchLike;
}): RpcFn {
  return async (args) => {
    const res = await opts.fetch(
      `${opts.supabaseUrl}/rest/v1/rpc/${REPLACE_GENERATION_RPC}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opts.serviceRoleKey}`,
          apikey: opts.serviceRoleKey,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify(args),
      },
    );
    if (!res.ok) return { error: { message: "persist_failed" } };
    return { error: null };
  };
}

export function createSupabaseStateLoader(opts: {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetch: FetchLike;
}): LoadStateFn {
  return async () => {
    const url = `${opts.supabaseUrl}/rest/v1/${STATE_TABLE}` +
      `?state_key=eq.${STATE_KEY}` +
      "&select=current_generation_id,status,period_start,period_end,symbol_count,provider_as_of" +
      "&limit=1";
    const res = await opts.fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${opts.serviceRoleKey}`,
        apikey: opts.serviceRoleKey,
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return null;
    }
    if (!Array.isArray(body) || body.length === 0) return emptyState();
    return parseStateRow(body[0]);
  };
}

export type CalendarExceptionLoader = () => Promise<
  CalendarExceptionRow[] | null
>;

export function parseExceptionRow(raw: unknown): CalendarExceptionRow | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const row = raw as Record<string, unknown>;
  if (!isIsoDate(row.session_date)) return null;
  if (row.market_status !== "closed" && row.market_status !== "early_close") {
    return null;
  }
  if (
    typeof row.regular_open_et !== "string" ||
    typeof row.regular_close_et !== "string" ||
    typeof row.after_hours_end_et !== "string"
  ) {
    return null;
  }
  const holiday = row.holiday_name;
  if (holiday !== null && typeof holiday !== "string") return null;
  return {
    session_date: row.session_date,
    market_status: row.market_status,
    regular_open_et: row.regular_open_et,
    regular_close_et: row.regular_close_et,
    after_hours_end_et: row.after_hours_end_et,
    holiday_name: holiday,
  };
}

export function createCalendarExceptionLoader(opts: {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetch: FetchLike;
}): CalendarExceptionLoader {
  return async () => {
    const url = `${opts.supabaseUrl}/rest/v1/market_session_calendar` +
      "?select=session_date,market_status,regular_open_et,regular_close_et,after_hours_end_et,holiday_name";
    try {
      const res = await opts.fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${opts.serviceRoleKey}`,
          apikey: opts.serviceRoleKey,
          Accept: "application/json",
        },
      });
      if (!res.ok) return null;
      const body: unknown = await res.json();
      if (!Array.isArray(body)) return null;
      const rows: CalendarExceptionRow[] = [];
      for (const item of body) {
        const parsed = parseExceptionRow(item);
        if (parsed) rows.push(parsed);
      }
      return rows;
    } catch {
      return null;
    }
  };
}
