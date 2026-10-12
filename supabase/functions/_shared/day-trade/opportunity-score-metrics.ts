import { DAY_TRADE_RADAR_MIN_OPPORTUNITY_SCORE } from "./radar-opportunity.config.ts";
import type { DayTradeMetricsRow } from "./evaluate-five-pillars.ts";

function finite(n: unknown): number | null {
  if (n === null || n === undefined) return null;
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

/** Lightweight opportunity score aligned with desk threshold semantics. */
export function scoreOpportunityFromMetrics(
  row: DayTradeMetricsRow,
  _marketDataMs: number,
  freshnessPass: boolean,
): { score: number; eligible: boolean } {
  let score = 0;
  const move = finite(row.change_percent);
  if (move !== null) score += Math.min(Math.max(move, 0), 40) * 1.2;
  const vel = finite(row.vol_velocity);
  if (vel !== null) score += Math.log10(vel + 1) * 14;
  const rvol5 = finite(row.rvol_5m);
  if (rvol5 !== null) score += Math.min(rvol5, 30) * 2;
  const vol = finite(row.volume);
  if (vol !== null) score += Math.log10(vol + 1) * 8;
  if (freshnessPass) score += 12;
  const eligible = score >= DAY_TRADE_RADAR_MIN_OPPORTUNITY_SCORE;
  return { score, eligible };
}

export { DAY_TRADE_RADAR_MIN_OPPORTUNITY_SCORE };
