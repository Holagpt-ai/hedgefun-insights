import type { PolygonTicker } from "../../../../supabase/functions/_shared/screeners/selection.ts";
import {
  dayHighLow,
  dayVolume,
  normalizeSymbol as normalizeSelectionSymbol,
  previousRegularClose,
  priorSessionVolume,
  qualifiesDayTradeRadar,
  regularChangePercent,
  regularClose,
  volumeRatioPriorSession,
} from "../../../../supabase/functions/_shared/screeners/selection.ts";
import type { EligibleQuote } from "./types.ts";
import { normalizeSymbol } from "./parse.ts";

function symbolOf(t: PolygonTicker): string | null {
  return normalizeSelectionSymbol(t.ticker) ??
    (typeof t.ticker === "string" ? normalizeSymbol(t.ticker) : null);
}

function companyNameOf(t: PolygonTicker): string | null {
  const nameRaw = (t as { name?: unknown }).name;
  return typeof nameRaw === "string" && nameRaw.trim() !== ""
    ? nameRaw.trim()
    : null;
}

export function quoteFromTicker(t: PolygonTicker): EligibleQuote | null {
  const symbol = symbolOf(t);
  if (!symbol) return null;
  if (!qualifiesDayTradeRadar(t)) return null;
  const close = regularClose(t);
  const prev = t.prevDay ? Number(t.prevDay.c) : NaN;
  const dayVol = dayVolume(t);
  const priorVol = priorSessionVolume(t);
  const change = regularChangePercent(t);
  const ratio = volumeRatioPriorSession(t);
  if (
    close === null || !Number.isFinite(prev) || prev <= 0 || dayVol === null ||
    priorVol === null || change === null || ratio === null
  ) {
    return null;
  }
  const range = dayHighLow(t);
  return {
    symbol,
    companyName: companyNameOf(t),
    regularClose: close,
    previousClose: prev,
    dayVolume: dayVol,
    priorVolume: priorVol,
    dayHigh: range.high,
    dayLow: range.low,
    volumeRatio: ratio,
    changePercent: change,
  };
}

/**
 * Snapshot enrichment for Sentinel-mode. Does NOT apply qualifiesDayTradeRadar.
 * Missing prior-session volume yields 0 rather than rejecting the quote.
 */
export function enrichmentFromTicker(t: PolygonTicker): EligibleQuote | null {
  const symbol = symbolOf(t);
  if (!symbol) return null;
  const close = regularClose(t);
  const prev = previousRegularClose(t);
  const dayVol = dayVolume(t);
  const priorVol = priorSessionVolume(t);
  const range = dayHighLow(t);
  const regularClosePx = close !== null && close > 0 ? close : 0;
  const previousClose = prev !== null && prev > 0 ? prev : 0;
  const dayVolumePx = dayVol !== null && Number.isFinite(dayVol) ? dayVol : 0;
  const priorVolume = priorVol !== null && priorVol > 0 ? priorVol : 0;
  const changePercent = regularClosePx > 0 && previousClose > 0
    ? ((regularClosePx - previousClose) / previousClose) * 100
    : 0;
  const volumeRatio = dayVolumePx > 0 && priorVolume > 0
    ? Math.round((dayVolumePx / priorVolume) * 10) / 10
    : 0;
  return {
    symbol,
    companyName: companyNameOf(t),
    regularClose: regularClosePx,
    previousClose,
    dayVolume: dayVolumePx,
    priorVolume,
    dayHigh: range.high,
    dayLow: range.low,
    volumeRatio,
    changePercent,
  };
}

export function eligibleUniverse(
  tickers: PolygonTicker[],
): Map<string, EligibleQuote> {
  const out = new Map<string, EligibleQuote>();
  for (const t of tickers) {
    const quote = quoteFromTicker(t);
    if (!quote) continue;
    const prev = out.get(quote.symbol);
    if (!prev || quote.dayVolume > prev.dayVolume) {
      out.set(quote.symbol, quote);
    }
  }
  return out;
}

export function enrichmentUniverse(
  tickers: PolygonTicker[],
): Map<string, EligibleQuote> {
  const out = new Map<string, EligibleQuote>();
  for (const t of tickers) {
    const quote = enrichmentFromTicker(t);
    if (!quote) continue;
    const prev = out.get(quote.symbol);
    if (!prev || quote.dayVolume > prev.dayVolume) {
      out.set(quote.symbol, quote);
    }
  }
  return out;
}
