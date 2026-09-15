import {
  type CalendarExceptionRow,
  isIsoDate,
} from "../../../../supabase/functions/_shared/markets/session-schedule.ts";
import type { BaselineExclusionPayload } from "../../../../supabase/functions/_shared/screeners/baseline-exclusion-publish.ts";
import { parseValidatedBaselineExclusions } from "../../../../supabase/functions/_shared/screeners/baseline-exclusion-publish.ts";
import {
  chunkItemsByRequestBytes,
  STAGED_CHUNK_SAFETY_BYTES,
  STAGED_CHUNK_TARGET_BYTES,
} from "./chunk.ts";
import type { Candidate } from "./deque.ts";
import type { FetchLike } from "./grouped.ts";
import { isValidHighLow, normalizeSymbol } from "./grouped.ts";

export {
  STAGED_CHUNK_SAFETY_BYTES,
  STAGED_CHUNK_TARGET_BYTES,
} from "./chunk.ts";

export const REPLACE_GENERATION_RPC =
  "replace_screener_52w_baseline_generation_v1";
export const REPLACE_GENERATION_WITH_EXCLUSIONS_RPC =
  "replace_screener_52w_baseline_generation_with_exclusions_v1";
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
  policy_min_sessions?: number | null;
  policy_excluded_count?: number | null;
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

export type ReplaceGenerationWithExclusionsArgs = ReplaceGenerationArgs & {
  p_exclusions: BaselineExclusionPayload[];
  p_min_sessions: number;
};

export type ExclusionAwareRpcFn = (
  args: ReplaceGenerationWithExclusionsArgs,
) => Promise<{ error: { message: string } | null }>;

export type StartPublishArgs = {
  p_generation_id: string;
  p_period_start: string;
  p_period_end: string;
  p_provider_as_of: string;
  p_expected_baseline_count: number;
  p_expected_exclusion_count: number;
  p_min_sessions: number;
};

export type AppendRowsArgs = {
  p_generation_id: string;
  p_rows: BaselineRow[];
};

export type AppendExclusionsArgs = {
  p_generation_id: string;
  p_exclusions: BaselineExclusionPayload[];
};

export type FinalizePublishArgs = {
  p_generation_id: string;
};

export type StagedPublishClient = {
  start: (
    args: StartPublishArgs,
  ) => Promise<{ error: { message: string } | null }>;
  appendRows: (
    args: AppendRowsArgs,
  ) => Promise<{ error: { message: string } | null }>;
  appendExclusions: (
    args: AppendExclusionsArgs,
  ) => Promise<{ error: { message: string } | null }>;
  finalize: (
    args: FinalizePublishArgs,
  ) => Promise<{ error: { message: string } | null }>;
};

const STAGED_REQUEST_ID_PLACEHOLDER =
  "00000000-0000-0000-0000-000000000000";

export function wrapAppendRowsRequest(
  generationId: string,
  rows: BaselineRow[],
): Record<string, unknown> {
  return {
    action: "append_52w_baseline_rows",
    p_generation_id: generationId,
    p_rows: rows,
    request_id: STAGED_REQUEST_ID_PLACEHOLDER,
  };
}

export function wrapAppendExclusionsRequest(
  generationId: string,
  exclusions: BaselineExclusionPayload[],
): Record<string, unknown> {
  return {
    action: "append_52w_baseline_exclusions",
    p_generation_id: generationId,
    p_exclusions: exclusions,
    request_id: STAGED_REQUEST_ID_PLACEHOLDER,
  };
}

export type { BaselineExclusionPayload };

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
      policy_min_sessions: null,
      policy_excluded_count: null,
    },
  };
}

export async function publishGenerationWithExclusions(
  rpc: ExclusionAwareRpcFn,
  input: {
    generationId: string;
    rows: BaselineRow[];
    exclusions: BaselineExclusionPayload[];
    minSessions: number;
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
  const exclusions = parseValidatedBaselineExclusions(
    input.exclusions,
    input.minSessions,
    input.rows,
  );
  if (!exclusions) return { ok: false, code: "validation_failed" };

  const args: ReplaceGenerationWithExclusionsArgs = {
    p_generation_id: input.generationId,
    p_rows: input.rows,
    p_period_start: input.periodStart,
    p_period_end: input.periodEnd,
    p_provider_as_of: input.providerAsOf,
    p_status: status,
    p_exclusions: exclusions,
    p_min_sessions: input.minSessions,
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
      policy_min_sessions: input.minSessions,
      policy_excluded_count: exclusions.length,
    },
  };
}

