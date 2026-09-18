/**
 * Client mirror of supabase/functions/_shared/screeners/resolve-rvol20d.ts
 */

import { computeDailyRvol20d } from "@/lib/screeners/daily-rvol";
import {
  rvol20dFromBaseline,
  type VolumeBaselineQuote,
} from "@/lib/screeners/volume-baseline";

function finiteOrNull(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

export function resolveRvol20dFromSources(opts: {
  volume: number | null | undefined;
  symbol: string;
  persistedRvol20d?: unknown;
  persistedAvgVolume20d?: unknown;
  baselines?: ReadonlyMap<string, VolumeBaselineQuote>;
  tradingDate: string;
}): number | null {
  const persisted = finiteOrNull(opts.persistedRvol20d);
  if (persisted !== null && persisted >= 0) return persisted;

  const fromAvg = computeDailyRvol20d(
    opts.volume,
    finiteOrNull(opts.persistedAvgVolume20d),
  );
  if (fromAvg !== null) return fromAvg;

  if (opts.baselines) {
    return rvol20dFromBaseline(
      opts.volume,
      opts.baselines.get(opts.symbol) ?? null,
      opts.tradingDate,
    ).rvol_20d;
  }

  return null;
}
