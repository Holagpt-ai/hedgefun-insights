import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  easternDate,
  viewRadarV22Generation,
  type RadarV22BoardRow,
  type RadarV22FeedState,
} from "@/lib/radar-v22";
import type { AmScreenerShadowRow } from "./types";

const SCREENER_SELECT =
  "symbol,company_name,price,change_percent,volume,rvol,updated_at,provider_as_of";

const STATE_SELECT =
  "state_key,generation_id,status,session_date,synced_at,provider_as_of_min,provider_as_of_max,last_provider_event_at,symbol_count,feed_stale,updated_at";

const BOARD_SELECT = [
  "generation_id",
  "rank",
  "symbol",
  "company_name",
  "lifecycle",
  "signal_status",
  "price",
  "change_percent",
  "volume",
  "prior_session_volume",
  "volume_ratio_prior_session",
  "day_high",
  "day_low",
  "rolling_volume_5s",
  "rolling_volume_15s",
  "rolling_volume_60s",
  "rolling_dollar_volume_60s",
  "acceleration_5m",
  "session_vwap",
  "peak_volume_15s",
  "provider_as_of",
  "updated_at",
].join(",");

export type LoadedShadowFeeds = {
  screenerRows: AmScreenerShadowRow[] | null;
  screenerError: string | null;
  v22RawState: RadarV22FeedState | null;
  v22RawRows: RadarV22BoardRow[] | null;
  v22Error: string | null;
};

export async function loadAmRadarShadowFeeds(
  client: SupabaseClient,
): Promise<LoadedShadowFeeds> {
  const [screenerRes, stateRes, boardRes] = await Promise.all([
    client
      .from("screener_results")
      .select(SCREENER_SELECT)
      .eq("tab_id", "day_trade_radar")
      .order("volume", { ascending: false, nullsFirst: false })
      .limit(24),
    client.from("radar_v22_feed_state").select(STATE_SELECT).eq("state_key", "current"),
    client.from("radar_v22_board").select(BOARD_SELECT).order("rank", { ascending: true }).limit(21),
  ]);

  return {
    screenerRows: screenerRes.error ? null : ((screenerRes.data ?? []) as AmScreenerShadowRow[]),
    screenerError: screenerRes.error?.message ?? null,
    v22RawState: stateRes.error
      ? null
      : ((stateRes.data?.[0] ?? null) as RadarV22FeedState | null),
    v22RawRows: boardRes.error ? null : ((boardRes.data ?? []) as unknown as RadarV22BoardRow[]),
    v22Error: stateRes.error?.message ?? boardRes.error?.message ?? null,
  };
}

export function viewFromLoadedFeeds(feeds: LoadedShadowFeeds, nowMs: number) {
  const stateRows = feeds.v22RawState ? [feeds.v22RawState] : null;
  return viewRadarV22Generation(stateRows, feeds.v22RawRows, easternDate(nowMs));
}

export function createAnonClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
