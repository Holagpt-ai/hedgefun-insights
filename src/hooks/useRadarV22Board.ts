import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  RADAR_V22_POLL_MS,
  easternDate,
  viewRadarV22Generation,
  type RadarV22BoardRow,
  type RadarV22FeedState,
  type RadarV22View,
} from "@/lib/radar-v22";

const STATE_SELECT =
  "state_key,generation_id,status,session_date,synced_at,provider_as_of_min,provider_as_of_max,last_provider_event_at,symbol_count,feed_stale,updated_at";

const ROW_SELECT = [
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

async function fetchV22Once(nowMs: number): Promise<RadarV22View> {
  const [stateRes, rowsRes] = await Promise.all([
    supabase.from("radar_v22_feed_state").select(STATE_SELECT).eq("state_key", "current"),
    supabase
      .from("radar_v22_board")
      .select(ROW_SELECT)
      .order("rank", { ascending: true })
      .limit(21),
  ]);
  if (stateRes.error || rowsRes.error) {
    return viewRadarV22Generation(null, null, easternDate(nowMs));
  }
  return viewRadarV22Generation(
    (stateRes.data ?? null) as RadarV22FeedState[] | null,
    (rowsRes.data ?? null) as unknown as RadarV22BoardRow[] | null,
    easternDate(nowMs),
  );
}

export function useRadarV22Board() {
  const [view, setView] = useState<RadarV22View>(() =>
    viewRadarV22Generation(null, null, easternDate(Date.now())),
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const next = await fetchV22Once(Date.now());
      if (!cancelled) setView(next);
    };
    void load();

    const channel = supabase
      .channel("radar-v22-feed-state")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "radar_v22_feed_state" },
        () => {
          void load();
        },
      )
      .subscribe();

    const poll = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void load();
    }, RADAR_V22_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, []);

  return view;
}
