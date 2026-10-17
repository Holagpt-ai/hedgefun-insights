/**
 * Shared price resolution utilities used site-wide.
 * Single source of truth for current-price fallback chains and market-session detection.
 */

import {
  getEtParts,
  marketHolidayName,
  resolveMarketClock,
} from "@/lib/market-calendar";
import { polygonSnapshotFieldToMs } from "@/lib/market-data/polygon-snapshot-timestamps";

/** Development policy: public research surfaces use a delayed provider feed. */
export const PUBLIC_MARKET_DATA_DELAY_DISCLOSURE = "15-minute delayed market data";

/** Resolve the best available price from a Polygon snapshot/ticker object. */
export function resolveCurrentPrice(ticker: any): number {
  const dayClose = ticker?.day?.c;
  const minClose = ticker?.min?.c;
  const lastTrade = ticker?.lastTrade?.p;
  const prevClose = ticker?.prevDay?.c;

  if (dayClose && dayClose > 0) return dayClose;
  if (minClose && minClose > 0) return minClose;
  if (lastTrade && lastTrade > 0) return lastTrade;
  if (prevClose && prevClose > 0) return prevClose;
  return 0;
}

export type MarketSessionLabel = "pre-market" | "market" | "after-hours" | "closed";

function mapClockSession(sessionId: string): MarketSessionLabel {
  if (sessionId === "pre-market") return "pre-market";
  if (sessionId === "market") return "market";
  if (sessionId === "after-hours") return "after-hours";
  return "closed";
}

/** Calendar-aware US equity session (weekends/holidays stay closed). */
export function resolveMarketSession(now = new Date()): MarketSessionLabel {
  return mapClockSession(resolveMarketClock(now).sessionId);
}

export function resolveMarketClockState(now = new Date()) {
  return resolveMarketClock(now);
}

/** Build a human-readable session price label (e.g. "After-hours: $650.09 −0.25 (−0.04%)"). */
export function resolveSessionLabel(
  session: string,
  price: number,
  change: number,
  changePercent: number,
): string {
  const sign = change >= 0 ? "+" : "";
  const priceStr = `$${price.toFixed(2)} ${sign}${change.toFixed(2)} (${sign}${changePercent.toFixed(2)}%)`;

  if (session === "pre-market") return `Pre-market: ${priceStr}`;
  if (session === "after-hours") return `After-hours: ${priceStr}`;
  return "";
}

/** Get Eastern-Time formatted date string. */
export function estDate(now = new Date()): string {
  return now.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Get Eastern-Time formatted time string. */
export function estTime(now = new Date()): string {
  return now.toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** EST or EDT for America/New_York at `now`. */
export function estTimezoneAbbr(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "short",
  }).formatToParts(now);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? "ET";
}

export function formatStockHeaderSessionLine(now = new Date()): string {
  const clock = resolveMarketClock(now);
  const tz = estTimezoneAbbr(now);
  const et = getEtParts(now);
  const holiday = marketHolidayName(et.date);
  if (!clock.isTradingDay) {
    if (holiday) return `${holiday} · Market closed · ${clock.etTimeStr} ${tz}`;
    if (et.weekday === 0 || et.weekday === 6) return `Weekend · Market closed · ${clock.etTimeStr} ${tz}`;
    return `Market closed · ${clock.etTimeStr} ${tz}`;
  }
  if (clock.sessionId === "market") {
    return `${clock.etTimeStr} ${tz} · ${clock.label}`;
  }
  return `${clock.label} · ${clock.etTimeStr} ${tz}`;
}

const SOURCE_LABEL: Record<Exclude<StockHeaderTimestampSource, null>, string> = {
  lastTrade: "Last trade",
  min: "Minute aggregate",
  day: "Daily aggregate",
  prevDay: "Previous close",
};

/** Human label for the snapshot field that supplied the displayed price. */
export function stockHeaderPriceSourceLabel(source: StockHeaderTimestampSource): string | null {
  if (!source) return null;
  return SOURCE_LABEL[source];
}

