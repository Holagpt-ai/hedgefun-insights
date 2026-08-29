/**
 * In-order 52-week high/low accumulation. Retrying a processed date is a no-op.
 */

import { isValidHighLow, normalizeSymbol, tryBarNumeric } from "./grouped-daily.ts";

export type StagingRow = {
  symbol: string;
  high_52w: number;
  low_52w: number;
  high_date: string;
  low_date: string;
  sessions_observed: number;
};

export type DayBar = {
  symbol: string;
  h: number;
  l: number;
};

export type BaselinePublishRow = {
  symbol: string;
  period_start: string;
  period_end: string;
  high_52w: number;
  low_52w: number;
  high_candidates: Array<{ d: string; v: number }>;
  low_candidates: Array<{ d: string; v: number }>;
  sessions_observed: number;
  provider_as_of: string;
};

export function parseDayBar(raw: unknown): DayBar | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const row = raw as { symbol?: unknown; h?: unknown; l?: unknown };
  const symbol = normalizeSymbol(row.symbol);
  if (!symbol) return null;
  const h = tryBarNumeric(row.h);
  const l = tryBarNumeric(row.l);
  if (h === null || l === null) return null;
  if (!isValidHighLow(h, l)) return null;
  return { symbol, h, l };
}

export function applyBaselineDay(
  staging: Map<string, StagingRow>,
  processed: Set<string>,
  date: string,
  bars: unknown[],
): { applied: boolean; skipped: boolean } {
  if (processed.has(date)) return { applied: false, skipped: true };

  for (const raw of bars) {
    const bar = parseDayBar(raw);
    if (!bar) continue;
    const existing = staging.get(bar.symbol);
    if (!existing) {
      staging.set(bar.symbol, {
        symbol: bar.symbol,
        high_52w: bar.h,
        low_52w: bar.l,
        high_date: date,
        low_date: date,
        sessions_observed: 1,
      });
      continue;
    }
    const next: StagingRow = {
      ...existing,
      sessions_observed: existing.sessions_observed + 1,
    };
    if (bar.h >= existing.high_52w) {
      next.high_52w = bar.h;
      next.high_date = date;
    }
    if (bar.l <= existing.low_52w) {
      next.low_52w = bar.l;
      next.low_date = date;
    }
    staging.set(bar.symbol, next);
  }

  processed.add(date);
  return { applied: true, skipped: false };
}

export function publishableBaselineRows(
  staging: Map<string, StagingRow>,
  minSessions: number,
  periodStart: string,
  periodEnd: string,
  providerAsOf: string,
): BaselinePublishRow[] {
  const rows: BaselinePublishRow[] = [];
  for (const row of staging.values()) {
    if (row.sessions_observed < minSessions) continue;
    if (!isValidHighLow(row.high_52w, row.low_52w)) continue;
    rows.push({
      symbol: row.symbol,
      period_start: periodStart,
      period_end: periodEnd,
      high_52w: row.high_52w,
      low_52w: row.low_52w,
      high_candidates: [{ d: row.high_date, v: row.high_52w }],
      low_candidates: [{ d: row.low_date, v: row.low_52w }],
      sessions_observed: row.sessions_observed,
      provider_as_of: providerAsOf,
    });
  }
  rows.sort((a, b) => a.symbol.localeCompare(b.symbol));
  return rows;
}
