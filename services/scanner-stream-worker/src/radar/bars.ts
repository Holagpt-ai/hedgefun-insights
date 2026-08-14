import type { RadarV22Config } from "./config.ts";
import { parseAggregateEvent } from "./parse.ts";
import type {
  AggregateSecondEvent,
  EligibleQuote,
  IngestResult,
  PriceWindow,
  SecondBar,
  SymbolMetrics,
} from "./types.ts";
import { acceleration5m, pruneWindow, rollingVolume } from "./windows.ts";

const WINDOW_5S = 5_000;
const WINDOW_15S = 15_000;
const WINDOW_60S = 60_000;

function barFromEvent(event: AggregateSecondEvent): SecondBar {
  const typical = event.vw ?? event.c;
  const dollarVolume = typical !== null ? typical * event.v : 0;
  return {
    startMs: event.s,
    endMs: event.e,
    volume: event.v,
    open: event.o,
    high: event.h,
    low: event.l,
    close: event.c,
    vwap: event.vw,
    sessionVwap: event.a,
    sessionOpen: event.op,
    accumulatedVolume: event.av,
    dollarVolume,
    priceComplete: event.o !== null && event.h !== null && event.l !== null &&
      event.c !== null,
    lateCorrected: false,
    correctionCount: 0,
  };
}

function sameEvidence(a: SecondBar, b: SecondBar): boolean {
  return a.volume === b.volume && a.open === b.open && a.high === b.high &&
    a.low === b.low && a.close === b.close && a.vwap === b.vwap &&
    a.accumulatedVolume === b.accumulatedVolume;
}

export type SymbolBook = {
  bars: Map<number, SecondBar>;
  lastStartMs: number | null;
  lastEndMs: number | null;
  lastReceiveMs: number | null;
  sessionHigh: number | null;
  sessionLow: number | null;
  sessionVolumeSum: number;
  sessionDollarSum: number;
};

function emptyBook(): SymbolBook {
  return {
    bars: new Map(),
    lastStartMs: null,
    lastEndMs: null,
    lastReceiveMs: null,
    sessionHigh: null,
    sessionLow: null,
    sessionVolumeSum: 0,
    sessionDollarSum: 0,
  };
}

function rebuildSessionExtremes(book: SymbolBook): void {
  let high: number | null = null;
  let low: number | null = null;
  let vol = 0;
  let dollars = 0;
  for (const bar of book.bars.values()) {
    vol += bar.volume;
    dollars += bar.dollarVolume;
    if (bar.priceComplete && bar.high !== null) {
      high = high === null ? bar.high : Math.max(high, bar.high);
    }
    if (bar.priceComplete && bar.low !== null) {
      low = low === null ? bar.low : Math.min(low, bar.low);
    }
  }
  book.sessionHigh = high;
  book.sessionLow = low;
  book.sessionVolumeSum = vol;
  book.sessionDollarSum = dollars;
}

function pruneBars(
  book: SymbolBook,
  eventNowMs: number,
  retentionMs: number,
): void {
  const removed = pruneWindow(book.bars, eventNowMs, retentionMs);
  if (removed) rebuildSessionExtremes(book);
}

function sumVolume(
  book: SymbolBook,
  eventNowMs: number,
  durationMs: number,
  field: "volume" | "dollarVolume",
): { total: number; lateCorrection: boolean } {
  return rollingVolume(book.bars, eventNowMs, durationMs, field);
}

function closeAtEnd(book: SymbolBook, endMs: number): number | null {
  for (const bar of book.bars.values()) {
    if (bar.endMs === endMs && bar.priceComplete && bar.close !== null) {
      return bar.close;
    }
  }
  return null;
}

function priceWindow(
  book: SymbolBook,
  eventNowMs: number,
  durationMs: number,
): PriceWindow {
  const endClose = closeAtEnd(book, eventNowMs);
  const startClose = closeAtEnd(book, eventNowMs - durationMs);
  if (endClose === null || startClose === null || startClose === 0) {
    return { movePct: null, complete: false };
  }
  const movePct = ((endClose - startClose) / startClose) * 100;
  if (!Number.isFinite(movePct)) return { movePct: null, complete: false };
  return { movePct, complete: true };
}

export type RadarBook = {
  ingest(
    raw: unknown,
    receiveMs: number,
    tracked: ReadonlySet<string>,
  ): IngestResult;
  metrics(
    symbol: string,
    eventNowMs: number,
    quote: EligibleQuote | null,
  ): SymbolMetrics | null;
  clearSession(): void;
  dropSymbol(symbol: string): void;
  trackedSymbols(): string[];
};