async function stagedOk(
  call: () => Promise<{ error: { message: string } | null }>,
): Promise<boolean> {
  try {
    const result = await call();
    return result.error == null;
  } catch {
    return false;
  }
}

/**
 * Stage baseline rows and exclusions in bounded HTTP chunks, then finalize
 * atomically. lastSuccessfulPeriodEnd must only advance when this returns ok.
 */
export async function publishGenerationStaged(
  publish: StagedPublishClient,
  input: {
    generationId: string;
    rows: BaselineRow[];
    exclusions: BaselineExclusionPayload[];
    minSessions: number;
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
  const exclusions = parseValidatedBaselineExclusions(
    input.exclusions,
    input.minSessions,
    input.rows,
  );
  if (!exclusions) return { ok: false, code: "validation_failed" };

  const rowChunks = chunkItemsByRequestBytes(
    input.rows,
    (chunk) => wrapAppendRowsRequest(input.generationId, chunk),
    {
      targetBytes: STAGED_CHUNK_TARGET_BYTES,
      safetyBytes: STAGED_CHUNK_SAFETY_BYTES,
    },
  );
  if (!rowChunks.ok) return { ok: false, code: "validation_failed" };

  const exclusionChunks = chunkItemsByRequestBytes(
    exclusions,
    (chunk) => wrapAppendExclusionsRequest(input.generationId, chunk),
    {
      targetBytes: STAGED_CHUNK_TARGET_BYTES,
      safetyBytes: STAGED_CHUNK_SAFETY_BYTES,
    },
  );
  if (!exclusionChunks.ok) return { ok: false, code: "validation_failed" };

  const started = await stagedOk(() =>
    publish.start({
      p_generation_id: input.generationId,
      p_period_start: input.periodStart,
      p_period_end: input.periodEnd,
      p_provider_as_of: input.providerAsOf,
      p_expected_baseline_count: input.rows.length,
      p_expected_exclusion_count: exclusions.length,
      p_min_sessions: input.minSessions,
    })
  );
  if (!started) return { ok: false, code: "persist_failed" };

  for (const chunk of rowChunks.chunks) {
    const appended = await stagedOk(() =>
      publish.appendRows({
        p_generation_id: input.generationId,
        p_rows: chunk,
      })
    );
    if (!appended) return { ok: false, code: "persist_failed" };
  }

  for (const chunk of exclusionChunks.chunks) {
    const appended = await stagedOk(() =>
      publish.appendExclusions({
        p_generation_id: input.generationId,
        p_exclusions: chunk,
      })
    );
    if (!appended) return { ok: false, code: "persist_failed" };
  }

  const finalized = await stagedOk(() =>
    publish.finalize({ p_generation_id: input.generationId })
  );
  if (!finalized) return { ok: false, code: "persist_failed" };

  return {
    ok: true,
    state: {
      current_generation_id: input.generationId,
      status,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      symbol_count: input.rows.length,
      provider_as_of: input.providerAsOf,
      policy_min_sessions: input.minSessions,
      policy_excluded_count: exclusions.length,
    },
  };
}

export function hasCompletePolicyExclusionEvidence(
  state: BaselineState,
  expectedMinSessions: number,
): boolean {
  const min = state.policy_min_sessions;
  const count = state.policy_excluded_count;
  return min === expectedMinSessions &&
    Number.isInteger(min) && min >= 1 &&
    typeof count === "number" && Number.isInteger(count) && count >= 0;
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
  let policyMin: number | null = null;
  let policyCount: number | null = null;
  if (row.policy_min_sessions != null && row.policy_excluded_count != null) {
    const min = Number(row.policy_min_sessions);
    const count = Number(row.policy_excluded_count);
    if (
      Number.isInteger(min) && min >= 1 &&
      Number.isInteger(count) && count >= 0
    ) {
      policyMin = min;
      policyCount = count;
    }
  }
  return {
    current_generation_id: generationId === null ? null : generationId,
    status,
    period_start: periodStart === null ? null : periodStart,
    period_end: periodEnd === null ? null : periodEnd,
    symbol_count: Math.trunc(symbolCount),
    provider_as_of: providerAsOf === null ? null : providerAsOf,
    policy_min_sessions: policyMin,
    policy_excluded_count: policyCount,
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
    policy_min_sessions: null,
    policy_excluded_count: null,
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
      "&select=current_generation_id,status,period_start,period_end,symbol_count,provider_as_of,policy_min_sessions,policy_excluded_count" +
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
