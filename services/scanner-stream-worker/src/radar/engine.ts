import type {
  CalendarExceptionRow,
  SessionKind,
} from "../../../../supabase/functions/_shared/markets/session-schedule.ts";
import {
  easternParts,
  isWithinRegularSession,
  resolveScheduleAt,
} from "../../../../supabase/functions/_shared/markets/session-schedule.ts";
import {
  inclusiveSessionKindAt,
  isLiveSurveillanceKind,
  radarSessionKindAt,
  shouldHardResetSurveillance,
  softTransitionOf,
  surveillanceDateAt,
  type SessionTransition,
} from "./session.ts";
import {
  type RadarV22ArchiveRow,
  type RadarV22BoardRow,
  type RadarV22FeedStatus,
  signalStatusForLifecycle,
} from "../../../../supabase/functions/_shared/radar-v22/types.ts";
import { activePass, createRadarBook, detectPass } from "./bars.ts";
import type { RadarV22Config } from "./config.ts";
import { parseAggregateEvent } from "./parse.ts";
import { isoFromMs } from "./time.ts";
import {
  createMarketSentinel,
  evaluatePromotion,
  promotionCapOf,
} from "./sentinel.ts";
import {
  createSessionIntelBook,
  type SessionIntelSnapshot,
} from "./geometry.ts";
import {
  emptyLifecycle,
  isBoardLifecycle,
  stepLifecycle,
} from "./lifecycle.ts";
import { rankBoard } from "./rank.ts";
import {
  mapCandidateRow,
  type PersistenceV2View,
} from "./persist_v2.ts";
import type {
  RadarV22CandidateRow,
} from "../../../../supabase/functions/_shared/radar-v22/persistence-v2.ts";
import { isRadarV22SessionKind } from "../../../../supabase/functions/_shared/radar-v22/persistence-v2.ts";
import type {
  EligibleQuote,
  EngineCounters,
  IngestResult,
  LifecycleRecord,
  RankedCandidate,
  SentinelStats,
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
  sessionKind: SessionKind;
  surveillanceDate: string;
  sessionTransition: SessionTransition | null;
  liveSurveillance: boolean;
  /**
   * When true, persistence must write an empty generation (status empty)
   * even if `board` still holds an in-memory PM/AH ranking. The existing
   * Top-20 RPC has no session-kind field and cannot honestly represent
   * extended-hours rows.
   */
  persistEmpty: boolean;
  /** Increments on PM→RTH and RTH→AH so Sprint 3 can reset session HOD/VWAP. */
  subsessionEpoch: number;
  /** In-memory Persistence V2 snapshot. Not written unless the V2 flag is on. */
  persistenceV2: PersistenceV2View;
};

export function persistableGeneration(result: EvaluateResult): {
  rows: FrozenBoard["rows"];
  archives: FrozenBoard["archives"];
  status: FrozenBoard["status"];
  sessionDate: string;
} {
  if (!result.published || result.persistEmpty) {
    return {
      rows: [],
      archives: [],
      status: "empty",
      sessionDate: result.board.sessionDate,
    };
  }
  return {
    rows: result.board.rows,
    archives: result.board.archives,
    status: result.board.status,
    sessionDate: result.board.sessionDate,
  };
}

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
  sentinelStats(): SentinelStats;
  hasSentinel(symbol: string): boolean;
  isPromoted(symbol: string): boolean;
  hasRadarBook(symbol: string): boolean;
  bookBarCount(symbol: string): number;
  sessionIntel(symbol: string): SessionIntelSnapshot | null;
};

function rssBytes(): number | null {
  try {
    const mem = Deno.memoryUsage?.();
    return mem && typeof mem.rss === "number" ? mem.rss : null;
  } catch {
    return null;
  }
}

