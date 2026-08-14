import type { PolygonTicker } from "../../../../supabase/functions/_shared/screeners/selection.ts";
import {
  dayHighLow,
  dayVolume,
  normalizeSymbol as normalizeSelectionSymbol,
  priorSessionVolume,
  qualifiesDayTradeRadar,
  regularChangePercent,
  regularClose,
  volumeRatioPriorSession,
} from "../../../../supabase/functions/_shared/screeners/selection.ts";
import type { EligibleQuote } from "./types.ts";
import { normalizeSymbol } from "./parse.ts";

export function quoteFromTicker(t: PolygonTicker): EligibleQuote | null {
  const symbol = normalizeSelectionSymbol(t.ticker) ??
    (typeof t.ticker === "string" ? normalizeSymbol(t.ticker) : null);
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
  const nameRaw = (t as { name?: unknown }).name;
  const companyName = typeof nameRaw === "string" && nameRaw.trim() !== ""
    ? nameRaw.trim()
    : null;
  return {
    symbol,
    companyName,
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
