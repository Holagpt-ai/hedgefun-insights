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
import { isRadarV2BackedTab } from "@/lib/screeners/radar-v2-adapter";
import { loadRadarV2Decision } from "@/lib/screeners/radar-v2-source";

export type { ScreenerResultRow, ScreenerUiStatus };

const STATE_SELECT =
  "state_key,sync_run_id,status,synced_at,provider_as_of_min,provider_as_of_max,rows_inserted,tab_counts,nhl_baseline_status,updated_at";

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
  "range_event",
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
    resultRows: (rowsRes.data ?? null) as unknown as ScreenerResultRow[] | null,
    stateError: stateRes.error,
    resultError: rowsRes.error,
  };
}

export interface UseScreenerDataOptions {
  /**
   * Optional background refresh interval (ms). Only Day Trade Radar enables this.
   * Other tabs keep the default one-shot load.
   */
  refreshIntervalMs?: number;
  /** When true (default), pause polling while the document is hidden. */
  pauseWhenHidden?: boolean;
}

export function useScreenerData(
  tabId: string,
  options: UseScreenerDataOptions = {},
) {
  const { refreshIntervalMs, pauseWhenHidden = true } = options;
  const [status, setStatus] = useState<ScreenerUiStatus>("loading");
  const [rows, setRows] = useState<ScreenerResultRow[]>([]);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [providerAsOfMax, setProviderAsOfMax] = useState<string | null>(null);

  useEffect(() => {
    if (!tabId) return;
    let cancelled = false;
    let staleTimer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let hasLoadedOnce = false;

    const clearStaleTimer = () => {
      if (staleTimer !== null) {
        clearTimeout(staleTimer);
        staleTimer = null;
      }
    };

    const applyView = (view: ScreenerTabView, soft: boolean) => {
      if (cancelled) return;
      // Never wipe rows on a failed background refresh.
      if (
        soft &&
        view.status === "unavailable" &&
        hasLoadedOnce
      ) {
        return;
      }
      setStatus(view.status);
      if (
        view.status === "available" ||
        view.status === "stale" ||
        view.status === "empty" ||
        view.status === "initializing"
      ) {
        setRows(view.rows);
        setSyncedAt(view.synced_at);
        setProviderAsOfMax(view.provider_as_of_max);
        hasLoadedOnce = true;
      } else if (!soft) {
        setRows(view.rows);
        setSyncedAt(view.synced_at);
        setProviderAsOfMax(view.provider_as_of_max);
      }

      clearStaleTimer();
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
        }
      }
    };

    const load = async (soft: boolean) => {
      if (!soft) {
        setStatus("loading");
        setRows([]);
        setSyncedAt(null);
        setProviderAsOfMax(null);
        hasLoadedOnce = false;
      }

      // Preferred source during an active (pre-market) session: Radar V2
      // candidate intelligence. Falls back to the verified screener_results
      // path when Radar V2 is not the preferred/fresh source for this tab.
      if (isRadarV2BackedTab(tabId)) {
        const decision = await loadRadarV2Decision(tabId, Date.now());
        if (decision.source === "radar-v2" && decision.view) {
          applyView({ ...decision.view, attempts: 1 }, soft);
          return;
        }
      }

      const view: ScreenerTabView = await loadVerifiedScreenerGeneration(
        fetchGenerationOnce,
        { nowMs: Date.now(), activeTabId: tabId },
      );
      applyView(view, soft);
    };

    void load(false);

    if (
      typeof refreshIntervalMs === "number" &&
      refreshIntervalMs > 0
    ) {
      pollTimer = setInterval(() => {
        if (cancelled) return;
        if (pauseWhenHidden && typeof document !== "undefined" && document.hidden) {
          return;
        }
        void load(true);
      }, refreshIntervalMs);
    }

    return () => {
      cancelled = true;
      clearStaleTimer();
      if (pollTimer !== null) clearInterval(pollTimer);
    };
  }, [tabId, refreshIntervalMs, pauseWhenHidden]);

  return { status, rows, syncedAt, providerAsOfMax };
}
