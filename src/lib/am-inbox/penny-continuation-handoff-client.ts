import { supabase } from "@/integrations/supabase/client";
import {
  PENNY_CONTINUATION_HANDOFF_READ_MAX_PAIRS,
  PENNY_CONTINUATION_HANDOFF_READ_PROJECTION_VERSION,
  type PennyHandoffReadPair,
} from "@/lib/am-inbox/penny-continuation-handoff-config";
import { mapPennyHandoffReadProjections } from "@/lib/am-inbox/penny-continuation-handoff-persistence";
import type { PennyContinuationWorkflowHandoff } from "@/lib/am-inbox/penny-continuation-workflow-types";
import type { PennyContinuationHandoffReadProjection } from "@/lib/am-inbox/penny-continuation-handoff-persistence";

function normalizePairs(
  pairs: readonly PennyHandoffReadPair[],
): { symbol: string; source_session_date: string }[] | null {
  if (pairs.length === 0 || pairs.length > PENNY_CONTINUATION_HANDOFF_READ_MAX_PAIRS) {
    return null;
  }
  const seen = new Set<string>();
  const out: { symbol: string; source_session_date: string }[] = [];
  for (const pair of pairs) {
    const symbol = pair.symbol.trim().toUpperCase();
    const source_session_date = pair.sourceSessionDate.trim();
    if (!symbol || !/^\d{4}-\d{2}-\d{2}$/.test(source_session_date)) return null;
    const key = `${source_session_date}:${symbol}`;
    if (seen.has(key)) return null;
    seen.add(key);
    out.push({ symbol, source_session_date });
  }
  return out;
}

export async function fetchPennyContinuationHandoffsForCandidates(
  amSessionDate: string,
  pairs: readonly PennyHandoffReadPair[],
): Promise<PennyContinuationWorkflowHandoff[]> {
  const normalized = normalizePairs(pairs);
  if (!amSessionDate || !normalized) return [];
  const { data, error } = await (supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: Error | null }>)(
    "penny_continuation_handoff_list_active_v1",
    {
      p_am_session_date: amSessionDate,
      p_pairs: normalized,
    },
  );
  if (error) throw error;
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  const body = data as Record<string, unknown>;
  if (body.error) return [];
  if (body.projection_version !== PENNY_CONTINUATION_HANDOFF_READ_PROJECTION_VERSION) {
    return [];
  }
  const items = Array.isArray(body.items) ? body.items : [];
  return mapPennyHandoffReadProjections(
    items as PennyContinuationHandoffReadProjection[],
  );
}