export function createRadarEngine(opts: {
  config: RadarV22Config;
  exceptions?: CalendarExceptionRow[] | null;
}): RadarEngine {
  const { config } = opts;
  const book = createRadarBook(config);
  const sentinel = createMarketSentinel(config);
  const intel = createSessionIntelBook(config);
  const promoted = new Set<string>();
  const promotedAtMs = new Map<string, number>();
  const lifecycles = new Map<string, LifecycleRecord>();
  let universe = new Map<string, EligibleQuote>();
  let exceptions: CalendarExceptionRow[] | null = opts.exceptions ?? [];
  let lastEventEndMs: number | null = null;
  let lastReceiveMs: number | null = null;
  let lastSessionDate: string | null = null;
  let lastSurveillanceDate: string | null = null;
  let lastSessionKind: SessionKind | null = null;
  let subsessionEpoch = 0;
  let lastPersistWasEmpty = false;
  let lastV2Candidates: RadarV22CandidateRow[] = [];
  let lastV2Archived: Array<{ symbol: string; eventAt: string }> = [];
  let frozen: FrozenBoard | null = null;
  let feedStale = false;
  const counters: EngineCounters = {
    correctionCount: 0,
    duplicateCount: 0,
    outOfOrderCount: 0,
    reconnectCount: 0,
  };
  let sentinelEvictions = 0;
  let promotionsTotal = 0;
  let demotionsTotal = 0;
  let capRejections = 0;
  const promotionCap = promotionCapOf(config);

  function sessionDateAt(ms: number): string | null {
    return easternParts(ms)?.date ?? null;
  }

  function regularAt(ms: number): boolean {
    const schedule = resolveScheduleAt(ms, exceptions);
    if (!schedule || schedule.marketStatus === "closed") return false;
    const parts = easternParts(ms);
    if (!parts) return false;
    return isWithinRegularSession(parts.msOfDay, schedule);
  }

  function packResult(opts: {
    published: boolean;
    staleTransition?: boolean;
    sessionReset?: boolean;
    board: FrozenBoard;
    sessionKind: SessionKind;
    surveillanceDate: string;
    sessionTransition?: SessionTransition | null;
    liveSurveillance: boolean;
    persistEmpty?: boolean;
    clearV2?: boolean;
  }): EvaluateResult {
    if (opts.clearV2) {
      lastV2Candidates = [];
      lastV2Archived = [];
    }
    const sessionKind = isRadarV22SessionKind(opts.sessionKind)
      ? opts.sessionKind
      : "closed";
    return {
      published: opts.published,
      staleTransition: opts.staleTransition ?? false,
      sessionReset: opts.sessionReset ?? false,
      board: cloneBoard(opts.board),
      counters: { ...counters },
      sessionKind: opts.sessionKind,
      surveillanceDate: opts.surveillanceDate,
      sessionTransition: opts.sessionTransition ?? null,
      liveSurveillance: opts.liveSurveillance,
      persistEmpty: opts.persistEmpty ?? false,
      subsessionEpoch,
      persistenceV2: {
        tradingDate: opts.surveillanceDate,
        sessionKind,
        liveSurveillance: opts.liveSurveillance,
        sessionTransition: opts.sessionTransition ?? null,
        sentinelEnabled: config.sentinelEnabled,
        feedStale: opts.board.feedStale,
        lastReceiveAt: lastReceiveMs !== null
          ? isoFromMs(lastReceiveMs)
          : null,
        lastProviderEventAt: opts.board.lastProviderEventAt,
        candidates: lastV2Candidates.map((row) => ({ ...row })),
        archived: lastV2Archived.map((row) => ({ ...row })),
      },
    };
  }

  /**
   * 04:00 HARD RESET of transient Radar market state.
   * Clears: Sentinel rings, promoted identity, Stage-2 RadarBook, lifecycles,
   *         lastEventEndMs, lastReceiveMs, feedStale, frozen board, subsessionEpoch.
   * Preserves: snapshot universe (prev close / prior volume), exceptions, config,
   *            operational counters (reconnect/correction/duplicate).
   */
  function hardResetTransientMarketState(): void {
    book.clearSession();
    sentinel.clear();
    intel.clear();
    promoted.clear();
    promotedAtMs.clear();
    lifecycles.clear();
    lastEventEndMs = null;
    lastReceiveMs = null;
    feedStale = false;
    subsessionEpoch = 0;
    lastV2Candidates = [];
    lastV2Archived = [];
  }

  function trackedSet(): Set<string> {
    if (config.sentinelEnabled) {
      return new Set(promoted);
    }
    const tracked = new Set<string>(universe.keys());
    for (const [symbol, rec] of lifecycles) {
      if (rec.phase !== "WATCHING") tracked.add(symbol);
    }
    return tracked;
  }

  function noteReceive(endMs: number, receiveMs: number): void {
    lastReceiveMs = receiveMs;
    if (lastEventEndMs === null || endMs > lastEventEndMs) {
      lastEventEndMs = endMs;
    }
  }

  function noteKind(kind: string): void {
    if (kind === "duplicate") counters.duplicateCount += 1;
    if (kind === "correction" || kind === "late_correction") {
      counters.correctionCount += 1;
    }
    if (kind === "out_of_order") counters.outOfOrderCount += 1;
  }

  function demote(symbol: string): boolean {
    if (!promoted.has(symbol) && !book.trackedSymbols().includes(symbol)) {
      return false;
    }
    promoted.delete(symbol);
    promotedAtMs.delete(symbol);
    book.dropSymbol(symbol);
    intel.drop(symbol);
    lifecycles.delete(symbol);
    demotionsTotal += 1;
    return true;
  }

  function tryPromote(symbol: string): boolean {
    if (promoted.has(symbol)) return true;
    const metrics = sentinel.metrics(symbol);
    if (!metrics) return false;
    const decision = evaluatePromotion(metrics, config);
    if (!decision.promote) return false;
    if (promoted.size >= promotionCap) {
      capRejections += 1;
      return false;
    }
    promoted.add(symbol);
    promotedAtMs.set(symbol, metrics.lastEndMs);
    promotionsTotal += 1;
    return true;
  }

  function sweepStage2(eventNowMs: number): void {
    for (const symbol of [...promoted]) {
      const rec = lifecycles.get(symbol);
      if (rec?.phase === "ARCHIVED") {
        demote(symbol);
        continue;
      }
      const metrics = book.metrics(symbol, eventNowMs, null);
      const lastEnd = metrics?.lastBarEndMs ?? null;
      if (lastEnd !== null && eventNowMs - lastEnd >= config.sentinelTtlMs) {
        demote(symbol);
        continue;
      }
      if ((metrics?.barCount ?? 0) === 0) {
        const at = promotedAtMs.get(symbol) ?? eventNowMs;
        if (eventNowMs - at >= config.sentinelTtlMs) demote(symbol);
      }
    }
  }

  function snapshotSentinelStats(): SentinelStats {
    return {
      enabled: config.sentinelEnabled,
      live: sentinel.liveCount(),
      promoted: promoted.size,
      cap: promotionCap,
      evictions: sentinelEvictions,
      promotionsTotal,
      demotionsTotal,
      capRejections,
      rssBytes: rssBytes(),
    };
  }

  function markStale(wallNowMs: number): EvaluateResult {
    feedStale = true;
    const sessionDate = (config.sentinelEnabled
      ? surveillanceDateAt(wallNowMs)
      : sessionDateAt(wallNowMs)) ?? lastSessionDate ?? "";
    const kind = radarSessionKindAt(wallNowMs, exceptions);
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
    return packResult({
      published: true,
      staleTransition: true,
      sessionReset: false,
      board: frozen,
      sessionKind: kind,
      surveillanceDate: sessionDate,
      liveSurveillance: config.sentinelEnabled
        ? isLiveSurveillanceKind(kind)
        : regularAt(wallNowMs),
    });
  }

  function rankLiveBoard(
    wallNowMs: number,
    generationId: string,
    boardDate: string,
  ): void {
    const eventNow = lastEventEndMs ?? wallNowMs;
    if (config.sentinelEnabled) {
      sentinelEvictions += sentinel.evict(
        eventNow,
        config.sentinelTtlMs,
        promoted,
      );
      sweepStage2(eventNow);
      for (const symbol of sentinel.takeDirty()) {
        tryPromote(symbol);
      }
    }

    const candidates: RankedCandidate[] = [];
    const archives: RadarV22ArchiveRow[] = [];
    const v2Rows: RadarV22CandidateRow[] = [];
    const v2Archived: Array<{ symbol: string; eventAt: string }> = [];
    const symbols = trackedSet();
    const updatedAt = isoFromMs(wallNowMs) ??
      new Date(wallNowMs).toISOString();

    for (const symbol of symbols) {
      const quote = universe.get(symbol) ?? null;
      const eligible = config.sentinelEnabled ? true : quote !== null;
      const metrics = book.metrics(symbol, eventNow, quote);
      if (!metrics) continue;
      const detect = detectPass(eligible, metrics, config);
      const active = activePass(eligible, metrics, config);
      intel.applyFreshnessHints(symbol, eventNow, {
        vol5s: metrics.vol5s,
        vol15s: metrics.vol15s,
        vol60s: metrics.vol60s,
        move15s: metrics.move15s,
        move60s: metrics.move60s,
        acceleration5m: metrics.acceleration5m,
      });
      const intelSnap = intel.get(symbol, eventNow);
      const prev = lifecycles.get(symbol) ?? emptyLifecycle(boardDate);
      const lateBlocks = metrics.lateCorrectionInWindows &&
        (prev.phase === "WATCHING" || prev.phase === "ARCHIVED" ||
          prev.phase === "COOLING");
      const stepped = stepLifecycle(prev, {
        sessionDate: boardDate,
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
          session_date: boardDate,
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
        const archivedAt = stepped.record.phaseEnteredAtMs !== null
          ? isoFromMs(stepped.record.phaseEnteredAtMs)
          : updatedAt;
        if (archivedAt) {
          v2Archived.push({ symbol, eventAt: archivedAt });
        }
      } else if (
        isRadarV22SessionKind(lastSessionKind) &&
        v2Rows.length < 200
      ) {
        v2Rows.push(mapCandidateRow({
          generationId,
          tradingDate: boardDate,
          sessionKind: lastSessionKind,
          symbol,
          lifecycle: stepped.record.phase,
          metrics,
          intel: intelSnap,
          promotedAtMs: promotedAtMs.get(symbol) ?? null,
          phaseEnteredAtMs: stepped.record.phaseEnteredAtMs,
          updatedAt,
          isoFromMs,
        }));
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
        freshnessAgeMs: intelSnap?.freshnessAgeMs ?? null,
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
      sessionDate: boardDate,
      generationId,
      providerAsOfMin: providerMin,
      providerAsOfMax: providerMax,
      lastProviderEventAt: lastEventIso,
      feedStale: false,
      archives,
    };
    lastV2Candidates = v2Rows;
    lastV2Archived = v2Archived;
    if (config.sentinelEnabled) {
      sweepStage2(eventNow);
    }
  }

  function tapeGate(
    wallNowMs: number,
    boardDate: string,
    kind: SessionKind,
    surveillanceDate: string,
    liveSurveillance: boolean,
  ): EvaluateResult | "rank" {
    if (
      lastReceiveMs !== null &&
      wallNowMs - lastReceiveMs >= config.globalFeedStaleMs
    ) {
      if (feedStale) {
        const board = frozen ??
          emptyBoard(boardDate, isoFromMs(wallNowMs) ?? "");
        return packResult({
          published: false,
          board,
          sessionKind: kind,
          surveillanceDate,
          liveSurveillance,
        });
      }
      return markStale(wallNowMs);
    }
    if (lastReceiveMs === null) {
      const board = frozen ??
        emptyBoard(boardDate, isoFromMs(wallNowMs) ?? "");
      return packResult({
        published: false,
        board,
        sessionKind: kind,
        surveillanceDate,
        liveSurveillance,
      });
    }
    if (feedStale) feedStale = false;
    return "rank";
  }

  function evaluateLegacy(
    wallNowMs: number,
    generationId: string,
    calendarDate: string,
    kind: SessionKind,
    surveillanceDate: string,
  ): EvaluateResult {
    const inSession = regularAt(wallNowMs);
    const sessionChanged = lastSessionDate !== null &&
      lastSessionDate !== calendarDate;
    if (sessionChanged) {
      hardResetTransientMarketState();
      lastSessionDate = calendarDate;
      lastSurveillanceDate = calendarDate;
      lastSessionKind = kind;
      lastPersistWasEmpty = true;
      frozen = {
        ...emptyBoard(calendarDate, isoFromMs(wallNowMs) ?? ""),
        generationId,
      };
      return packResult({
        published: true,
        sessionReset: true,
        board: frozen,
        sessionKind: kind,
        surveillanceDate,
        sessionTransition: "hard_reset",
        liveSurveillance: false,
        persistEmpty: true,
        clearV2: true,
      });
    }
    lastSessionDate = calendarDate;
    lastSessionKind = kind;

    if (!inSession) {
      feedStale = false;
      const board = frozen ??
        emptyBoard(calendarDate, isoFromMs(wallNowMs) ?? "");
      return packResult({
        published: false,
        board,
        sessionKind: kind,
        surveillanceDate,
        liveSurveillance: false,
        clearV2: true,
      });
    }

    const gated = tapeGate(
      wallNowMs,
      calendarDate,
      kind,
      surveillanceDate,
      true,
    );
    if (gated !== "rank") return gated;

    rankLiveBoard(wallNowMs, generationId, calendarDate);
    lastPersistWasEmpty = frozen === null || frozen.rows.length === 0;
    return packResult({
      published: true,
      board: frozen ?? emptyBoard(calendarDate, isoFromMs(wallNowMs) ?? ""),
      sessionKind: kind,
      surveillanceDate,
      liveSurveillance: true,
    });
  }

  function evaluateSurveillance(
    wallNowMs: number,
    generationId: string,
    kind: SessionKind,
    surveillanceDate: string,
  ): EvaluateResult {
    const live = isLiveSurveillanceKind(kind);
    let sessionTransition: SessionTransition | null = null;

    const hardReset = shouldHardResetSurveillance({
      lastSurveillanceDate,
      surveillanceDate,
      kind,
    });
    if (hardReset) {
      hardResetTransientMarketState();
      lastSessionDate = surveillanceDate;
      lastSurveillanceDate = surveillanceDate;
      lastSessionKind = kind;
      lastPersistWasEmpty = true;
      sessionTransition = "hard_reset";
      frozen = {
        ...emptyBoard(surveillanceDate, isoFromMs(wallNowMs) ?? ""),
        generationId,
      };
      return packResult({
        published: true,
        sessionReset: true,
        board: frozen,
        sessionKind: kind,
        surveillanceDate,
        sessionTransition,
        liveSurveillance: false,
        persistEmpty: true,
        clearV2: true,
      });
    }

    const soft = softTransitionOf(lastSessionKind, kind);
    if (soft) {
      sessionTransition = soft;
      subsessionEpoch += 1;
      intel.softResetAll(kind, subsessionEpoch);
    }

    if (!live) {
      const wasLive = lastSessionKind !== null &&
        isLiveSurveillanceKind(lastSessionKind);
      lastSessionKind = kind;
      const nowIso = isoFromMs(wallNowMs) ?? "";
      frozen = {
        ...emptyBoard(surveillanceDate, nowIso),
        generationId,
      };
      const persistEmpty = wasLive && !lastPersistWasEmpty;
      if (persistEmpty) lastPersistWasEmpty = true;
      return packResult({
        published: persistEmpty,
        board: frozen,
        sessionKind: kind,
        surveillanceDate,
        sessionTransition: wasLive ? "park_closed" : null,
        liveSurveillance: false,
        persistEmpty,
        clearV2: true,
      });
    }

    lastSessionDate = surveillanceDate;
    lastSurveillanceDate = surveillanceDate;
    lastSessionKind = kind;

    const gated = tapeGate(
      wallNowMs,
      surveillanceDate,
      kind,
      surveillanceDate,
      true,
    );
    if (gated !== "rank") {
      const boundaryClear =
        sessionTransition === "soft_pm_rth" ||
        sessionTransition === "soft_rth_ah";
      if (boundaryClear) {
        return packResult({
          published: gated.published,
          staleTransition: gated.staleTransition,
          board: gated.board,
          sessionKind: kind,
          surveillanceDate,
          sessionTransition,
          liveSurveillance: true,
          persistEmpty: false,
          clearV2: true,
        });
      }
      if (gated.sessionTransition === null && sessionTransition !== null) {
        return {
          ...gated,
          sessionTransition,
          subsessionEpoch,
          persistenceV2: {
            ...gated.persistenceV2,
            sessionTransition,
          },
        };
      }
      return gated;
    }

    rankLiveBoard(wallNowMs, generationId, surveillanceDate);
    const persistLive = kind === "market";
    const persistEmpty = !persistLive &&
      sessionTransition === "soft_rth_ah" &&
      !lastPersistWasEmpty;
    if (persistLive) lastPersistWasEmpty = frozen?.status === "empty";
    if (persistEmpty) lastPersistWasEmpty = true;

    return packResult({
      published: persistLive || persistEmpty,
      board: frozen ?? emptyBoard(surveillanceDate, isoFromMs(wallNowMs) ?? ""),
      sessionKind: kind,
      surveillanceDate,
      sessionTransition,
      liveSurveillance: true,
      persistEmpty,
    });
  }

  return {
    setUniverse(quotes) {
      universe = new Map(quotes);
      if (config.sentinelEnabled) return;
      const tracked = trackedSet();
      for (const symbol of book.trackedSymbols()) {
        if (!tracked.has(symbol)) book.dropSymbol(symbol);
      }
    },
    setExceptions(next) {
      exceptions = next;
    },
    ingest(raw, receiveMs): IngestResult {
      if (!config.sentinelEnabled) {
        const result = book.ingest(raw, receiveMs, trackedSet());
        if (!result.accepted) return result;
        noteReceive(result.endMs, receiveMs);
        noteKind(result.kind);
        return result;
      }

      const event = parseAggregateEvent(raw);
      if (!event) return { accepted: false, reason: "invalid" };
      const sen = sentinel.ingestEvent(event, receiveMs);
      if (!sen.accepted) return sen;
      noteReceive(sen.endMs, receiveMs);
      noteKind(sen.kind);

      const already = promoted.has(event.sym);
      const nowPromoted = already || tryPromote(event.sym);
      if (!nowPromoted) return sen;

      const tracked = trackedSet();
      const bookResult = book.ingest(raw, receiveMs, tracked);
      if (bookResult.accepted) {
        const quote = universe.get(event.sym) ?? null;
        const metrics = book.metrics(event.sym, event.e, quote);
        intel.applyEvent(event, {
          currentKind: lastSessionKind,
          subsessionEpoch,
          exceptions,
          hints: metrics
            ? {
              vol5s: metrics.vol5s,
              vol15s: metrics.vol15s,
              vol60s: metrics.vol60s,
              move15s: metrics.move15s,
              move60s: metrics.move60s,
              acceleration5m: metrics.acceleration5m,
            }
            : null,
        });
        return bookResult;
      }
      return sen;
    },
    evaluate(wallNowMs, generationId): EvaluateResult {
      const calendarDate = sessionDateAt(wallNowMs);
      if (!calendarDate) {
        return packResult({
          published: false,
          board: frozen ?? emptyBoard("", isoFromMs(wallNowMs) ?? ""),
          sessionKind: "closed",
          surveillanceDate: "",
          liveSurveillance: false,
        });
      }

      const kind = config.sentinelEnabled
        ? radarSessionKindAt(wallNowMs, exceptions)
        : inclusiveSessionKindAt(wallNowMs, exceptions);
      const surveillanceDate = surveillanceDateAt(wallNowMs) ?? calendarDate;

      if (!config.sentinelEnabled) {
        return evaluateLegacy(
          wallNowMs,
          generationId,
          calendarDate,
          kind,
          surveillanceDate,
        );
      }
      return evaluateSurveillance(
        wallNowMs,
        generationId,
        kind,
        surveillanceDate,
      );
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
    sentinelStats() {
      return snapshotSentinelStats();
    },
    hasSentinel(symbol) {
      return sentinel.has(symbol);
    },
    isPromoted(symbol) {
      return promoted.has(symbol);
    },
    hasRadarBook(symbol) {
      return book.trackedSymbols().includes(symbol);
    },
    bookBarCount(symbol) {
      return book.metrics(symbol, lastEventEndMs ?? 0, null)?.barCount ?? 0;
    },
    sessionIntel(symbol) {
      return intel.get(symbol, lastEventEndMs ?? 0);
    },
  };
}
