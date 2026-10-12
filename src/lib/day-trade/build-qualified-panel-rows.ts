import type { DayTradeQualificationStateRow } from "@/lib/day-trade/qualification-lifecycle-client";
import { deskDepartureLabel } from "@/lib/day-trade/qualification-lifecycle-client";
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

export function formatQualifiedMonitoringSubtitle(state: DayTradeQualificationStateRow): string {
  const delay = "15-minute delayed market data";
  const source = toCanonicalUtcTimestamp(state.provider_as_of);
  const reason = deskDepartureLabel(state.last_desk_departure_reason);
  const status =
    state.monitoring_data_status === "STALE"
      ? " · monitoring data stale"
      : state.monitoring_data_status === "UNAVAILABLE"
      ? " · monitoring data unavailable"
      : "";
  const sourcePart = source ? ` · source ${source}` : "";
  return `Previously Qualified · Monitoring · ${reason} · ${delay}${sourcePart}${status}`;
}

export function qualifiedPanelMetaLine(state: DayTradeQualificationStateRow): string {
  const first = state.first_qualified_at ? toCanonicalUtcTimestamp(state.first_qualified_at) : null;
  const departed = state.last_desk_departure_at
    ? toCanonicalUtcTimestamp(state.last_desk_departure_at)
    : null;
  const parts = [
    first ? `First qualified ${first}` : null,
    departed ? `Left desk ${departed}` : null,
    state.five_pillars_pass ? "Five Pillars: pass" : "Five Pillars: fail",
  ].filter(Boolean);
  return parts.join(" · ");
}