export function createRadarBook(config: RadarV22Config): RadarBook {
  const books = new Map<string, SymbolBook>();

  return {
    ingest(raw, receiveMs, tracked): IngestResult {
      const event = parseAggregateEvent(raw);
      if (!event) return { accepted: false, reason: "invalid" };
      if (!tracked.has(event.sym)) {
        return { accepted: false, reason: "ignored" };
      }

      let book = books.get(event.sym);
      if (!book) {
        book = emptyBook();
        books.set(event.sym, book);
      }

      const incoming = barFromEvent(event);
      const existing = book.bars.get(event.s);

      if (existing) {
        if (sameEvidence(existing, incoming)) {
          return {
            accepted: true,
            kind: "duplicate",
            symbol: event.sym,
            startMs: event.s,
            endMs: event.e,
          };
        }
        const late = receiveMs - existing.endMs > config.lateCorrectionMs;
        const next: SecondBar = {
          ...incoming,
          lateCorrected: late || existing.lateCorrected,
          correctionCount: existing.correctionCount + 1,
        };
        book.bars.set(event.s, next);
        rebuildSessionExtremes(book);
        book.lastReceiveMs = receiveMs;
        return {
          accepted: true,
          kind: late ? "late_correction" : "correction",
          symbol: event.sym,
          startMs: event.s,
          endMs: event.e,
        };
      }

      const outOfOrder = book.lastStartMs !== null &&
        event.s < book.lastStartMs;
      book.bars.set(event.s, incoming);
      if (incoming.priceComplete && incoming.high !== null) {
        book.sessionHigh = book.sessionHigh === null
          ? incoming.high
          : Math.max(book.sessionHigh, incoming.high);
      }
      if (incoming.priceComplete && incoming.low !== null) {
        book.sessionLow = book.sessionLow === null
          ? incoming.low
          : Math.min(book.sessionLow, incoming.low);
      }
      book.sessionVolumeSum += incoming.volume;
      book.sessionDollarSum += incoming.dollarVolume;
      if (book.lastStartMs === null || event.s > book.lastStartMs) {
        book.lastStartMs = event.s;
      }
      if (book.lastEndMs === null || event.e > book.lastEndMs) {
        book.lastEndMs = event.e;
      }
      book.lastReceiveMs = receiveMs;
      pruneBars(book, event.e, config.barRetentionMs);
      return {
        accepted: true,
        kind: outOfOrder ? "out_of_order" : "new",
        symbol: event.sym,
        startMs: event.s,
        endMs: event.e,
      };
    },

    metrics(symbol, eventNowMs, quote): SymbolMetrics | null {
      const book = books.get(symbol);
      const vol5 = book
        ? sumVolume(book, eventNowMs, WINDOW_5S, "volume")
        : { total: 0, lateCorrection: false };
      const vol15 = book
        ? sumVolume(book, eventNowMs, WINDOW_15S, "volume")
        : { total: 0, lateCorrection: false };
      const vol60 = book
        ? sumVolume(book, eventNowMs, WINDOW_60S, "volume")
        : { total: 0, lateCorrection: false };
      const dollar60 = book
        ? sumVolume(book, eventNowMs, WINDOW_60S, "dollarVolume")
        : { total: 0, lateCorrection: false };

      const lastBar = book
        ? [...book.bars.values()].reduce<SecondBar | null>((best, bar) => {
          if (bar.endMs > eventNowMs) return best;
          if (!best || bar.endMs > best.endMs) return bar;
          return best;
        }, null)
        : null;

      const sessionVolume = lastBar?.accumulatedVolume !== null &&
          lastBar?.accumulatedVolume !== undefined &&
          lastBar.accumulatedVolume > 0
        ? lastBar.accumulatedVolume
        : (book?.sessionVolumeSum ?? 0);

      const sessionVwap = lastBar?.sessionVwap ??
        (book && book.sessionVolumeSum > 0
          ? book.sessionDollarSum / book.sessionVolumeSum
          : null);

      const lastPrice = lastBar?.close ?? quote?.regularClose ?? null;
      const providerLagMs = book?.lastReceiveMs !== null &&
          book?.lastReceiveMs !== undefined &&
          lastBar
        ? book.lastReceiveMs - lastBar.endMs
        : null;

      return {
        symbol,
        vol5s: vol5.total,
        vol15s: vol15.total,
        vol60s: vol60.total,
        dollarVol60s: dollar60.total,
        sessionVolume,
        sessionHigh: book?.sessionHigh ?? quote?.dayHigh ?? null,
        sessionLow: book?.sessionLow ?? quote?.dayLow ?? null,
        sessionVwap: sessionVwap !== null && Number.isFinite(sessionVwap)
          ? sessionVwap
          : null,
        lastPrice,
        move15s: book
          ? priceWindow(book, eventNowMs, WINDOW_15S)
          : { movePct: null, complete: false },
        move60s: book
          ? priceWindow(book, eventNowMs, WINDOW_60S)
          : { movePct: null, complete: false },
        acceleration5m: book ? acceleration5m(book.bars, eventNowMs) : null,
        providerLagMs,
        lastBarEndMs: lastBar?.endMs ?? null,
        lastBarStartMs: lastBar?.startMs ?? null,
        lateCorrectionInWindows: vol5.lateCorrection || vol15.lateCorrection ||
          vol60.lateCorrection,
        barCount: book?.bars.size ?? 0,
      };
    },

    clearSession() {
      books.clear();
    },

    dropSymbol(symbol) {
      books.delete(symbol);
    },

    trackedSymbols() {
      return [...books.keys()];
    },
  };
}

export function detectPass(
  eligible: boolean,
  metrics: SymbolMetrics,
  config: RadarV22Config,
): boolean {
  if (!eligible) return false;
  if (!(metrics.vol60s >= config.detectVol60sFloor)) return false;
  if (
    !(metrics.vol5s >= config.detectVol5s ||
      metrics.vol15s >= config.detectVol15s)
  ) {
    return false;
  }
  if (!metrics.move15s.complete || metrics.move15s.movePct === null) {
    return false;
  }
  return metrics.move15s.movePct >= 0;
}

export function activePass(
  eligible: boolean,
  metrics: SymbolMetrics,
  config: RadarV22Config,
): boolean {
  if (!eligible) return false;
  if (!(metrics.vol60s >= config.activeVol60s)) return false;
  if (!(metrics.vol15s >= config.activeVol15s)) return false;
  const move15Ok = metrics.move15s.complete &&
    metrics.move15s.movePct !== null &&
    metrics.move15s.movePct >= config.activeMove15sPct;
  const move60Ok = metrics.move60s.complete &&
    metrics.move60s.movePct !== null &&
    metrics.move60s.movePct >= config.activeMove60sPct;
  return move15Ok || move60Ok;
}
