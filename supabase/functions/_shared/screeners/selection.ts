// Volume-first Screener selection contract.
// Qualify → require symbol + positive volume → dedupe → volume desc / symbol asc → limit.

export const SCREENER_ROW_LIMIT = 20;

export type PolygonTicker = {
  ticker?: unknown;
  /** Polygon snapshot observation time in nanoseconds. */
  updated?: unknown;
  /** Provider day-change vs previous close (may use extended last). Do not pair with day.c. */
  todaysChangePerc?: unknown;
  day?: { c?: unknown; o?: unknown; v?: unknown; h?: unknown; l?: unknown };
  prevDay?: { c?: unknown; v?: unknown };
  lastTrade?: { p?: unknown; t?: unknown };
  min?: { c?: unknown; t?: unknown; v?: unknown; av?: unknown };
  [key: string]: unknown;
};

/** Reject provider timestamps more than 5 minutes ahead of sync wall-clock. */
export const PROVIDER_FUTURE_SKEW_MS = 5 * 60_000;

/**
 * Parse Polygon snapshot `updated` (nanoseconds) to an ISO UTC timestamp.
 * Never substitutes the sync execution time.
 * Always returns an ISO string or null — never throws.
 */
export function parseProviderAsOf(
  raw: unknown,
  nowMs: number,
): string | null {
  try {
    if (!Number.isFinite(nowMs)) return null;
    if (raw === undefined || raw === null) return null;

    let nanos: number;
    if (typeof raw === "number") {
      if (!Number.isFinite(raw) || !Number.isInteger(raw)) return null;
      nanos = raw;
    } else if (typeof raw === "string") {
      const trimmed = raw.trim();
      // Bound digit length so enormous strings never coerce to Infinity/throw.
      if (!trimmed || trimmed.length > 22 || !/^\d+$/.test(trimmed)) {
        return null;
      }
      nanos = Number(trimmed);
      if (!Number.isFinite(nanos)) return null;
    } else {
      return null;
    }

    if (!(nanos > 0)) return null;

    // Polygon publishes nanoseconds; convert to milliseconds.
    const ms = Math.trunc(nanos / 1_000_000);
    if (!(ms > 0) || !Number.isFinite(ms)) return null;
    if (ms > nowMs + PROVIDER_FUTURE_SKEW_MS) return null;

    const observed = new Date(ms);
    const observedMs = observed.getTime();
    if (!Number.isFinite(observedMs)) return null;

    return observed.toISOString();
  } catch {
    return null;
  }
}

/** True when every ticker carries a valid provider observation timestamp. */
export function allHaveProviderAsOf(
  tickers: PolygonTicker[],
  nowMs: number,
): boolean {
  for (const t of tickers) {
    if (parseProviderAsOf(t.updated, nowMs) === null) return false;
  }
  return true;
}

/** Normalize a ticker symbol; returns null when missing/invalid. */
export function normalizeSymbol(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toUpperCase();
  if (!s || s.length > 12) return null;
  // Allow common equity symbols (letters, digits, ., -).
  if (!/^[A-Z][A-Z0-9.\-]*$/.test(s)) return null;
  return s;
}

