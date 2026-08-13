/**
 * Verified New Highs / Lows qualification against a prior-52-week baseline.
 * Never infers 52-week values from day / prevDay / last price / todaysChangePerc.
 */

import {
  dayHighLow,
  dayVolume,
  normalizeSymbol,
  type PolygonTicker,
  regularClose,
  SCREENER_ROW_LIMIT,
  selectVolumeFirst,
} from "./selection.ts";

export type RangeEvent = "new_high" | "new_low" | "both";

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

export function isValidBaselineQuote(
  row: NhlBaselineQuote | null | undefined,
): row is NhlBaselineQuote {
  if (!row) return false;
  const sym = normalizeSymbol(row.symbol);
  if (!sym) return false;
  if (!Number.isFinite(row.high_52w) || !(row.high_52w > 0)) return false;
  if (!Number.isFinite(row.low_52w) || !(row.low_52w > 0)) return false;
  if (!(row.low_52w <= row.high_52w)) return false;
  if (!Number.isInteger(row.sessions_observed) || row.sessions_observed <= 0) {
    return false;
  }
  return true;
}

/**
 * Classify a snapshot against a validated prior baseline.
 * Exact high/low equality qualifies. Missing day range does not.
 */
export function classifyNewHighLow(
  t: PolygonTicker,
  baseline: NhlBaselineQuote | null | undefined,
): RangeEvent | null {
  const sym = normalizeSymbol(t?.ticker);
  if (!sym) return null;
  const vol = dayVolume(t);
  if (vol === null || !(vol > 0)) return null;
  const price = regularClose(t);
  if (price === null || !(price > 0)) return null;
  if (!isValidBaselineQuote(baseline)) return null;
  if (normalizeSymbol(baseline.symbol) !== sym) return null;

  const range = dayHighLow(t);
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
): NhlClassification[] {
  if (baselines.size === 0) return [];

  const qualified: PolygonTicker[] = [];
  for (const t of universe) {
    const sym = normalizeSymbol(t?.ticker);
    if (!sym) continue;
    if (classifyNewHighLow(t, baselines.get(sym)) === null) continue;
    qualified.push(t);
  }

  const ordered = selectVolumeFirst(qualified, limit);
  const out: NhlClassification[] = [];
  for (const t of ordered) {
    const sym = normalizeSymbol(t.ticker)!;
    const baseline = baselines.get(sym)!;
    const event = classifyNewHighLow(t, baseline);
    if (event === null) continue;
    out.push({
      ticker: t,
      range_event: event,
      high_52w: baseline.high_52w,
      low_52w: baseline.low_52w,
    });
  }
  return out;
}
