import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  loadVerifiedScreenerGeneration,
  MAX_ROWS_FETCH,
  msUntilStaleTransition,
  type ScreenerFeedState,
  type ScreenerResultRow,
  type ScreenerTabView,
  type ScreenerUiStatus,
} from "@/lib/screeners/contract";

export type { ScreenerResultRow, ScreenerUiStatus };

const STATE_SELECT =
  "state_key,sync_run_id,status,synced_at,provider_as_of_min,provider_as_of_max,rows_inserted,tab_counts,updated_at";

const ROW_SELECT = [
  "tab_id",
  "symbol",
  "company_name",
  "price",
  "change_percent",
  "volume",
  "avg_volume",
  "rvol",
  "float_shares",
  "gap_percent",
  "high_52w",
  "low_52w",
  "market_cap",
  "prior_session_volume",
  "volume_ratio_prior_session",
  "day_high",
  "day_low",
  "provider_as_of",
  "sync_run_id",
  "updated_at",
].join(",");

async function fetchGenerationOnce() {
  const [stateRes, rowsRes] = await Promise.all([
    supabase.from("screener_feed_state").select(STATE_SELECT).eq("state_key", "current"),
    supabase
      .from("screener_results")
      .select(ROW_SELECT)
      .in("tab_id", [
        "day_trade_radar",
        "gappers",
        "volume_spikes",
        "gainers_losers",
        "unusual_volume",
        "new_highs_lows",
      ])
      .order("tab_id", { ascending: true })
      .order("volume", { ascending: false })
      .order("symbol", { ascending: true })
      .limit(MAX_ROWS_FETCH),
  ]);

  return {
    stateRows: (stateRes.data ?? null) as ScreenerFeedState[] | null,
    resultRows: (rowsRes.data ?? null) as ScreenerResultRow[] | null,
    stateError: stateRes.error,
    resultError: rowsRes.error,
  };
}

export function useScreenerData(tabId: string) {
  const [status, setStatus] = useState<ScreenerUiStatus>("loading");
  const [rows, setRows] = useState<ScreenerResultRow[]>([]);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [providerAsOfMax, setProviderAsOfMax] = useState<string | null>(null);

  useEffect(() => {
    if (!tabId) return;
    let cancelled = false;
    let staleTimer: ReturnType<typeof setTimeout> | null = null;
    setStatus("loading");
    setRows([]);
    setSyncedAt(null);
    setProviderAsOfMax(null);

    void (async () => {
      const view: ScreenerTabView = await loadVerifiedScreenerGeneration(
        fetchGenerationOnce,
        { nowMs: Date.now(), activeTabId: tabId },
      );
      if (cancelled) return;
      setStatus(view.status);
      setRows(view.rows);
      setSyncedAt(view.synced_at);
      setProviderAsOfMax(view.provider_as_of_max);

      if (
        (view.status === "available" || view.status === "empty") &&
        view.synced_at
      ) {
        const delay = msUntilStaleTransition(view.synced_at, Date.now());
        if (delay !== null) {
          staleTimer = setTimeout(() => {
            if (cancelled) return;
            setStatus("stale");
          }, delay);
          if (cancelled) {
            clearTimeout(staleTimer);
            staleTimer = null;
          }
        }
      }
    })();

    return () => {
      cancelled = true;
      if (staleTimer !== null) clearTimeout(staleTimer);
    };
  }, [tabId]);

  return { status, rows, syncedAt, providerAsOfMax };
}
