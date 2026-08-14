import type { CalendarExceptionRow } from "../../../../supabase/functions/_shared/markets/session-schedule.ts";
import {
  easternParts,
  resolveScheduleAt,
  sessionKindAtMsOfDay,
} from "../../../../supabase/functions/_shared/markets/session-schedule.ts";
import {
  type RadarV22ArchiveRow,
  type RadarV22BoardRow,
  type RadarV22FeedStatus,
  signalStatusForLifecycle,
} from "../../../../supabase/functions/_shared/radar-v22/types.ts";
import { activePass, createRadarBook, detectPass } from "./bars.ts";
import type { RadarV22Config } from "./config.ts";
import { isoFromMs } from "./time.ts";
import {
  emptyLifecycle,
  isBoardLifecycle,
  stepLifecycle,
} from "./lifecycle.ts";
import { rankBoard } from "./rank.ts";
import type {
  EligibleQuote,
  EngineCounters,
  IngestResult,
  LifecycleRecord,
  RankedCandidate,
} from "./types.ts";

export type FrozenBoard = {
  rows: RadarV22BoardRow[];
  status: RadarV22FeedStatus;
  sessionDate: string;
  generationId: string | null;
  providerAsOfMin: string | null;
  providerAsOfMax: string | null;
  lastProviderEventAt: string | null;
  feedStale: boolean;
  archives: RadarV22ArchiveRow[];
};

export type EvaluateResult = {
  published: boolean;
  staleTransition: boolean;
  sessionReset: boolean;
  board: FrozenBoard;
  counters: EngineCounters;
};

function cloneBoard(board: FrozenBoard): FrozenBoard {
  return {
    rows: board.rows.map((row) => ({ ...row })),
    status: board.status,
    sessionDate: board.sessionDate,
    generationId: board.generationId,
    providerAsOfMin: board.providerAsOfMin,
    providerAsOfMax: board.providerAsOfMax,
    lastProviderEventAt: board.lastProviderEventAt,
    feedStale: board.feedStale,
    archives: board.archives.map((row) => ({ ...row })),
  };
}

function emptyBoard(sessionDate: string, nowIso: string): FrozenBoard {
  return {
    rows: [],
    status: "empty",
    sessionDate,
    generationId: null,
    providerAsOfMin: null,
    providerAsOfMax: null,
    lastProviderEventAt: null,
    feedStale: false,
    archives: [],
  };
}

export type RadarEngine = {
  setUniverse(quotes: Map<string, EligibleQuote>): void;
  setExceptions(exceptions: CalendarExceptionRow[] | null): void;
  ingest(raw: unknown, receiveMs: number): IngestResult;
  evaluate(wallNowMs: number, generationId: string): EvaluateResult;
  snapshot(): FrozenBoard;
  counters(): EngineCounters;
  eventNowMs(): number | null;
  lastReceiveMs(): number | null;
  inRegularSession(wallNowMs: number): boolean;
  incrementReconnect(): void;
};

