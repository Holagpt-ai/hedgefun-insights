import type { RadarV22CandidateRow } from "../radar-v22/persistence-v2.ts";
import type { DayTradeMetricsRow } from "./evaluate-five-pillars.ts";

function finite(n: unknown): number | null {
  if (n === null || n === undefined) return null;
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

function sessionMovePct(row: RadarV22CandidateRow): number | null {
  const price = finite(row.last_price);
  const prev = finite(row.previous_close);
  if (price === null || prev === null || prev === 0) return null;
  const pct = ((price - prev) / prev) * 100;
  return Number.isFinite(pct) ? pct : null;
}

export function mapV22CandidateToDayTradeMetrics(
  row: RadarV22CandidateRow,
  floatShares?: number | null,
): DayTradeMetricsRow {
  const ratio =
    finite(row.prior_session_volume) !== null &&
      finite(row.prior_session_volume)! > 0 &&
      finite(row.session_volume) !== null
      ? finite(row.session_volume)! / finite(row.prior_session_volume)!
      : null;

  return {
    symbol: row.symbol.trim().toUpperCase(),
    price: finite(row.last_price),
    change_percent: sessionMovePct(row),
    float_shares: floatShares ?? null,
    volume_ratio_prior_session: ratio,
    prior_session_volume: finite(row.prior_session_volume) !== null
      ? Math.trunc(finite(row.prior_session_volume)!)
      : null,
    rvol_5m: finite(row.rvol_5m),
    time_adjusted_rvol: finite(row.time_adjusted_rvol),
    rvol_20d: null,
    avg_volume_20d: null,
    volume: finite(row.session_volume) !== null
      ? Math.trunc(finite(row.session_volume)!)
      : null,
    provider_as_of: row.provider_as_of,
  };
}
