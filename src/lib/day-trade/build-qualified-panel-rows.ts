import type { DayTradeQualificationStateRow } from "@/lib/day-trade/qualification-lifecycle-client";
import type { RadarRankedRow } from "@/features/day-trade-radar-v2/types";
import { toCanonicalUtcTimestamp } from "@/lib/screeners/trigger-time";

export function mergeRankedRowWithQualificationState(
  ranked: RadarRankedRow | undefined,
  state: DayTradeQualificationStateRow,
): RadarRankedRow {
  if (ranked) return ranked;
  return {
    symbol: state.symbol,
    company_name: state.symbol,
    price: state.monitored_price,
    change_percent: null,
    volume: state.monitored_volume,
    rank: 999,
    access_rank: 999,
    provider_as_of: state.provider_as_of,
  } as RadarRankedRow;
}

export function formatQualifiedMonitoringSubtitle(providerAsOf: string | null): string {
  const canonical = toCanonicalUtcTimestamp(providerAsOf);
  const base = "Previously Qualified · Monitoring · 15-minute delayed market data";
  if (!canonical) return base;
  return `${base} · source ${canonical}`;
}
