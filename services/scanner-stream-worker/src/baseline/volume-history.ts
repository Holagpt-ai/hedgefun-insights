import type { DailyCache } from "./grouped.ts";

export type VolumeHistoryRow = {
  symbol: string;
  session_date: string;
  volume: number;
};

/** Extract valid grouped-daily volumes from the in-memory cache (zero extra provider calls). */
export function buildVolumeHistoryFromCache(
  cache: DailyCache,
  datesAsc: readonly string[],
  periodStart: string,
  periodEnd: string,
): VolumeHistoryRow[] {
  const rows: VolumeHistoryRow[] = [];
  for (const date of datesAsc) {
    if (date < periodStart || date > periodEnd) continue;
    const dayMap = cache.get(date);
    if (!dayMap) continue;
    for (const [symbol, bar] of dayMap) {
      if (bar.v === null || !(bar.v > 0) || !Number.isFinite(bar.v)) continue;
      rows.push({ symbol, session_date: date, volume: bar.v });
    }
  }
  return rows;
}
