import type { CalendarExceptionRow } from "../../../../supabase/functions/_shared/markets/session-schedule.ts";
import { MonotonicMaxDeque, MonotonicMinDeque } from "./deque.ts";
import { resolveBaselineWindow, weekdayDatesInclusive } from "./dates.ts";
import { createBaselineFold } from "./fold.ts";
import {
  type DailyCache,
  type FetchLike,
  fillGroupedCache,
  GROUPED_FETCH_CONCURRENCY,
  symbolsInWindow,
} from "./grouped.ts";
import {
  type BaselineExclusionPayload,
  type BaselineRow,
  type BaselineState,
  emptyState,
  hasCompletePolicyExclusionEvidence,
  type LoadStateFn,
  publishGenerationStaged,
  type StagedPublishClient,
} from "./persist.ts";

export type BaselineJobDeps = {
  nowMs: () => number;
  fetch: FetchLike;
  polygonApiKey: string;
  publish: StagedPublishClient;
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

export type SymbolBaselineBuild =
  | { kind: "row"; row: BaselineRow }
  | { kind: "exclusion"; exclusion: BaselineExclusionPayload };

export function buildSymbolBaseline(
  symbol: string,
  datesAsc: string[],
  cache: DailyCache,
  periodStart: string,
  periodEnd: string,
  minSessions: number,
  providerAsOf: string,
): SymbolBaselineBuild | null {
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

  if (sessions < 1) return null;
  if (sessions < minSessions) {
    return {
      kind: "exclusion",
      exclusion: {
        symbol,
        reason: "insufficient_sessions",
        sessions_observed: sessions,
        min_sessions: minSessions,
      },
    };
  }
  const high = maxQ.front();
  const low = minQ.front();
  if (!high || !low) return null;
  if (!(high.v >= low.v) || !(high.v > 0) || !(low.v > 0)) return null;
  if (!Number.isFinite(high.v) || !Number.isFinite(low.v)) return null;

  return {
    kind: "row",
    row: {
      symbol,
      period_start: periodStart,
      period_end: periodEnd,
      high_52w: high.v,
      low_52w: low.v,
      high_candidates: maxQ.toArray(),
      low_candidates: minQ.toArray(),
      sessions_observed: sessions,
      provider_as_of: providerAsOf,
    },
  };
}

export function buildBaselinePublication(
  cache: DailyCache,
  periodStart: string,
  periodEnd: string,
  minSessions: number,
  providerAsOf: string,
): { rows: BaselineRow[]; exclusions: BaselineExclusionPayload[] } {
  const dates = weekdayDatesInclusive(periodStart, periodEnd);
  const rows: BaselineRow[] = [];
  const exclusions: BaselineExclusionPayload[] = [];
  for (const symbol of symbolsInWindow(cache, dates)) {
    const built = buildSymbolBaseline(
      symbol,
      dates,
      cache,
      periodStart,
      periodEnd,
      minSessions,
      providerAsOf,
    );
    if (built?.kind === "row") rows.push(built.row);
    else if (built?.kind === "exclusion") exclusions.push(built.exclusion);
  }
  return { rows, exclusions };
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
    deps.lastSuccessfulPeriodEnd === window.periodEnd &&
    hasCompletePolicyExclusionEvidence(prior, deps.minSessions)
  ) {
    return {
      didRebuild: false,
      state: prior,
      errorCode: null,
      lastSuccessfulPeriodEnd: deps.lastSuccessfulPeriodEnd,
    };
  }

  const dates = weekdayDatesInclusive(window.periodStart, window.periodEnd);
  const fold = createBaselineFold(
    window.periodStart,
    window.periodEnd,
    deps.minSessions,
    dates,
  );
  const concurrency = Math.max(
    1,
    deps.fetchConcurrency ?? GROUPED_FETCH_CONCURRENCY,
  );
  try {
    for (let i = 0; i < dates.length; i += concurrency) {
      const batch = dates.slice(i, i + concurrency);
      await fillGroupedCache(batch, deps.cache, {
        fetch: deps.fetch,
        apiKey: deps.polygonApiKey,
        concurrency,
        signal: deps.signal,
        sleep: deps.sleep,
      });
      for (const date of batch) {
        const day = deps.cache.get(date);
        if (day) fold.addDay(date, day);
        deps.cache.delete(date);
      }
    }
  } catch (error) {
    deps.cache.clear();
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

  deps.cache.clear();
  const providerAsOf = new Date(nowMs).toISOString();
  const folded = fold.finish(providerAsOf);
  const generationId = (deps.newGenerationId ?? (() => crypto.randomUUID()))();
  const published = await publishGenerationStaged(deps.publish, {
    generationId,
    rows: folded.rows,
    exclusions: folded.exclusions,
    minSessions: deps.minSessions,
    periodStart: window.periodStart,
    periodEnd: window.periodEnd,
    providerAsOf,
    writeVolumeHistory: (write) => folded.writeVolumeHistory(write),
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
