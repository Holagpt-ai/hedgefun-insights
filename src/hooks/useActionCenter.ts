// Aggregates Action Center data from existing production tables.
// Ownership is derived only from the authenticated session; RLS enforces
// row-level access. Section failures are isolated per query.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  useCatalystEvents,
  useCatalystUserState,
} from "@/hooks/useCatalystEvents";
import {
  buildActionFeed,
  buildFocusTasks,
  catalystWatchList,
  resolveBriefType,
  savedUnreviewedCount,
  summaryCounts,
  watchlistSnapshot,
} from "@/lib/action-center/aggregate";
import type {
  OpenTradeRow,
  ScreenerLeader,
  WatchlistAlertRow,
  WatchlistAnalysisRow,
} from "@/types/action-center";

const REFRESH_MS = 60_000;

export function useActionCenter() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const nowMs = Date.now();

  // 1. Watchlist symbols owned by this user.
  const symbolsQ = useQuery({
    queryKey: ["ac", "watchlist-symbols", userId],
    enabled: !!userId,
    staleTime: REFRESH_MS,
    refetchOnWindowFocus: true,
    refetchInterval: REFRESH_MS,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("watchlists")
        .select("symbol")
        .eq("user_id", userId!);
      if (error) throw error;
      return (data ?? []).map((r) => (r.symbol ?? "").toUpperCase()).filter(Boolean);
    },
  });

  const symbols = symbolsQ.data ?? [];

  // 2. Watchlist V2 alerts (RLS scoped by ticker ownership).
  const alertsQ = useQuery({
    queryKey: ["ac", "alerts", userId, symbols],
    enabled: !!userId && symbols.length > 0,
    staleTime: REFRESH_MS,
    refetchOnWindowFocus: true,
    refetchInterval: REFRESH_MS,
    queryFn: async (): Promise<WatchlistAlertRow[]> => {
      const since = new Date(Date.now() - 24 * 3600_000).toISOString();
      const { data, error } = await supabase
        .from("watchlist_alerts_v2")
        .select("id, ticker, alert_type, reason, facts, event_time, session_date, dedupe_key, created_at")
        .in("ticker", symbols)
        .gte("created_at", since)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WatchlistAlertRow[];
    },
  });

  // 3. Watchlist V2 analyses.
  const analysesQ = useQuery({
    queryKey: ["ac", "analyses", symbols],
    enabled: symbols.length > 0,
    staleTime: REFRESH_MS,
    refetchOnWindowFocus: true,
    refetchInterval: REFRESH_MS,
    queryFn: async (): Promise<WatchlistAnalysisRow[]> => {
      const { data, error } = await supabase
        .from("watchlist_analysis_v2")
        .select("ticker, direction, failure_reason, price, change_pct, volume, rvol, rvol_class, session_type, session_date, analyzed_at, valid_through")
        .in("ticker", symbols);
      if (error) throw error;
      return (data ?? []) as WatchlistAnalysisRow[];
    },
  });

  // 4. Catalyst events (provider_reported enforced by hook).
  const catalystQ = useCatalystEvents({ recentDays: 3, upcomingDays: 7, limit: 200 });
  const userStateQ = useCatalystUserState();

  // 5. Open journal trades — owner is the authenticated session (RLS scoped).
  const tradesQ = useQuery({
    queryKey: ["ac", "open-trades", userId],
    enabled: !!userId,
    staleTime: REFRESH_MS,
    refetchOnWindowFocus: true,
    refetchInterval: REFRESH_MS,
    queryFn: async (): Promise<OpenTradeRow[]> => {
      const { data, error } = await supabase
        .from("journal_trades")
        .select("id, symbol, side, qty, entry_price, entry_date, stop_price, target_price, status")
        .eq("user_id", userId!)
        .eq("status", "open")
        .order("entry_date", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown) as OpenTradeRow[];
    },
  });

  // 6. Volume Leaders — day_trade_radar, ordered by volume desc, limit 10.
  const leadersQ = useQuery({
    queryKey: ["ac", "leaders"],
    staleTime: REFRESH_MS,
    refetchOnWindowFocus: true,
    refetchInterval: REFRESH_MS,
    queryFn: async (): Promise<ScreenerLeader[]> => {
      const { data, error } = await supabase
        .from("screener_results")
        .select("symbol, company_name, price, change_percent, volume, rvol, updated_at")
        .eq("tab_id", "day_trade_radar")
        .order("volume", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as ScreenerLeader[];
    },
  });

  const alerts = alertsQ.data ?? [];
  const analyses = analysesQ.data ?? [];
  const catalyst = catalystQ.data ?? [];
  const userState = userStateQ.data ?? [];
  const openTrades = tradesQ.data ?? [];
  const leaders = leadersQ.data ?? [];

  const saved = useMemo(
    () => new Set(userState.filter((u) => u.saved_at).map((u) => u.event_id)),
    [userState],
  );
  const reviewed = useMemo(
    () => new Set(userState.filter((u) => u.reviewed_at).map((u) => u.event_id)),
    [userState],
  );

  const summary = useMemo(
    () => summaryCounts({ alerts, analyses, catalyst, openTrades, nowMs }),
    [alerts, analyses, catalyst, openTrades, nowMs],
  );

  const snapshot = useMemo(() => watchlistSnapshot(analyses, nowMs), [analyses, nowMs]);

  const feed = useMemo(
    () => buildActionFeed({
      alerts, catalyst, savedEventIds: saved, reviewedEventIds: reviewed, openTrades, nowMs,
    }),
    [alerts, catalyst, saved, reviewed, openTrades, nowMs],
  );

  const savedUnreviewed = useMemo(
    () => savedUnreviewedCount(catalyst, userState),
    [catalyst, userState],
  );

  const tasks = useMemo(
    () => buildFocusTasks({ summary, savedUnreviewedCount: savedUnreviewed }),
    [summary, savedUnreviewed],
  );

  const catalystWatch = useMemo(() => catalystWatchList(catalyst, nowMs, 6), [catalyst, nowMs]);

  const briefType = resolveBriefType(nowMs);

  return {
    briefType,
    summary,
    snapshot,
    feed,
    tasks,
    leaders,
    catalystWatch,
    savedEventIds: saved,
    reviewedEventIds: reviewed,
    errors: {
      alerts: alertsQ.error,
      analyses: analysesQ.error,
      catalyst: catalystQ.error,
      trades: tradesQ.error,
      leaders: leadersQ.error,
    },
    loading: {
      alerts: alertsQ.isLoading,
      analyses: analysesQ.isLoading,
      catalyst: catalystQ.isLoading,
      trades: tradesQ.isLoading,
      leaders: leadersQ.isLoading,
    },
  };
}
