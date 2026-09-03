/**
 * Radar V2 screener data-layer source (D5).
 *
 * Thin Supabase reader for `radar_v22_feed_state` (V2 columns) and
 * `radar_v22_candidates`, feeding the pure `buildRadarV2Decision` adapter.
 * Kept out of the visual table components and out of the pure adapter so the
 * mapping stays unit-testable without a database.
 *
 * The generated Supabase types do not yet include the Persistence V2 columns
 * (`v2_generation_id`, `v2_synced_at`, `candidate_count`, `session_kind`, …) or
 * the `radar_v22_candidates` table. We do NOT edit the schema or regenerate
 * types in this sprint; instead we read through an untyped client view and cast
 * to the narrow adapter row shapes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  buildRadarV2Decision,
  isRadarV2BackedTab,
  RADAR_V2_CANDIDATE_CAP,
  type RadarV2CandidateRow,
  type RadarV2Decision,
  type RadarV2FeedStateRow,
} from "@/lib/screeners/radar-v2-adapter";

const FEED_SELECT =
  "state_key,session_kind,sentinel_enabled,candidate_count,v2_generation_id," +
  "v2_synced_at,last_receive_at,last_provider_event_at,feed_stale,updated_at";

const CANDIDATE_SELECT = [
  "symbol",
  "generation_id",
  "trading_date",
  "session_kind",
  "lifecycle",
  "signal_status",
  "last_price",
  "move_15s_pct",
  "move_60s_pct",
  "volume_5s",
  "volume_15s",
  "volume_60s",
  "session_volume",
  "dollar_volume_60s",
  "acceleration_5m",
  "session_high",
  "session_low",
  "distance_from_hod_pct",
  "session_vwap",
  "vwap_side",
  "freshness_class",
  "provider_as_of",
  "updated_at",
].join(",");

/** Untyped view of the client for tables/columns not in the generated types. */
function untyped(): SupabaseClient {
  return supabase as unknown as SupabaseClient;
}

export interface RadarV2FetchResult {
  feedRows: RadarV2FeedStateRow[] | null;
  candidateRows: RadarV2CandidateRow[] | null;
  error: unknown;
}

export async function fetchRadarV2Once(): Promise<RadarV2FetchResult> {
  const db = untyped();
  const [feedRes, candRes] = await Promise.all([
    db.from("radar_v22_feed_state").select(FEED_SELECT).eq("state_key", "current"),
    db.from("radar_v22_candidates").select(CANDIDATE_SELECT).limit(RADAR_V2_CANDIDATE_CAP),
  ]);
  if (feedRes.error || candRes.error) {
    return { feedRows: null, candidateRows: null, error: feedRes.error ?? candRes.error };
  }
  return {
    feedRows: (feedRes.data ?? null) as unknown as RadarV2FeedStateRow[] | null,
    candidateRows: (candRes.data ?? null) as unknown as RadarV2CandidateRow[] | null,
    error: null,
  };
}

/**
 * Fetch + decide. For tabs that are not Radar-backed, or on any read error, this
 * returns a `fallback` decision so the caller uses the existing verified path.
 */
export async function loadRadarV2Decision(
  tabId: string,
  nowMs: number,
): Promise<RadarV2Decision> {
  if (!isRadarV2BackedTab(tabId)) {
    return { source: "fallback", reason: "tab_not_radar_backed", session: null, view: null };
  }
  let fetched: RadarV2FetchResult;
  try {
    fetched = await fetchRadarV2Once();
  } catch {
    return { source: "fallback", reason: "radar_v2_fetch_threw", session: null, view: null };
  }
  if (fetched.error) {
    return { source: "fallback", reason: "radar_v2_fetch_error", session: null, view: null };
  }
  return buildRadarV2Decision({
    feedRows: fetched.feedRows,
    candidateRows: fetched.candidateRows,
    tabId,
    nowMs,
  });
}
