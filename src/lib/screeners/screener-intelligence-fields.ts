import { computeDailyRvol20d } from "@/lib/screeners/daily-rvol";
import { computeDollarVolume } from "@/lib/screeners/dollar-volume";
import type { ScreenerResultRow } from "@/lib/screeners/contract";

export interface ScreenerIntelligenceDisplayFields {
  /** Prior 20-session average full-day volume. Null until baseline pipeline persists it. */
  avg_volume_20d?: number | null;
  /** Precomputed RVOL 20D when supplied by the data layer. */
  rvol_20d?: number | null;
}

export type ScreenerIntelligenceRow = ScreenerResultRow & ScreenerIntelligenceDisplayFields;

export function resolveDollarVolume(row: Pick<ScreenerResultRow, "price" | "volume">): number | null {
  return computeDollarVolume(row.price, row.volume);
}

export function resolveDailyRvol20d(row: ScreenerIntelligenceRow): number | null {
  return computeDailyRvol20d(row.volume, row.avg_volume_20d);
}
