import type { CalendarExceptionRow } from "../../../../supabase/functions/_shared/markets/session-schedule.ts";
import { MonotonicMaxDeque, MonotonicMinDeque } from "./deque.ts";
import { resolveBaselineWindow, weekdayDatesInclusive } from "./dates.ts";
import {
  type DailyCache,
  type FetchLike,
  fillGroupedCache,
  pruneCache,
  symbolsInWindow,
} from "./grouped.ts";
import {
  type BaselineRow,
  type BaselineState,
  emptyState,
  type LoadStateFn,
  publishGeneration,
  type RpcFn,
} from "./persist.ts";

export type BaselineJobDeps = {
  nowMs: () => number;
  fetch: FetchLike;
  polygonApiKey: string;
  rpc: RpcFn;
  loadState: LoadStateFn;
  loadExceptions: () => Promise<CalendarExceptionRow[] | null>;
  minSessions: number;
  lookbackCalendarDays: number;
  cache: DailyCache;
  lastSuccessfulPeriodEnd: string | null;
  newGenerationId?: () => string;
  sleep?: (ms: number) => Promise<void>;
  fetchConcurrency?: number;
  signal?: AbortSignal;
};

export type BaselineJobResult = {
  didRebuild: boolean;
  state: BaselineState;
  errorCode: string | null;
  lastSuccessfulPeriodEnd: string | null;
};

export function createDailyCache(): DailyCache {
  return new Map();
}

export function buildSymbolBaseline(
  symbol: string,
  datesAsc: string[],
  cache: DailyCache,
  periodStart: string,
  periodEnd: string,
  minSessions: number,
  providerAsOf: string,
): BaselineRow | null {
  const maxQ = new MonotonicMaxDeque();
  const minQ = new MonotonicMinDeque();
  let sessions = 0;

  for (const date of datesAsc) {
    if (date < periodStart || date > periodEnd) continue;
    const bar = cache.get(date)?.get(symbol);
    if (!bar) continue;
    sessions += 1;
    maxQ.push(date, bar.h);
    minQ.push(date, bar.l);
    maxQ.expire(periodStart);
    minQ.expire(periodStart);
  }

  if (sessions < minSessions) return null;
  const high = maxQ.front();
  const low = minQ.front();
  if (!high || !low) return null;
  if (!(high.v >= low.v) || !(high.v > 0) || !(low.v > 0)) return null;
  if (!Number.isFinite(high.v) || !Number.isFinite(low.v)) return null;

  return {
    symbol,
    period_start: periodStart,
    period_end: periodEnd,
    high_52w: high.v,
    low_52w: low.v,
    high_candidates: maxQ.toArray(),
    low_candidates: minQ.toArray(),
    sessions_observed: sessions,
    provider_as_of: providerAsOf,
  };
}

export function buildBaselineRows(
  cache: DailyCache,
  periodStart: string,
  periodEnd: string,
  minSessions: number,
  providerAsOf: string,
): BaselineRow[] {
  const dates = weekdayDatesInclusive(periodStart, periodEnd);
  const rows: BaselineRow[] = [];
  for (const symbol of symbolsInWindow(cache, dates)) {
    const row = buildSymbolBaseline(
      symbol,
      dates,
      cache,
      periodStart,
      periodEnd,
      minSessions,
      providerAsOf,
    );
    if (row) rows.push(row);
  }
  return rows;
}

export async function runBaselineJob(
  deps: BaselineJobDeps,
): Promise<BaselineJobResult> {
  let prior = emptyState();
  try {
    const loaded = await deps.loadState();
    if (loaded) prior = loaded;
  } catch {
    prior = emptyState();
  }

  let exceptions: CalendarExceptionRow[] | null = null;
  try {
    exceptions = await deps.loadExceptions();
  } catch {
    exceptions = null;
  }

  const nowMs = deps.nowMs();
  const window = resolveBaselineWindow(
    nowMs,
    exceptions,
    deps.lookbackCalendarDays,
  );
  if (!window) {
    return {
      didRebuild: false,
      state: prior,
      errorCode: "period_unresolved",
      lastSuccessfulPeriodEnd: deps.lastSuccessfulPeriodEnd,
    };
  }

  const hasGeneration = prior.current_generation_id != null;
  if (
    hasGeneration &&
    deps.lastSuccessfulPeriodEnd === window.periodEnd
  ) {
    return {
      didRebuild: false,
      state: prior,
      errorCode: null,
      lastSuccessfulPeriodEnd: deps.lastSuccessfulPeriodEnd,
    };
  }

  const dates = weekdayDatesInclusive(window.periodStart, window.periodEnd);
  try {
    await fillGroupedCache(dates, deps.cache, {
      fetch: deps.fetch,
      apiKey: deps.polygonApiKey,
      concurrency: deps.fetchConcurrency,
      signal: deps.signal,
      sleep: deps.sleep,
    });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error &&
        typeof (error as { code: unknown }).code === "string"
      ? (error as { code: string }).code
      : "provider_unavailable";
    return {
      didRebuild: false,
      state: prior,
      errorCode: code === "provider_response_invalid"
        ? "provider_response_invalid"
        : "provider_unavailable",
      lastSuccessfulPeriodEnd: deps.lastSuccessfulPeriodEnd,
    };
  }

  pruneCache(deps.cache, window.periodStart, window.periodEnd);
  const providerAsOf = new Date(nowMs).toISOString();
  const rows = buildBaselineRows(
    deps.cache,
    window.periodStart,
    window.periodEnd,
    deps.minSessions,
    providerAsOf,
  );
  const generationId = (deps.newGenerationId ?? (() => crypto.randomUUID()))();
  const published = await publishGeneration(deps.rpc, {
    generationId,
    rows,
    periodStart: window.periodStart,
    periodEnd: window.periodEnd,
    providerAsOf,
  });

  if (!published.ok) {
    return {
      didRebuild: false,
      state: prior,
      errorCode: published.code,
      lastSuccessfulPeriodEnd: deps.lastSuccessfulPeriodEnd,
    };
  }

  return {
    didRebuild: true,
    state: published.state,
    errorCode: null,
    lastSuccessfulPeriodEnd: window.periodEnd,
  };
}
