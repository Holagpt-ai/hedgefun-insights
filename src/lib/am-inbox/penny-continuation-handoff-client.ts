import { supabase } from "@/integrations/supabase/client";
import {
  PENNY_CONTINUATION_HANDOFF_LIST_DEFAULT_LIMIT,
  PENNY_CONTINUATION_HANDOFF_LIST_MAX_LIMIT,
} from "@/lib/am-inbox/penny-continuation-handoff-config";
import type { PersistedPennyContinuationHandoffRow } from "@/lib/am-inbox/penny-continuation-handoff-persistence";

export async function fetchActivePennyContinuationHandoffs(
  amSessionDate: string,
  limit: number = PENNY_CONTINUATION_HANDOFF_LIST_DEFAULT_LIMIT,
): Promise<PersistedPennyContinuationHandoffRow[]> {
  if (!amSessionDate) return [];
  const bounded = Math.min(
    Math.max(1, Math.floor(limit)),
    PENNY_CONTINUATION_HANDOFF_LIST_MAX_LIMIT,
  );
  const { data, error } = await supabase.rpc(
    "penny_continuation_handoff_list_active_v1",
    {
      p_am_session_date: amSessionDate,
      p_limit: bounded,
    },
  );
  if (error) throw error;
  return (data ?? []) as unknown as PersistedPennyContinuationHandoffRow[];
}