export function createRadarEngine(opts: {
  config: RadarV22Config;
  exceptions?: CalendarExceptionRow[] | null;
}): RadarEngine {
  const { config } = opts;
  const book = createRadarBook(config);
  const lifecycles = new Map<string, LifecycleRecord>();
  let universe = new Map<string, EligibleQuote>();
  let exceptions: CalendarExceptionRow[] | null = opts.exceptions ?? [];
  let lastEventEndMs: number | null = null;
  let lastReceiveMs: number | null = null;
  let lastSessionDate: string | null = null;
  let frozen: FrozenBoard | null = null;
  let feedStale = false;
  const counters: EngineCounters = {
    correctionCount: 0,
    duplicateCount: 0,
    outOfOrderCount: 0,
    reconnectCount: 0,
  };

  function sessionDateAt(ms: number): string | null {
    return easternParts(ms)?.date ?? null;
  }

  function regularAt(ms: number): boolean {
    const schedule = resolveScheduleAt(ms, exceptions);
    if (!schedule || schedule.marketStatus === "closed") return false;
    const parts = easternParts(ms);
    if (!parts) return false;
    return sessionKindAtMsOfDay(parts.msOfDay, schedule) === "market";
  }

  function trackedSet(): Set<string> {
    const tracked = new Set<string>(universe.keys());
    for (const [symbol, rec] of lifecycles) {
      if (rec.phase !== "WATCHING") tracked.add(symbol);
    }
    return tracked;
  }

  function markStale(wallNowMs: number): EvaluateResult {
    feedStale = true;
    const sessionDate = sessionDateAt(wallNowMs) ?? lastSessionDate ?? "";
    if (!frozen) {
      frozen = emptyBoard(
        sessionDate,
        isoFromMs(wallNowMs) ?? new Date(wallNowMs).toISOString(),
      );
    }
    frozen = {
      ...cloneBoard(frozen),
      status: frozen.rows.length > 0 ? "stale" : frozen.status,
      feedStale: true,
      lastProviderEventAt: lastEventEndMs !== null
        ? isoFromMs(lastEventEndMs)
        : frozen.lastProviderEventAt,
    };
    if (frozen.rows.length > 0) {
      frozen.rows = frozen.rows.map((row) => ({
        ...row,
        signal_status: "STALE",
      }));
    }
    return {
      published: true,
      staleTransition: true,
      sessionReset: false,
      board: cloneBoard(frozen),
      counters: { ...counters },
    };
  }

  return {
    setUniverse(quotes) {
      universe = new Map(quotes);
      const tracked = trackedSet();
      for (const symbol of book.trackedSymbols()) {
        if (!tracked.has(symbol)) book.dropSymbol(symbol);
      }
    },
    setExceptions(next) {
      exceptions = next;
    },
    ingest(raw, receiveMs): IngestResult {
      const result = book.ingest(raw, receiveMs, trackedSet());
      if (!result.accepted) return result;
      lastReceiveMs = receiveMs;
      if (lastEventEndMs === null || result.endMs > lastEventEndMs) {
        lastEventEndMs = result.endMs;
      }
      if (result.kind === "duplicate") counters.duplicateCount += 1;
      if (result.kind === "correction" || result.kind === "late_correction") {
        counters.correctionCount += 1;
      }
      if (result.kind === "out_of_order") counters.outOfOrderCount += 1;
      return result;
    },
    evaluate(wallNowMs, generationId): EvaluateResult {
      const sessionDate = sessionDateAt(wallNowMs);
      if (!sessionDate) {
        return {
          published: false,
          staleTransition: false,
          sessionReset: false,
          board: frozen ?? emptyBoard("", isoFromMs(wallNowMs) ?? ""),
          counters: { ...counters },
        };
      }

      const inSession = regularAt(wallNowMs);
      const sessionChanged = lastSessionDate !== null &&
        lastSessionDate !== sessionDate;
      if (sessionChanged) {
        book.clearSession();
        lifecycles.clear();
        lastEventEndMs = null;
        lastReceiveMs = null;
        feedStale = false;
        lastSessionDate = sessionDate;
        frozen = {
          ...emptyBoard(sessionDate, isoFromMs(wallNowMs) ?? ""),
          generationId,
        };
        return {
          published: true,
          staleTransition: false,
          sessionReset: true,
          board: cloneBoard(frozen),
          counters: { ...counters },
        };
      }
      lastSessionDate = sessionDate;

      if (!inSession) {
        feedStale = false;
        const board = frozen ??
          emptyBoard(sessionDate, isoFromMs(wallNowMs) ?? "");
        return {
          published: false,
          staleTransition: false,
          sessionReset: false,
          board: cloneBoard(board),
          counters: { ...counters },
        };
      }

      if (
        lastReceiveMs !== null &&
        wallNowMs - lastReceiveMs >= config.globalFeedStaleMs
      ) {
        if (feedStale) {
          const board = frozen ??
            emptyBoard(sessionDate, isoFromMs(wallNowMs) ?? "");
          return {
            published: false,
            staleTransition: false,
            sessionReset: false,
            board: cloneBoard(board),
            counters: { ...counters },
          };
        }
        return markStale(wallNowMs);
      }
      if (lastReceiveMs === null) {
        const board = frozen ??
          emptyBoard(sessionDate, isoFromMs(wallNowMs) ?? "");
        return {
          published: false,
          staleTransition: false,
          sessionReset: false,
          board: cloneBoard(board),
          counters: { ...counters },
        };
      }

      if (feedStale) {
        feedStale = false;
      }

      const eventNow = lastEventEndMs ?? wallNowMs;
      const candidates: RankedCandidate[] = [];
      const archives: RadarV22ArchiveRow[] = [];
      const symbols = trackedSet();
      const updatedAt = isoFromMs(wallNowMs) ??
        new Date(wallNowMs).toISOString();

      for (const symbol of symbols) {
        const quote = universe.get(symbol) ?? null;
        const eligible = quote !== null;
        const metrics = book.metrics(symbol, eventNow, quote);
        if (!metrics) continue;
        const detect = detectPass(eligible, metrics, config);
        const active = activePass(eligible, metrics, config);
        const prev = lifecycles.get(symbol) ?? emptyLifecycle(sessionDate);
        const lateBlocks = metrics.lateCorrectionInWindows &&
          (prev.phase === "WATCHING" || prev.phase === "ARCHIVED" ||
            prev.phase === "COOLING");
        const stepped = stepLifecycle(prev, {
          sessionDate,
          eventNowMs: eventNow,
          wallNowMs,
          detect,
          active,
          metrics,
          lateBlocksNewSignal: lateBlocks,
          config,
        });
        lifecycles.set(symbol, stepped.record);

        if (stepped.archived || stepped.record.phase === "ARCHIVED") {
          archives.push({
            session_date: sessionDate,
            symbol,
            lifecycle: "ARCHIVED",
            archived_at: updatedAt,
            generation_id: generationId,
            rolling_volume_60s: metrics.vol60s,
            rolling_volume_15s: metrics.vol15s,
            session_volume: metrics.sessionVolume,
            peak_volume_15s: stepped.record.peakVol15WhileActive,
            provider_as_of: metrics.lastBarEndMs !== null
              ? isoFromMs(metrics.lastBarEndMs)
              : null,
          });
        }

        if (!isBoardLifecycle(stepped.record.phase)) continue;
        const lastPrice = metrics.lastPrice;
        if (lastPrice === null || !(lastPrice > 0)) continue;
        const sessionVolume = Math.max(
          metrics.sessionVolume,
          quote?.dayVolume ?? 0,
        );
        if (!(sessionVolume > 0)) continue;
        const priorVolume = quote?.priorVolume ?? 0;
        if (!(priorVolume > 0)) continue;
        const changePercent = quote
          ? ((lastPrice - quote.previousClose) / quote.previousClose) * 100
          : 0;
        const dayHigh = metrics.sessionHigh ?? quote?.dayHigh ?? lastPrice;
        const dayLow = metrics.sessionLow ?? quote?.dayLow ?? lastPrice;
        if (!(dayHigh > 0) || !(dayLow > 0) || dayLow > dayHigh) continue;
        const ratio = Math.round((sessionVolume / priorVolume) * 10) / 10;
        if (!(ratio > 0)) continue;
        const providerAsOfMs = metrics.lastBarEndMs ?? eventNow;
        candidates.push({
          symbol,
          lifecycle: stepped.record.phase,
          vol5s: metrics.vol5s,
          vol15s: metrics.vol15s,
          vol60s: metrics.vol60s,
          dollarVol60s: metrics.dollarVol60s,
          sessionVolume,
          acceleration5m: metrics.acceleration5m,
          lastPrice,
          changePercent,
          priorVolume,
          volumeRatio: ratio,
          dayHigh,
          dayLow,
          sessionVwap: metrics.sessionVwap,
          peakVol15: stepped.record.peakVol15WhileActive > 0
            ? stepped.record.peakVol15WhileActive
            : null,
          companyName: quote?.companyName ?? null,
          providerAsOfMs,
        });
      }

      const ranked = rankBoard(candidates, config);
      const providerTimes = ranked.map((row) => row.providerAsOfMs);
      const providerMin = providerTimes.length > 0
        ? isoFromMs(Math.min(...providerTimes))
        : null;
      const providerMax = providerTimes.length > 0
        ? isoFromMs(Math.max(...providerTimes))
        : null;
      const lastEventIso = lastEventEndMs !== null
        ? isoFromMs(lastEventEndMs)
        : null;
      const rows: RadarV22BoardRow[] = ranked.map((row, index) => ({
        generation_id: generationId,
        rank: index + 1,
        symbol: row.symbol,
        company_name: row.companyName,
        lifecycle: row.lifecycle,
        signal_status: signalStatusForLifecycle(row.lifecycle, false),
        price: row.lastPrice,
        change_percent: row.changePercent,
        volume: row.sessionVolume,
        prior_session_volume: row.priorVolume,
        volume_ratio_prior_session: row.volumeRatio,
        day_high: row.dayHigh,
        day_low: row.dayLow,
        rolling_volume_5s: row.vol5s,
        rolling_volume_15s: row.vol15s,
        rolling_volume_60s: row.vol60s,
        rolling_dollar_volume_60s: row.dollarVol60s,
        acceleration_5m: row.acceleration5m,
        session_vwap: row.sessionVwap,
        peak_volume_15s: row.peakVol15,
        provider_as_of: isoFromMs(row.providerAsOfMs) ?? updatedAt,
        updated_at: updatedAt,
      }));

      frozen = {
        rows,
        status: rows.length > 0 ? "available" : "empty",
        sessionDate,
        generationId,
        providerAsOfMin: providerMin,
        providerAsOfMax: providerMax,
        lastProviderEventAt: lastEventIso,
        feedStale: false,
        archives,
      };
      return {
        published: true,
        staleTransition: false,
        sessionReset: false,
        board: cloneBoard(frozen),
        counters: { ...counters },
      };
    },
    snapshot() {
      const sessionDate = lastSessionDate ?? "";
      return cloneBoard(
        frozen ?? emptyBoard(sessionDate, new Date().toISOString()),
      );
    },
    counters() {
      return { ...counters };
    },
    eventNowMs() {
      return lastEventEndMs;
    },
    lastReceiveMs() {
      return lastReceiveMs;
    },
    inRegularSession(wallNowMs) {
      return regularAt(wallNowMs);
    },
    incrementReconnect() {
      counters.reconnectCount += 1;
    },
  };
}
