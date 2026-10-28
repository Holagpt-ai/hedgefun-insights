import { dedupeCatalyst } from "./contract.ts";
import { EARNINGS_CALENDAR_FETCH_LIMIT } from "./earnings-market-impact.ts";

export interface EarningsCalendarSourceStats {
  rawRowCount: number;
  dedupedRowCount: number;
  fetchLimit: number;
  sourceTruncated: boolean;
}

/** Stats for honest completeness disclosure when the bounded calendar query hits its cap. */
export function assessEarningsCalendarSource<T extends { id?: unknown; dedupe_key?: unknown }>(
  rawRows: readonly T[] | null,
): EarningsCalendarSourceStats {
  const rawRowCount = rawRows?.length ?? 0;
  const deduped = rawRows ? dedupeCatalyst([...rawRows]) : [];
  return {
    rawRowCount,
    dedupedRowCount: deduped.length,
    fetchLimit: EARNINGS_CALENDAR_FETCH_LIMIT,
    sourceTruncated: rawRowCount >= EARNINGS_CALENDAR_FETCH_LIMIT,
  };
}
