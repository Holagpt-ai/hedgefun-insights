import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  viewAfterHoursGeneration,
  type AfterHoursFeedState,
  type AfterHoursMoverResult,
  type AfterHoursUiStatus,
  type AfterHoursView,
} from "@/lib/after-hours-feed";

const STATE_SELECT =
  "state_key,generation_id,status,session_date,synced_at,provider_as_of_min,provider_as_of_max,gainer_count,loser_count,updated_at";

const ROW_SELECT = [
  "generation_id",
  "side",
  "rank",
  "symbol",
  "company_name",
  "extended_last",
  "regular_close",
  "change_percent",
  "change_amount",
  "volume",
  "observation_source",
  "provider_as_of",
  "updated_at",
].join(",");

export function useAfterHoursFeed() {
  const [view, setView] = useState<AfterHoursView>({
    status: "loading",
    sessionDate: null,
    syncedAt: null,
    providerAsOfMax: null,
    gainers: [],
    losers: [],
  });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [stateRes, rowsRes] = await Promise.all([
        supabase.from("after_hours_feed_state").select(STATE_SELECT).eq("state_key", "current"),
        supabase
          .from("after_hours_mover_results")
          .select(ROW_SELECT)
          .order("side", { ascending: true })
          .order("rank", { ascending: true })
          .limit(41),
      ]);
      if (cancelled) return;
      if (stateRes.error || rowsRes.error) {
        setView({
          status: "unavailable",
          sessionDate: null,
          syncedAt: null,
          providerAsOfMax: null,
          gainers: [],
          losers: [],
        });
        return;
      }
      setView(
        viewAfterHoursGeneration(
          (stateRes.data ?? null) as AfterHoursFeedState[] | null,
          (rowsRes.data ?? null) as unknown as AfterHoursMoverResult[] | null,
          Date.now(),
        ),
      );
    };
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return view;
}

export type { AfterHoursUiStatus };
