// Bounded, resumable 52-week baseline sync. Cron invokes repeatedly.
// Failures retain the last published baseline generation.

import {
  authorizeScreenerSync,
  type EnvReader,
} from "../_shared/screeners/auth.ts";
import {
  type FetchLike,
  ProviderUnavailableError,
} from "../_shared/screeners/provider.ts";
import type { CalendarExceptionRow } from "../_shared/markets/session-schedule.ts";
import { isIsoDate } from "../_shared/markets/session-schedule.ts";
import {
  BASELINE_DATES_PER_INVOCATION,
  BASELINE_LOOKBACK_CALENDAR_DAYS,
  BASELINE_MIN_SESSIONS,
  remainingWeekdays,
  resolveBaselineWindow,
} from "../_shared/markets/baseline-window.ts";
import {
  barsToPayload,
  fetchGroupedDay,
} from "../_shared/screeners/grouped-daily.ts";

export const START_JOB_RPC = "start_screener_52w_baseline_job_v1";
export const APPLY_DAY_RPC = "apply_screener_52w_baseline_day_v1";
export const FINALIZE_JOB_RPC = "finalize_screener_52w_baseline_job_v1";
export const ACQUIRE_RUN_LEASE_RPC =
  "try_acquire_screener_52w_baseline_run_lease_v1";
export const RELEASE_RUN_LEASE_RPC =
  "release_screener_52w_baseline_run_lease_v1";
export const BASELINE_RUN_LEASE_TTL_MS = 360_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

export type JobSnapshot = {
  generation_id: string;
  period_start: string;
  period_end: string;
  status: "running" | "idle";
  last_applied_date: string | null;
  dates_total: number;
  dates_applied: number;
  resumed?: boolean;
};

export type FinalizeSnapshot = {
  published: boolean;
  symbol_count: number;
  status: "available" | "empty";
};

