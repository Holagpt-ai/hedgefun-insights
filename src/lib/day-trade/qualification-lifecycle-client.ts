import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type DayTradePillarPhase = "ACTIVE" | "GRACE" | "EXPIRED";

export type DeskDepartureReason =
  | "PILLAR_EXPIRED"
  | "PILLARS_IN_GRACE"
  | "FRESHNESS_DISQUALIFIED"
  | "OPPORTUNITY_BELOW_THRESHOLD"
  | "TOP10_DISPLACED"
  | "DESK_SELECTION_EXCLUDED";

export type DayTradeQualificationStateRow =
  Database["public"]["Tables"]["day_trade_qualification_state"]["Row"];

export type DayTradeQualificationListResult = DayTradeQualificationStateRow[];

export async function fetchDayTradeQualificationStates(
  sessionDate: string,
): Promise<{ rows: DayTradeQualificationStateRow[]; error: Error | null }> {
  const { data, error } = await supabase.rpc("day_trade_qualification_list_v1", {
    p_session_date: sessionDate,
  });
  if (error) {
    return { rows: [], error: new Error(error.message) };
  }
  return { rows: (data ?? []) as DayTradeQualificationStateRow[], error: null };
}

function asSymbolSet(
  symbols?: ReadonlySet<string> | readonly string[],
): ReadonlySet<string> {
  if (!symbols) return new Set();
  const list = Array.isArray(symbols) ? symbols : [...symbols];
  return new Set(list.map((s) => s.trim().toUpperCase()));
}

/**
 * Monitoring list: previously on the authoritative desk, currently off desk.
 * `activeDeskSymbols` excludes names on the live Top-10 for the same snapshot
 * so a symbol cannot appear on both panels at once.
 */
export function monitoringStates(
  rows: readonly DayTradeQualificationStateRow[],
  activeDeskSymbols?: ReadonlySet<string> | readonly string[],
): DayTradeQualificationStateRow[] {
  const onDesk = asSymbolSet(activeDeskSymbols);
  return rows.filter((row) => {
    const symbol = row.symbol.trim().toUpperCase();
    return (
      row.ever_on_desk &&
      !row.currently_on_desk &&
      row.monitoring_eligible &&
      !onDesk.has(symbol)
    );
  });
}

export function deskDepartureLabel(reason: DeskDepartureReason | null | string): string {
  switch (reason) {
    case "PILLAR_EXPIRED":
      return "Five Pillars expired";
    case "PILLARS_IN_GRACE":
      return "Five Pillars under review (grace)";
    case "FRESHNESS_DISQUALIFIED":
      return "Freshness disqualification";
    case "OPPORTUNITY_BELOW_THRESHOLD":
      return "Opportunity score below desk threshold";
    case "TOP10_DISPLACED":
      return "Top-10 displacement";
    case "DESK_SELECTION_EXCLUDED":
      return "Desk selection exclusion";
    default:
      return "Off desk";
  }
}
