/**
 * Shared price resolution utilities used site-wide.
 * Single source of truth for current-price fallback chains and market-session detection.
 */

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

/** Determine the current US equity market session based on Eastern Time. */
export function resolveMarketSession(): "pre-market" | "market" | "after-hours" | "closed" {
  const now = new Date();
  const etStr = now.toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  const [h, m] = etStr.split(":").map(Number);
  const mins = h * 60 + m;

  if (mins >= 240 && mins < 570) return "pre-market";
  if (mins >= 570 && mins <= 960) return "market";
  if (mins >= 961 && mins <= 1200) return "after-hours";
  return "closed";
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
export function estDate(): string {
  return new Date().toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Get Eastern-Time formatted time string. */
export function estTime(): string {
  return new Date().toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
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