function parseObservationMs(
  snapshot: unknown,
  source: StockHeaderTimestampSource,
  nowMs: number,
): number | null {
  const tick = asRecord(snapshot);
  if (!tick) return null;
  if (source === "lastTrade") {
    return polygonSnapshotFieldToMs(asRecord(tick.lastTrade)?.t, "lastTrade", nowMs);
  }
  if (source === "min") {
    const min = asRecord(tick.min);
    return (
      polygonSnapshotFieldToMs(min?.t, "minAggregate", nowMs)
      ?? polygonSnapshotFieldToMs(min?.e, "minAggregate", nowMs)
    );
  }
  if (source === "day") {
    return polygonSnapshotFieldToMs(asRecord(tick.day)?.t, "dayAggregate", nowMs);
  }
  if (source === "prevDay") {
    return polygonSnapshotFieldToMs(asRecord(tick.prevDay)?.t, "prevDayAggregate", nowMs);
  }
  return null;
}

/** Price observation time when provider timestamp exists — never conflated with wall clock. */
export function formatPriceObservationTime(
  snapshot: unknown,
  source: StockHeaderTimestampSource,
  now = new Date(),
): string | null {
  const ms = parseObservationMs(snapshot, source, now.getTime());
  if (ms === null) return null;
  const observed = new Date(ms);
  return `As of ${observed.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  })} · ${PUBLIC_MARKET_DATA_DELAY_DISCLOSURE}`;
}

export type StockHeaderSession = ReturnType<typeof resolveMarketSession>;

/**
 * Why the primary price and change were chosen.
 * Extended sessions never pair a close print with a live percentage.
 */
export type StockHeaderBasis =
  | "extended_vs_prior_close"
  | "regular_vs_prior_close"
  | "extended_vs_regular_close"
  | "official_close"
  | "unavailable";

/** Which snapshot field supplied `displayedPrice`. */
export type StockHeaderTimestampSource = "lastTrade" | "min" | "day" | "prevDay" | null;

export interface StockHeaderPriceState {
  session: StockHeaderSession;
  displayedPrice: number | null;
  referencePrice: number | null;
  change: number | null;
  changePercent: number | null;
  basis: StockHeaderBasis;
  timestampSource: StockHeaderTimestampSource;
}

type ExtendedPrint = {
  price: number;
  source: "lastTrade" | "min";
};

function positivePrice(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(n) || !(n > 0)) return null;
  return n;
}

function finiteOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * Extended-session last: Polygon lastTrade.p, else minute close min.c.
 * Same order as homepage movers and screener `extendedSessionLastPrice`.
 * Never uses day.c or prevDay.c as the live print.
 */
function extendedSessionPrint(snapshot: unknown): ExtendedPrint | null {
  const tick = asRecord(snapshot);
  const lastTrade = positivePrice(asRecord(tick?.lastTrade)?.p);
  if (lastTrade !== null) return { price: lastTrade, source: "lastTrade" };
  const minuteClose = positivePrice(asRecord(tick?.min)?.c);
  if (minuteClose !== null) return { price: minuteClose, source: "min" };
  return null;
}

function priorRegularClose(snapshot: unknown): number | null {
  return positivePrice(asRecord(asRecord(snapshot)?.prevDay)?.c);
}

function regularSessionClose(snapshot: unknown): number | null {
  return positivePrice(asRecord(asRecord(snapshot)?.day)?.c);
}

function changeVersus(current: number, reference: number): { change: number; changePercent: number } | null {
  if (!(current > 0) || !(reference > 0)) return null;
  const change = current - reference;
  const changePercent = (change / reference) * 100;
  if (!Number.isFinite(change) || !Number.isFinite(changePercent)) return null;
  return { change, changePercent };
}

