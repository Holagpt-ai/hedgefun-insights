import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface WatchlistAIAnalysis {
  ticker: string;
  hf_score: number;
  hf_score_prev: number | null;
  score_delta: number | null;
  sentiment: "Bearish" | "Neutral" | "Bullish" | "Very Bullish";
  sentiment_prev: string | null;
  confidence: number;
  summary: string;
  reasoning: string[];
  smart_tags: string[];
  signals: Record<string, unknown>;
  analyzed_at: string;
  prev_analyzed_at: string | null;
}

export interface WatchlistAIAlert {
  id: string;
  ticker: string;
  alert_type: string;
  score_from: number | null;
  score_to: number | null;
  sentiment_from: string | null;
  sentiment_to: string | null;
  confidence: number | null;
  reason: string;
  reasoning: string[];
  created_at: string;
}

interface UseWatchlistAIReturn {
  analysis: Record<string, WatchlistAIAnalysis>;
  alerts: WatchlistAIAlert[];
  loading: boolean;
  lastUpdated: Date | null;
  refreshTicker: (ticker: string) => Promise<void>;
  refreshing: Record<string, boolean>;
}

export function useWatchlistAI(tickers: string[]): UseWatchlistAIReturn {
  const [analysis, setAnalysis] = useState<Record<string, WatchlistAIAnalysis>>({});
  const [alerts, setAlerts] = useState<WatchlistAIAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState<Record<string, boolean>>({});

  // ── Initial load ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!tickers.length) return;

    const load = async () => {
      setLoading(true);
      try {
        const [analysisRes, alertsRes] = await Promise.all([
          supabase
            .from("watchlist_ai_analysis")
            .select("*")
            .in("ticker", tickers),
          supabase
            .from("watchlist_ai_alerts")
            .select("*")
            .in("ticker", tickers)
            .order("created_at", { ascending: false })
            .limit(50),
        ]);

        if (analysisRes.data) {
          const map: Record<string, WatchlistAIAnalysis> = {};
          for (const row of analysisRes.data as any[]) {
            map[row.ticker] = {
              ...row,
              reasoning: Array.isArray(row.reasoning) ? row.reasoning : [],
              smart_tags: Array.isArray(row.smart_tags) ? row.smart_tags : [],
              signals: (row.signals as Record<string, unknown>) ?? {},
            };
          }
          setAnalysis(map);
          setLastUpdated(new Date());
        }

        if (alertsRes.data) {
          setAlerts(
            (alertsRes.data as any[]).map((a) => ({
              ...a,
              reasoning: Array.isArray(a.reasoning) ? a.reasoning : [],
            }))
          );
        }
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [tickers.join(",")]);

  // ── Realtime subscription ───────────────────────────────────────────────
  useEffect(() => {
    if (!tickers.length) return;

    const analysisChannel = supabase
      .channel("watchlist_ai_analysis_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "watchlist_ai_analysis" },
        (payload) => {
          const row = payload.new as WatchlistAIAnalysis;
          setAnalysis((prev) => ({
            ...prev,
            [row.ticker]: {
              ...row,
              reasoning: Array.isArray(row.reasoning) ? row.reasoning : [],
              smart_tags: Array.isArray(row.smart_tags) ? row.smart_tags : [],
              signals: (row.signals as Record<string, unknown>) ?? {},
            },
          }));
          setLastUpdated(new Date());
        }
      )
      .subscribe();

    const alertsChannel = supabase
      .channel("watchlist_ai_alerts_changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "watchlist_ai_alerts" },
        (payload) => {
          const row = payload.new as WatchlistAIAlert;
          setAlerts((prev) =>
            [
              { ...row, reasoning: Array.isArray(row.reasoning) ? row.reasoning : [] },
              ...prev,
            ].slice(0, 50)
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(analysisChannel);
      supabase.removeChannel(alertsChannel);
    };
  }, [tickers.join(",")]);

  // ── Manual refresh (user-triggered per ticker) ──────────────────────────
  const refreshTicker = useCallback(async (ticker: string) => {
    setRefreshing((prev) => ({ ...prev, [ticker]: true }));
    try {
      await supabase.functions.invoke("analyze-watchlist-tickers", {
        body: { ticker },
      });
    } finally {
      setRefreshing((prev) => ({ ...prev, [ticker]: false }));
    }
  }, []);

  return { analysis, alerts, loading, lastUpdated, refreshTicker, refreshing };
}
