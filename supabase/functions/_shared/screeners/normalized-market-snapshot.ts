/**
 * Canonical normalized market fields for scanner engines.
 * Pure helpers — never fabricate missing provider evidence.
 */

import {
  extendedSessionLastPrice,
  gapPercent,
  previousRegularClose,
  safeNumber,
  type PolygonTicker,
} from "./selection.ts";

export type MarketSessionKind =
  | "pre-market"
  | "regular"
  | "after-hours"
  | "closed"
  | "unknown";

export interface NormalizedMarketSnapshot {
  symbol: string;
  price: number | null;
  previousClose: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  dollarVolume: number | null;
  premarketVolume: number | null;
  premarketHigh: number | null;
  premarketLow: number | null;
  week52High: number | null;
  week52Low: number | null;
  priorWeek52High: number | null;
  priorWeek52Low: number | null;
  timestamp: string | null;
  providerTimestamp: string | null;
  session: MarketSessionKind;
  marketDelayMinutes: number | null;
  open: number | null;
  priorSessionVolume: number | null;
  averageVolume20d: number | null;
}

export interface VerifiedPreviousCloseOverlay {
  symbol: string;
  previousClose: number;
  priorSessionVolume?: number | null;
  source: "radar_v22_candidate" | "radar_v22_board" | "verified_session_fact";
}

export function previousCloseFromVerifiedMove(
  price: number | null,
  changePercent: number | null,
): number | null {
  if (
    price === null || changePercent === null || !Number.isFinite(price) ||
    !Number.isFinite(changePercent)
  ) {
    return null;
  }
  const denom = 1 + changePercent / 100;
  if (!(denom > 0)) return null;
  const previousClose = price / denom;
  if (!Number.isFinite(previousClose) || !(previousClose > 0)) return null;
  return previousClose;
}

function positiveFinite(value: unknown): number | null {
  const n = safeNumber(value);
  return n !== null && n > 0 ? n : null;
}

export function gapPercentFromVerifiedInputs(
  currentPrice: number | null,
  previousClose: number | null,
): number | null {
  if (currentPrice === null || previousClose === null || previousClose <= 0) {
    return null;
  }
  const pct = ((currentPrice - previousClose) / previousClose) * 100;
  if (!Number.isFinite(pct)) return null;
  return Math.round(pct * 10) / 10;
}

/**
 * When Polygon omits prevDay.c, overlay verified previous-session facts
 * from Radar V2 persistence (never inferred from move %).
 */
export function overlayVerifiedPreviousCloseOnTicker(
  ticker: PolygonTicker,
  overlay: ReadonlyMap<string, VerifiedPreviousCloseOverlay>,
): PolygonTicker {
  const sym = typeof ticker.ticker === "string"
    ? ticker.ticker.trim().toUpperCase()
    : null;
  if (!sym) return ticker;
  if (previousRegularClose(ticker) !== null) return ticker;

  const fact = overlay.get(sym);
  if (!fact || !(fact.previousClose > 0)) return ticker;

  const prevDay = { ...(ticker.prevDay ?? {}) } as NonNullable<PolygonTicker["prevDay"]>;
  prevDay.c = fact.previousClose;
  if (
    fact.priorSessionVolume != null &&
    fact.priorSessionVolume > 0 &&
    safeNumber(prevDay.v) === null
  ) {
    prevDay.v = fact.priorSessionVolume;
  }
  return { ...ticker, prevDay };
}

export function overlayVerifiedPreviousCloseOnUniverse(
  universe: readonly PolygonTicker[],
  overlay: ReadonlyMap<string, VerifiedPreviousCloseOverlay>,
): PolygonTicker[] {
  if (overlay.size === 0) return [...universe];
  return universe.map((t) => overlayVerifiedPreviousCloseOnTicker(t, overlay));
}

export function buildSnapshotFromPolygonTicker(
  ticker: PolygonTicker,
  opts: {
    symbol: string;
    extendedSession?: boolean;
    providerTimestamp?: string | null;
    week52High?: number | null;
    week52Low?: number | null;
  },
): NormalizedMarketSnapshot {
  const extended = opts.extendedSession === true;
  const price = extended
    ? extendedSessionLastPrice(ticker)
    : positiveFinite(ticker.day?.c);
  const previousClose = previousRegularClose(ticker);
  const dayHigh = positiveFinite(ticker.day?.h);
  const dayLow = positiveFinite(ticker.day?.l);
  const volume = safeNumber(ticker.day?.v);
  const priorVol = safeNumber(ticker.prevDay?.v);
  const dollarVolume =
    price !== null && volume !== null && volume > 0 ? price * volume : null;

  return {
    symbol: opts.symbol,
    price,
    previousClose,
    dayHigh,
    dayLow,
    volume: volume !== null && volume >= 0 ? volume : null,
    dollarVolume,
    premarketVolume: extended ? volume : null,
    premarketHigh: extended ? dayHigh : null,
    premarketLow: extended ? dayLow : null,
    week52High: opts.week52High ?? null,
    week52Low: opts.week52Low ?? null,
    priorWeek52High: opts.week52High ?? null,
    priorWeek52Low: opts.week52Low ?? null,
    timestamp: opts.providerTimestamp ?? null,
    providerTimestamp: opts.providerTimestamp ?? null,
    session: extended ? "pre-market" : "regular",
    marketDelayMinutes: null,
    open: positiveFinite(ticker.day?.o) ?? positiveFinite(ticker.min?.o),
    priorSessionVolume: priorVol !== null && priorVol > 0 ? priorVol : null,
    averageVolume20d: null,
  };
}

export function verifiedGapPercentForTicker(
  ticker: PolygonTicker,
  extendedSession: boolean,
): number | null {
  return gapPercent(ticker, extendedSession);
}