function regularChainSource(snapshot: unknown): StockHeaderTimestampSource {
  const tick = asRecord(snapshot);
  if (positivePrice(asRecord(tick?.day)?.c) !== null) return "day";
  if (positivePrice(asRecord(tick?.min)?.c) !== null) return "min";
  if (positivePrice(asRecord(tick?.lastTrade)?.p) !== null) return "lastTrade";
  if (positivePrice(asRecord(tick?.prevDay)?.c) !== null) return "prevDay";
  return null;
}

function emptyState(
  session: StockHeaderSession,
  basis: StockHeaderBasis,
  referencePrice: number | null = null,
): StockHeaderPriceState {
  return {
    session,
    displayedPrice: null,
    referencePrice,
    change: null,
    changePercent: null,
    basis,
    timestampSource: null,
  };
}

/**
 * One session-aware price state for stock and ETF headers.
 * Premarket and after-hours recalculate change from the live print and the
 * session's official reference. Regular and closed sessions keep the existing
 * provider change paired with `resolveCurrentPrice`.
 */
export function resolveStockHeaderPriceState(
  snapshot: unknown,
  session: StockHeaderSession,
): StockHeaderPriceState {
  if (session === "pre-market") {
    const extended = extendedSessionPrint(snapshot);
    const prior = priorRegularClose(snapshot);
    if (!extended) {
      return emptyState(session, "unavailable", prior);
    }
    const move = prior !== null ? changeVersus(extended.price, prior) : null;
    if (!move) {
      return {
        session,
        displayedPrice: extended.price,
        referencePrice: null,
        change: null,
        changePercent: null,
        basis: "unavailable",
        timestampSource: extended.source,
      };
    }
    return {
      session,
      displayedPrice: extended.price,
      referencePrice: prior,
      change: move.change,
      changePercent: move.changePercent,
      basis: "extended_vs_prior_close",
      timestampSource: extended.source,
    };
  }

  if (session === "after-hours") {
    const extended = extendedSessionPrint(snapshot);
    const regularClose = regularSessionClose(snapshot);
    if (!extended) {
      return {
        session,
        displayedPrice: regularClose,
        referencePrice: regularClose,
        change: null,
        changePercent: null,
        basis: regularClose !== null ? "official_close" : "unavailable",
        timestampSource: regularClose !== null ? "day" : null,
      };
    }
    const move = regularClose !== null ? changeVersus(extended.price, regularClose) : null;
    if (!move) {
      return {
        session,
        displayedPrice: extended.price,
        referencePrice: null,
        change: null,
        changePercent: null,
        basis: "unavailable",
        timestampSource: extended.source,
      };
    }
    return {
      session,
      displayedPrice: extended.price,
      referencePrice: regularClose,
      change: move.change,
      changePercent: move.changePercent,
      basis: "extended_vs_regular_close",
      timestampSource: extended.source,
    };
  }

  const resolved = resolveCurrentPrice(snapshot);
  const displayedPrice = resolved > 0 ? resolved : resolved === 0 ? 0 : null;
  return {
    session,
    displayedPrice,
    referencePrice: priorRegularClose(snapshot),
    change: finiteOrZero(asRecord(snapshot)?.todaysChange),
    changePercent: finiteOrZero(asRecord(snapshot)?.todaysChangePerc),
    basis: session === "closed" ? "official_close" : "regular_vs_prior_close",
    timestampSource: regularChainSource(snapshot),
  };
}

/** Supporting line under the primary price. Clock text stays in the component. */
export function stockHeaderSessionContext(state: StockHeaderPriceState): string | null {
  if (state.session === "pre-market") {
    if (state.referencePrice !== null && state.basis === "extended_vs_prior_close") {
      return `Pre-market · Previous close $${state.referencePrice.toFixed(2)}`;
    }
    return "Pre-market";
  }
  if (state.session === "after-hours") {
    if (state.referencePrice !== null && state.basis === "extended_vs_regular_close") {
      return `After-hours · Regular close $${state.referencePrice.toFixed(2)}`;
    }
    return "After-hours";
  }
  return null;
}
