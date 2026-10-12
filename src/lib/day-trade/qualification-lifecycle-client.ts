import { supabase } from "@/integrations/supabase/client";

export type DayTradeQualificationPhase = "ACTIVE" | "GRACE" | "EXPIRED";

export type DayTradeQualificationStateRow = {
  session_date: string;
  symbol: string;
  phase: DayTradeQualificationPhase | null;
  first_qualified_at: string | null;
  last_qualified_at: string | null;
  grace_first_failure_at: string | null;
  grace_failure_count: number;
  expired_at: string | null;
  expiration_reason_codes: string[];
  pillar_outcomes: Record<string, string> | null;
  monitored_price: number | null;
  monitored_volume: number | null;
  provider_as_of: string | null;
  prior_episodes: unknown[];
  updated_at: string;
};

export async function fetchDayTradeQualificationStates(
  sessionDate: string,
): Promise<DayTradeQualificationStateRow[]> {
  const { data, error } = await supabase.rpc(
    "day_trade_qualification_list_v1" as never,
    { p_session_date: sessionDate } as never,
  );
  if (error || !Array.isArray(data)) return [];
  return data as DayTradeQualificationStateRow[];
}

export function monitoringStates(
  rows: readonly DayTradeQualificationStateRow[],
): DayTradeQualificationStateRow[] {
  return rows.filter((row) => row.phase === "EXPIRED" && row.expired_at && row.first_qualified_at);
}
