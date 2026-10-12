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

export function monitoringStates(
  rows: readonly DayTradeQualificationStateRow[],
): DayTradeQualificationStateRow[] {
  return rows.filter(
    (row) => row.ever_on_desk && !row.currently_on_desk && row.monitoring_eligible,
  );
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
