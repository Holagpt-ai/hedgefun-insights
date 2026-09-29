/**
 * Verified float used by Day Trade qualification and the Day Trade leader/table.
 * A missing lookup leaves the row unchanged so an unknown float stays unknown.
 */

import { finiteMetric } from "@/lib/screeners/screener-metric-display";
import { buildAuthoritativeDayTradeDesk } from "./day-trade-desk";
import type { DayTradeRadarOpportunityBoard } from "./day-trade-desk";
import type { RadarRankedRow } from "./types";

export function verifiedPositiveFloat(value: number | null | undefined): number | null {
  const n = finiteMetric(value);
  if (n === null || n <= 0) return null;
  return n;
}

export function enrichDayTradeRowsWithVerifiedFloat<T extends { symbol: string; float_shares?: number | null }>(
  rows: readonly T[],
  verifiedFloatForSymbol: (symbol: string) => number | null | undefined,
): T[] {
  return rows.map((row) => {
    const verified = verifiedPositiveFloat(verifiedFloatForSymbol(row.symbol));
    if (verified === null) return row;
    if (row.float_shares === verified) return row;
    return { ...row, float_shares: verified };
  });
}

/**
 * Day Trade qualification and the Day Trade leader/table share this value.
 * Other panels keep their own fetched float.
 */
export function displayedFloatForRadarPanel(
  panel: string,
  row: { float_shares?: number | null },
  fetchedFloat: number | null,
): number | null {
  if (panel === "day_trade") return verifiedPositiveFloat(row.float_shares);
  return fetchedFloat;
}

/** Stable identity for the verified floats currently known for these rows. */
export function verifiedFloatLookupKey(
  rows: readonly { symbol: string }[],
  verifiedFloatForSymbol: (symbol: string) => number | null | undefined,
): string {
  return rows
    .map((row) => {
      const value = verifiedPositiveFloat(verifiedFloatForSymbol(row.symbol));
      return `${row.symbol}=${value ?? ""}`;
    })
    .join("|");
}

export function verifiedFloatFromLookupKey(lookupKey: string, symbol: string): number | null {
  const prefix = `${symbol}=`;
  for (const entry of lookupKey.split("|")) {
    if (entry.slice(0, prefix.length) !== prefix) continue;
    const raw = entry.slice(prefix.length);
    if (!raw) return null;
    return verifiedPositiveFloat(Number(raw));
  }
  return null;
}

/** Enrich verified float, then build the Day Trade desk. */
export function buildDayTradeDeskWithVerifiedFloat(
  rankedUniverse: readonly RadarRankedRow[],
  nowMs: number,
  verifiedFloatForSymbol: (symbol: string) => number | null | undefined,
): DayTradeRadarOpportunityBoard {
  return buildAuthoritativeDayTradeDesk(
    enrichDayTradeRowsWithVerifiedFloat(rankedUniverse, verifiedFloatForSymbol),
    nowMs,
  );
}
