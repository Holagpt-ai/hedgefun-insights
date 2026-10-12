import type { PolygonTicker } from "../screeners/selection.ts";
import {
  regularChangePercent,
  regularClose,
  volumeRatioPriorSession,
} from "../screeners/selection.ts";
import type { DayTradeMetricsRow } from "./evaluate-five-pillars.ts";

function finitePositive(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || !(n > 0)) return null;
  return n;
}

export function mapPolygonToDayTradeMetrics(input: {
  ticker: PolygonTicker;
  floatShares?: number | null;
  rvol20d?: number | null;
  avgVolume20d?: number | null;
}): DayTradeMetricsRow | null {
  const symbol = typeof input.ticker.ticker === "string"
    ? input.ticker.ticker.trim().toUpperCase()
    : "";
  if (!symbol) return null;

  const updated = typeof input.ticker.updated === "number"
    ? new Date(input.ticker.updated / 1_000_000).toISOString()
    : typeof input.ticker.updated === "string"
    ? input.ticker.updated
    : null;

  const dayVol = finitePositive(input.ticker.day?.v);

  return {
    symbol,
    price: regularClose(input.ticker),
    change_percent: regularChangePercent(input.ticker),
    float_shares: input.floatShares ?? null,
    volume_ratio_prior_session: volumeRatioPriorSession(input.ticker),
    prior_session_volume: finitePositive(input.ticker.prevDay?.v),
    rvol_5m: null,
    time_adjusted_rvol: null,
    rvol_20d: input.rvol20d ?? null,
    avg_volume_20d: input.avgVolume20d ?? null,
    volume: dayVol,
    provider_as_of: updated,
  };
}
