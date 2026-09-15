/**
 * Backward-compatible screener_feed_state reads.
 *
 * Rollout: apply migration (tab_evaluation_evidence column) before selecting it.
 * Pre-migration callers receive null evidence without failing the whole load.
 */

import { supabase } from "@/integrations/supabase/client";
import type { ScreenerFeedState } from "@/lib/screeners/contract";

export const SCREENER_FEED_STATE_SELECT_BASE =
  "state_key,sync_run_id,status,synced_at,provider_as_of_min,provider_as_of_max,rows_inserted,tab_counts,nhl_baseline_status,updated_at";

export const SCREENER_FEED_STATE_SELECT_WITH_EVIDENCE = `${SCREENER_FEED_STATE_SELECT_BASE.replace(",updated_at", "")},tab_evaluation_evidence,updated_at`;

function isMissingEvidenceColumnError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const message = String((error as { message?: unknown }).message ?? "").toLowerCase();
  return (
    message.includes("tab_evaluation_evidence") &&
    (message.includes("does not exist") ||
      message.includes("could not find") ||
      message.includes("column"))
  );
}

export async function fetchScreenerFeedState(): Promise<{
  stateRows: ScreenerFeedState[] | null;
  stateError: unknown;
}> {
  const withEvidence = await supabase
    .from("screener_feed_state")
    .select(SCREENER_FEED_STATE_SELECT_WITH_EVIDENCE)
    .eq("state_key", "current");

  if (!withEvidence.error) {
    return {
      stateRows: (withEvidence.data ?? null) as ScreenerFeedState[] | null,
      stateError: null,
    };
  }

  if (!isMissingEvidenceColumnError(withEvidence.error)) {
    return { stateRows: null, stateError: withEvidence.error };
  }

  const base = await supabase
    .from("screener_feed_state")
    .select(SCREENER_FEED_STATE_SELECT_BASE)
    .eq("state_key", "current");

  return {
    stateRows: (base.data ?? null) as ScreenerFeedState[] | null,
    stateError: base.error,
  };
}