/** Session day volume from a Polygon snapshot ticker. */
export function dayVolume(t: PolygonTicker): number | null {
  const v = t?.day?.v;
  if (v === undefined || v === null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function safeNumber(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Previous session total volume from Polygon prevDay.v.
 * Requires a finite positive value.
 */
export function priorSessionVolume(t: PolygonTicker): number | null {
  const v = t?.prevDay?.v;
  if (v === undefined || v === null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || !(n > 0)) return null;
  return n;
}

/**
 * Raw (unrounded) current session volume ÷ prior-session volume.
 * Used for qualification thresholds only.
 */
function rawVolumeRatioPriorSession(t: PolygonTicker): number | null {
  const dayVol = dayVolume(t);
  const priorVol = priorSessionVolume(t);
  if (dayVol === null || !(dayVol > 0) || priorVol === null) return null;
  const ratio = dayVol / priorVol;
  if (!Number.isFinite(ratio) || !(ratio > 0)) return null;
  return ratio;
}

/**
 * current session cumulative volume ÷ previous session total volume.
 * Prior-session volume ratio only — not an average-based or time-adjusted metric.
 * Rounded to one decimal for storage/display; qualification uses the raw ratio.
 */
export function volumeRatioPriorSession(t: PolygonTicker): number | null {
  const ratio = rawVolumeRatioPriorSession(t);
  if (ratio === null) return null;
  return Math.round(ratio * 10) / 10;
}

/** Gap % = (today open - prev close) / prev close * 100. */
export function gapPercent(t: PolygonTicker): number | null {
  const open = t?.day?.o;
  const prevClose = t?.prevDay?.c;
  if (open === undefined || open === null) return null;
  if (prevClose === undefined || prevClose === null) return null;
  const o = Number(open);
  const c = Number(prevClose);
  if (!Number.isFinite(o) || !Number.isFinite(c) || c === 0) return null;
  return Math.round(((o - c) / c) * 1000) / 10;
}

/**
 * Regular-session close from Polygon day.c only.
 * Never substitutes lastTrade / min / todaysChange fields.
 */
export function regularClose(t: PolygonTicker): number | null {
  const c = safeNumber(t?.day?.c);
  if (c === null || !(c > 0)) return null;
  return c;
}

/**
 * Previous regular-session close from Polygon prevDay.c only.
 */
export function previousRegularClose(t: PolygonTicker): number | null {
  const c = safeNumber(t?.prevDay?.c);
  if (c === null || !(c > 0)) return null;
  return c;
}

/**
 * Regular-session move:
 * (day.c - prevDay.c) / prevDay.c × 100
 * Returns null when either input is missing/invalid — never uses todaysChangePerc.
 */
export function regularChangePercent(t: PolygonTicker): number | null {
  const close = regularClose(t);
  const prev = previousRegularClose(t);
  if (close === null || prev === null || prev === 0) return null;
  const pct = ((close - prev) / prev) * 100;
  if (!Number.isFinite(pct)) return null;
  return pct;
}

/**
 * @deprecated Prefer regularClose for day-session rows. Kept as an alias so
 * call sites that mean "regular last" stay explicit.
 */
export function lastPrice(t: PolygonTicker): number | null {
  return regularClose(t);
}

/**
 * Day high/low from Polygon day.h / day.l.
 * Both valid with low <= high, or both null — never invent partial ranges.
 */
export function dayHighLow(
  t: PolygonTicker,
): { high: number | null; low: number | null } {
  const high = safeNumber(t?.day?.h);
  const low = safeNumber(t?.day?.l);
  if (high === null || low === null) return { high: null, low: null };
  if (!(low <= high)) return { high: null, low: null };
  return { high, low };
}

/**
 * Shared volume-first selection:
 * 1. Reject invalid/missing symbol and non-positive volume
 * 2. Deduplicate by symbol (keep higher volume; symbol tie-break)
 * 3. Sort volume desc, symbol asc
 * 4. Slice to limit
 */
export function selectVolumeFirst(
  candidates: PolygonTicker[],
  limit: number = SCREENER_ROW_LIMIT,
): PolygonTicker[] {
  const bySymbol = new Map<string, PolygonTicker>();

  for (const t of candidates) {
    const sym = normalizeSymbol(t?.ticker);
    if (!sym) continue;
    const vol = dayVolume(t);
    if (vol === null || !(vol > 0)) continue;

    const normalized: PolygonTicker = { ...t, ticker: sym };
    const prev = bySymbol.get(sym);
    if (!prev) {
      bySymbol.set(sym, normalized);
      continue;
    }
    const prevVol = dayVolume(prev)!;
    if (vol > prevVol) {
      bySymbol.set(sym, normalized);
    }
    // Equal volume: keep whichever was stored first (symbol identical).
  }

  return [...bySymbol.values()]
    .sort((a, b) => {
      const va = dayVolume(a)!;
      const vb = dayVolume(b)!;
      if (vb !== va) return vb - va;
      const sa = normalizeSymbol(a.ticker)!;
      const sb = normalizeSymbol(b.ticker)!;
      return sa < sb ? -1 : sa > sb ? 1 : 0;
    })
    .slice(0, Math.max(0, limit));
}

// ── Tab qualification (honest prior-session volume ratio thresholds) ──────

export function qualifiesDayTradeRadar(t: PolygonTicker): boolean {
  const price = regularClose(t);
  const chg = regularChangePercent(t);
  const ratio = rawVolumeRatioPriorSession(t);
  if (price === null || chg === null || ratio === null) return false;
  return price >= 2 && price <= 20 && chg >= 10 && ratio >= 5;
}

export function qualifiesGappers(t: PolygonTicker): boolean {
  const g = gapPercent(t);
  return g !== null && Math.abs(g) >= 5;
}

export function qualifiesVolumeSpikes(t: PolygonTicker): boolean {
  const ratio = rawVolumeRatioPriorSession(t);
  return ratio !== null && ratio >= 3;
}

export function qualifiesUnusualVolume(t: PolygonTicker): boolean {
  const ratio = rawVolumeRatioPriorSession(t);
  return ratio !== null && ratio >= 4;
}

/** Provider-list membership is the only extra qualifier for gainers/losers. */
export function qualifiesGainersLosers(_t: PolygonTicker): boolean {
  return true;
}

export type ScreenerTabId =
  | "day_trade_radar"
  | "gappers"
  | "volume_spikes"
  | "gainers_losers"
  | "unusual_volume";

export const TAB_QUALIFIERS: Record<
  Exclude<ScreenerTabId, never>,
  (t: PolygonTicker) => boolean
> = {
  day_trade_radar: qualifiesDayTradeRadar,
  gappers: qualifiesGappers,
  volume_spikes: qualifiesVolumeSpikes,
  gainers_losers: qualifiesGainersLosers,
  unusual_volume: qualifiesUnusualVolume,
};

/**
 * Apply tab qualification then the shared volume-first selection contract.
 */
export function selectForTab(
  tabId: ScreenerTabId,
  universe: PolygonTicker[],
  limit: number = SCREENER_ROW_LIMIT,
): PolygonTicker[] {
  const qualify = TAB_QUALIFIERS[tabId];
  const qualified = universe.filter(qualify);
  return selectVolumeFirst(qualified, limit);
}
