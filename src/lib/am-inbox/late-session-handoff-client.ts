import { supabase } from "@/integrations/supabase/client";
import type { PersistedLateSessionHandoffRow } from "@/lib/am-inbox/late-session-handoff-persistence";

export async function fetchActiveLateSessionHandoffs(
  amSessionDate: string,
): Promise<PersistedLateSessionHandoffRow[]> {
  if (!amSessionDate) return [];
  const { data, error } = await supabase.rpc("late_session_handoff_list_active_v1", {
    p_am_session_date: amSessionDate,
  });
  if (error) throw error;
  return (data ?? []) as PersistedLateSessionHandoffRow[];
}
