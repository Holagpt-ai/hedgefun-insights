/**
 * Verified New Highs / Lows qualification against a prior-52-week baseline.
 * Never infers 52-week values from day / prevDay / last price / todaysChangePerc.
 */

import { isCoherent52WeekRange } from "./baseline-corporate-action.ts";
import {
  currentSessionReferencePrice,
  dayHighLow,
  normalizeSymbol,
  type PolygonTicker,
  SCREENER_ROW_LIMIT,
  selectVolumeFirst,
} from "./selection.ts";
import {
  extendedQuoteSemanticsForObservation,
  sessionQualificationVolume,
  type SessionVolumeContext,
} from "./session-volume.ts";

export type RangeEvent = "new_high" | "new_low" | "both";

/** Minimum completed sessions before a 52-week event is treated as verified. */
export const NHL_VERIFIED_MIN_SESSIONS = 120;

export type NhlBaselineQuote = {
  symbol: string;
  high_52w: number;
  low_52w: number;
  sessions_observed: number;
};

export type NhlBaselineStatus = "available" | "initializing" | "unavailable";

export type NhlClassification = {
  ticker: PolygonTicker;
  range_event: RangeEvent;
  high_52w: number;
  low_52w: number;
};

/** Baseline with enough observed sessions for verified 52-week breakout qualification. */
export function isVerifiedNhlBaseline(
  row: NhlBaselineQuote | null | undefined,
): row is NhlBaselineQuote {
  return isValidBaselineQuote(row) &&
    row.sessions_observed >= NHL_VERIFIED_MIN_SESSIONS;
}

export function isValidBaselineQuote(
  row: NhlBaselineQuote | null | undefined,
): row is NhlBaselineQuote {
  if (!row) return false;
  const sym = normalizeSymbol(row.symbol);
  if (!sym) return false;
  if (!Number.isFinite(row.high_52w) || !(row.high_52w > 0)) return false;
  if (!Number.isFinite(row.low_52w) || !(row.low_52w > 0)) return false;
  if (!(row.low_52w <= row.high_52w)) return false;
  if (!isCoherent52WeekRange(row.high_52w, row.low_52w)) return false;
  if (!Number.isInteger(row.sessions_observed) || row.sessions_observed <= 0) {
    return false;
  }
  return true;
}

/**
 * Session range used for NHL — always Polygon day.h/day.l (never last/min alone).
 * Extended sync still requires a trustworthy day aggregate; live last alone
 * cannot prove a 52-week crossing.
 */
export function nhlObservationDayRange(
  t: PolygonTicker,
): { high: number | null; low: number | null } {
  return dayHighLow(t);
}

/**
 * Classify a snapshot against a validated prior baseline.
 * Exact high/low equality qualifies. Missing day range does not.
 */
export function classifyNewHighLow(
  t: PolygonTicker,
  baseline: NhlBaselineQuote | null | undefined,
  extendedSession = false,
  volumeCtx?: SessionVolumeContext,
  observationSessionFields = false,
  nowMs?: number,
): RangeEvent | null {
  const sym = normalizeSymbol(t?.ticker);
  if (!sym) return null;
  const ctx: SessionVolumeContext = volumeCtx ?? {
    extendedSession,
    observationSessionVolume: observationSessionFields,
    nowMs,
  };
  if (sessionQualificationVolume(t, ctx) === null) return null;
  let priceExtended = extendedSession;
  if (observationSessionFields && nowMs !== undefined) {
    const ext = extendedQuoteSemanticsForObservation(t, nowMs, ctx);
    if (ext === null) return null;
    priceExtended = ext;
  }
  const price = currentSessionReferencePrice(t, priceExtended);
  if (price === null || !(price > 0)) return null;
  if (!isVerifiedNhlBaseline(baseline)) return null;
  if (normalizeSymbol(baseline.symbol) !== sym) return null;

  const range = nhlObservationDayRange(t);
  if (range.high === null || range.low === null) return null;

  const isHigh = range.high >= baseline.high_52w;
  const isLow = range.low <= baseline.low_52w;
  if (isHigh && isLow) return "both";
  if (isHigh) return "new_high";
  if (isLow) return "new_low";
  return null;
}

export function selectNewHighsLows(
  universe: PolygonTicker[],
  baselines: ReadonlyMap<string, NhlBaselineQuote>,
  limit: number = SCREENER_ROW_LIMIT,
  extendedSession = false,
  nowMs?: number,
  observationSessionFields = false,
  sessionVolumeCache?: SessionVolumeContext["cache"],
): NhlClassification[] {
  if (baselines.size === 0) return [];

  const volumeCtx: SessionVolumeContext = {
    extendedSession,
    observationSessionVolume: observationSessionFields,
    nowMs,
    cache: sessionVolumeCache,
  };
  const classified = new Map<string, {
    ticker: PolygonTicker;
    event: RangeEvent;
    baseline: NhlBaselineQuote;
  }>();
  for (const t of universe) {
    const sym = normalizeSymbol(t?.ticker);
    if (!sym) continue;
    const baseline = baselines.get(sym);
    const event = classifyNewHighLow(
      t,
      baseline,
      extendedSession,
      volumeCtx,
      observationSessionFields,
      nowMs,
    );
    if (event === null) continue;
    classified.set(sym, {
      ticker: t,
      event,
      baseline: baseline!,
    });
  }

  const ordered = selectVolumeFirst(
    [...classified.values()].map((c) => c.ticker),
    limit,
    volumeCtx,
  );
  const out: NhlClassification[] = [];
  for (const t of ordered) {
    const sym = normalizeSymbol(t.ticker)!;
    const row = classified.get(sym);
    if (!row) continue;
    out.push({
      ticker: t,
      range_event: row.event,
      high_52w: row.baseline.high_52w,
      low_52w: row.baseline.low_52w,
    });
  }
  return out;
}
