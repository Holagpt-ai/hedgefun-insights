import type { DayTradeQualificationStateRow } from "@/lib/day-trade/qualification-lifecycle-client";
import { deskDepartureLabel } from "@/lib/day-trade/qualification-lifecycle-client";
import type { RadarRankedRow } from "@/features/day-trade-radar-v2/types";
import { formatEtClock } from "@/lib/screeners/screener-trigger-time";

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

export function formatQualificationPhaseLabel(state: DayTradeQualificationStateRow): string {
  if (state.pillar_phase === "EXPIRED" || state.pillar_expired_at) return "Five Pillars expired";
  if (state.pillar_phase === "GRACE") return "Five Pillars under review";
  if (state.pillar_phase === "ACTIVE" && state.five_pillars_pass) {
    return "Five Pillars passed · off the desk";
  }
  return deskDepartureLabel(state.last_desk_departure_reason);
}

export function formatQualifiedMonitoringSubtitle(state: DayTradeQualificationStateRow): string {
  const phase = formatQualificationPhaseLabel(state);
  const observed = formatEtClock(state.provider_as_of ?? state.last_qualified_at);
  const observedPart = observed ? ` · last market observation ${observed}` : "";
  const status =
    state.monitoring_data_status === "STALE"
      ? " · monitoring data stale"
      : state.monitoring_data_status === "UNAVAILABLE"
      ? " · monitoring data unavailable"
      : "";
  return `Previously qualified · ${phase} · 15-minute delayed market data${observedPart}${status}. A prior pass does not qualify the current session.`;
}

export function qualifiedPanelMetaLine(state: DayTradeQualificationStateRow): string {
  const first = formatEtClock(state.first_qualified_at);
  const departed = formatEtClock(state.last_desk_departure_at);
  const parts = [
    first ? `First qualified ${first}` : null,
    departed ? `Left desk ${departed}` : null,
    state.five_pillars_pass ? "Five Pillars: pass" : "Five Pillars: fail",
    "Off-desk names stay on this panel for the session until a later market-data check expires the pillars or the name returns to the desk.",
  ].filter(Boolean);
  return parts.join(" · ");
}