export type DbClient = {
  from: (table: string) => { select: (cols: string) => DbQuery };
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export type BaselineSyncDeps = {
  env: EnvReader;
  fetch: FetchLike;
  createClient: (url: string, key: string) => DbClient;
  nowIso: () => string;
  nowMs?: () => number;
  newGenerationId?: () => string;
  newHolderId?: () => string;
  leaseTtlMs?: number;
  datesPerInvocation?: number;
  lookbackCalendarDays?: number;
  minSessions?: number;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseException(
  raw: Record<string, unknown>,
): CalendarExceptionRow | null {
  if (typeof raw.session_date !== "string" || !isIsoDate(raw.session_date)) {
    return null;
  }
  if (raw.market_status !== "closed" && raw.market_status !== "early_close") {
    return null;
  }
  if (
    typeof raw.regular_open_et !== "string" ||
    typeof raw.regular_close_et !== "string" ||
    typeof raw.after_hours_end_et !== "string"
  ) {
    return null;
  }
  const holiday = raw.holiday_name;
  if (holiday !== null && typeof holiday !== "string") return null;
  return {
    session_date: raw.session_date,
    market_status: raw.market_status,
    regular_open_et: raw.regular_open_et,
    regular_close_et: raw.regular_close_et,
    after_hours_end_et: raw.after_hours_end_et,
    holiday_name: holiday,
  };
}

async function loadExceptions(
  sb: DbClient,
): Promise<CalendarExceptionRow[] | null> {
  try {
    const res = await sb
      .from("market_session_calendar")
      .select(
        "session_date,market_status,regular_open_et,regular_close_et,after_hours_end_et,holiday_name",
      );
    if (res.error || !res.data) return null;
    const rows: CalendarExceptionRow[] = [];
    for (const item of res.data) {
      const parsed = parseException(item);
      if (parsed) rows.push(parsed);
    }
    return rows;
  } catch {
    return null;
  }
}

async function loadPublishedState(sb: DbClient): Promise<{
  status: string | null;
  period_end: string | null;
  current_generation_id: string | null;
}> {
  try {
    const res = await sb
      .from("screener_52w_baseline_state")
      .select("status,period_end,current_generation_id")
      .eq("state_key", "current")
      .limit(1);
    if (res.error || !res.data || res.data.length === 0) {
      return { status: null, period_end: null, current_generation_id: null };
    }
    const row = res.data[0];
    return {
      status: typeof row.status === "string" ? row.status : null,
      period_end: typeof row.period_end === "string" ? row.period_end : null,
      current_generation_id: typeof row.current_generation_id === "string"
        ? row.current_generation_id
        : null,
    };
  } catch {
    return { status: null, period_end: null, current_generation_id: null };
  }
}

async function loadJob(sb: DbClient): Promise<JobSnapshot | null> {
  try {
    const res = await sb
      .from("screener_52w_baseline_job")
      .select(
        "generation_id,period_start,period_end,status,last_applied_date,dates_total,dates_applied",
      )
      .eq("job_key", "current")
      .limit(1);
    if (res.error || !res.data || res.data.length === 0) return null;
    const row = res.data[0];
    if (typeof row.generation_id !== "string") return null;
    if (
      typeof row.period_start !== "string" || typeof row.period_end !== "string"
    ) {
      return null;
    }
    if (row.status !== "running" && row.status !== "idle") return null;
    return {
      generation_id: row.generation_id,
      period_start: row.period_start,
      period_end: row.period_end,
      status: row.status,
      last_applied_date: typeof row.last_applied_date === "string"
        ? row.last_applied_date
        : null,
      dates_total: Number(row.dates_total),
      dates_applied: Number(row.dates_applied),
    };
  } catch {
    return null;
  }
}

function asJobSnapshot(data: unknown): JobSnapshot | null {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }
  const row = data as Record<string, unknown>;
  if (typeof row.generation_id !== "string") return null;
  if (
    typeof row.period_start !== "string" || typeof row.period_end !== "string"
  ) {
    return null;
  }
  if (row.status !== "running" && row.status !== "idle") return null;
  return {
    generation_id: row.generation_id,
    period_start: row.period_start,
    period_end: row.period_end,
    status: row.status,
    last_applied_date: typeof row.last_applied_date === "string"
      ? row.last_applied_date
      : null,
    dates_total: Number(row.dates_total),
    dates_applied: Number(row.dates_applied),
    resumed: row.resumed === true,
  };
}

export async function handleSyncScreener52wBaselines(
  req: Request,
  deps: BaselineSyncDeps,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const auth = await authorizeScreenerSync(
    req.headers.get("Authorization"),
    deps.env,
  );
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const supabaseUrl = deps.env("SUPABASE_URL") ?? "";
  const serviceKey = deps.env("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const apiKey = deps.env("POLYGON_API_KEY") ?? "";
  if (!supabaseUrl || !serviceKey || !apiKey) {
    console.error("[sync-screener-52w-baselines] server_misconfigured");
    return json({ error: "server_misconfigured" }, 500);
  }

  const nowMs = deps.nowMs?.() ?? Date.now();
  const nowIso = deps.nowIso();
  const sb = deps.createClient(supabaseUrl, serviceKey);
  const exceptions = await loadExceptions(sb);
  const window = resolveBaselineWindow(
    nowMs,
    exceptions,
    deps.lookbackCalendarDays ?? BASELINE_LOOKBACK_CALENDAR_DAYS,
  );
  if (!window) {
    console.error("[sync-screener-52w-baselines] period_unresolved");
    return json({ error: "calendar_unavailable" }, 503);
  }

  const published = await loadPublishedState(sb);
  if (
    (published.status === "available" || published.status === "empty") &&
    published.period_end === window.periodEnd &&
    published.current_generation_id
  ) {
    return json({
      ok: true,
      status: "current",
      period_end: window.periodEnd,
      generation_id: published.current_generation_id,
    });
  }

  const holderId = (deps.newHolderId ?? (() => crypto.randomUUID()))();
  const acquired = await sb.rpc(ACQUIRE_RUN_LEASE_RPC, {
    p_holder_id: holderId,
    p_ttl_ms: deps.leaseTtlMs ?? BASELINE_RUN_LEASE_TTL_MS,
  });
  if (acquired.error) {
    console.error("[sync-screener-52w-baselines] persist_failed");
    return json({ error: "persist_failed" }, 500);
  }
  if (acquired.data !== true) {
    return json({
      ok: true,
      status: "busy",
      period_end: window.periodEnd,
    });
  }

  try {
    return await runCatchup(sb, deps, window, apiKey, nowIso, holderId);
  } finally {
    try {
      await sb.rpc(RELEASE_RUN_LEASE_RPC, { p_holder_id: holderId });
    } catch {
      // TTL recovers a crashed holder; do not mask the invocation result.
    }
  }
}

async function renewRunLease(
  sb: DbClient,
  holderId: string,
  ttlMs: number,
): Promise<Response | null> {
  const renewed = await sb.rpc(ACQUIRE_RUN_LEASE_RPC, {
    p_holder_id: holderId,
    p_ttl_ms: ttlMs,
  });
  if (renewed.error) {
    console.error("[sync-screener-52w-baselines] persist_failed");
    return json({ error: "persist_failed" }, 500);
  }
  if (renewed.data !== true) {
    console.error("[sync-screener-52w-baselines] lease_lost");
    return json({ error: "lease_lost" }, 409);
  }
  return null;
}

async function runCatchup(
  sb: DbClient,
  deps: BaselineSyncDeps,
  window: { periodStart: string; periodEnd: string },
  apiKey: string,
  nowIso: string,
  holderId: string,
): Promise<Response> {
  const ttlMs = deps.leaseTtlMs ?? BASELINE_RUN_LEASE_TTL_MS;

  let job = await loadJob(sb);
  const periodMatches = job &&
    job.period_start === window.periodStart &&
    job.period_end === window.periodEnd &&
    job.status === "running";

  if (!periodMatches) {
    const lostBeforeStart = await renewRunLease(sb, holderId, ttlMs);
    if (lostBeforeStart) return lostBeforeStart;
    const generationId = (deps.newGenerationId ?? (() =>
      crypto.randomUUID()))();
    const datesTotal = remainingWeekdays(
      window.periodStart,
      window.periodEnd,
      null,
    ).length;
    const started = await sb.rpc(START_JOB_RPC, {
      p_generation_id: generationId,
      p_period_start: window.periodStart,
      p_period_end: window.periodEnd,
      p_dates_total: datesTotal,
      p_provider_as_of: nowIso,
    });
    if (started.error) {
      console.error("[sync-screener-52w-baselines] persist_failed");
      return json({ error: "persist_failed" }, 500);
    }
    job = asJobSnapshot(started.data);
    if (!job) {
      console.error("[sync-screener-52w-baselines] persist_failed");
      return json({ error: "persist_failed" }, 500);
    }
  }

  if (!job) {
    console.error("[sync-screener-52w-baselines] persist_failed");
    return json({ error: "persist_failed" }, 500);
  }

  const remaining = remainingWeekdays(
    job.period_start,
    job.period_end,
    job.last_applied_date,
  );
  const batchSize = deps.datesPerInvocation ?? BASELINE_DATES_PER_INVOCATION;
  const batch = remaining.slice(0, batchSize);

  for (const date of batch) {
    const lostBeforeDate = await renewRunLease(sb, holderId, ttlMs);
    if (lostBeforeDate) return lostBeforeDate;
    let bars: Map<string, { h: number; l: number }>;
    try {
      bars = await fetchGroupedDay(date, apiKey, deps.fetch);
    } catch (e) {
      if (e instanceof ProviderUnavailableError) {
        console.error("[sync-screener-52w-baselines] provider_unavailable");
        return json({ error: "provider_unavailable" }, 503);
      }
      console.error("[sync-screener-52w-baselines] provider_unavailable");
      return json({ error: "provider_unavailable" }, 503);
    }

    const applied = await sb.rpc(APPLY_DAY_RPC, {
      p_generation_id: job.generation_id,
      p_session_date: date,
      p_bars: barsToPayload(bars),
      p_provider_as_of: nowIso,
    });
    if (applied.error) {
      console.error("[sync-screener-52w-baselines] persist_failed");
      return json({ error: "persist_failed" }, 500);
    }
    const snap = applied.data as {
      last_applied_date?: string;
      dates_applied?: number;
    } | null;
    if (snap && typeof snap.last_applied_date === "string") {
      job.last_applied_date = snap.last_applied_date;
    }
    if (snap && typeof snap.dates_applied === "number") {
      job.dates_applied = snap.dates_applied;
    } else {
      job.dates_applied += 1;
    }
  }

  const done = job.dates_applied >= job.dates_total ||
    remainingWeekdays(job.period_start, job.period_end, job.last_applied_date)
        .length === 0;

  if (!done) {
    return json({
      ok: true,
      status: "running",
      period_end: job.period_end,
      generation_id: job.generation_id,
      dates_applied: job.dates_applied,
      dates_total: job.dates_total,
    });
  }

  const lostBeforeFinalize = await renewRunLease(sb, holderId, ttlMs);
  if (lostBeforeFinalize) return lostBeforeFinalize;

  const finalized = await sb.rpc(FINALIZE_JOB_RPC, {
    p_generation_id: job.generation_id,
    p_min_sessions: deps.minSessions ?? BASELINE_MIN_SESSIONS,
    p_provider_as_of: nowIso,
  });
  if (finalized.error) {
    console.error("[sync-screener-52w-baselines] persist_failed");
    return json({ error: "persist_failed" }, 500);
  }
  const result = finalized.data as FinalizeSnapshot | null;
  return json({
    ok: true,
    status: result?.status ?? "available",
    period_end: job.period_end,
    generation_id: job.generation_id,
    symbol_count: result?.symbol_count ?? 0,
  });
}
