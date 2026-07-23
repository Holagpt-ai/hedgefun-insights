import { useCallback, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  parseIntradayBars,
  parseDriverIds,
  parseMarketSignals,
  parseRecentEvents,
  parseKeyLevels,
  parseInputsQuality,
  isDirection,
  isRvolClass,
  humanFailureReason,
  type IntradayBar,
  type MarketSignal,
  type RecentEvent,
  type KeyLevels,
  type InputsQuality,
  type V2Direction,
  type V2Session,
  type RvolClass,
} from "@/lib/watchlist-v2/parsers";

export interface V2Row {
  ticker: string;
  companyName: string | null;
  direction: V2Direction;
  explanation: string;
  failureReason: string | null;
  price: number | null;
  changePct: number | null;
  volume: number | null;
  rvol: number | null;
  rvolClass: RvolClass | null;
  sessionType: V2Session;
  sessionDate: string;
  analyzedAt: string;
  validThrough: string;
  intraday: IntradayBar[];
  driverIds: string[];
  marketSignals: MarketSignal[];
  recentEvents: RecentEvent[];
  keyLevels: KeyLevels;
  inputsQuality: InputsQuality;
  requestStatus: "pending" | "failed" | "succeeded" | "none";
  requestError: string | null;
  hasV2: boolean;
}

type WatchlistRow = { id: string; symbol: string; added_at: string | null };

export function useWatchlistV2() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const userId = user?.id ?? null;

  // 1. User's watchlist symbols (RLS enforces ownership).
  const watchlistQuery = useQuery<WatchlistRow[]>({
    queryKey: ["watchlist-v2", "symbols", userId],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("watchlists")
        .select("id, symbol, added_at")
        .eq("user_id", userId!)
        .order("added_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        symbol: (r.symbol ?? "").toUpperCase(),
        added_at: r.added_at,
      }));
    },
  });

  const symbols = useMemo(
    () => (watchlistQuery.data ?? []).map((r) => r.symbol),
    [watchlistQuery.data],
  );

  // 2. V2 analysis rows for those tickers (public read policy exists; the
  //    surface is still gated to the user's own watchlist symbols).
  const analysisQuery = useQuery({
    queryKey: ["watchlist-v2", "analysis", symbols],
    enabled: symbols.length > 0,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("watchlist_analysis_v2")
        .select("*")
        .in("ticker", symbols);
      if (error) throw error;
      return data ?? [];
    },
  });

  // 3. Ticker company names from ticker_search (best-effort).
  const namesQuery = useQuery({
    queryKey: ["watchlist-v2", "names", symbols],
    enabled: symbols.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticker_search")
        .select("symbol, name")
        .in("symbol", symbols);
      if (error) return {} as Record<string, string>;
      const map: Record<string, string> = {};
      for (const r of data ?? []) {
        if (r.symbol && r.name) map[r.symbol.toUpperCase()] = r.name;
      }
      return map;
    },
  });

  // 4. Latest requests per ticker for this user.
  const requestsQuery = useQuery({
    queryKey: ["watchlist-v2", "requests", userId, symbols],
    enabled: !!userId && symbols.length > 0,
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("watchlist_analysis_requests")
        .select("ticker, status, error_code, requested_at, completed_at")
        .eq("user_id", userId!)
        .in("ticker", symbols)
        .order("requested_at", { ascending: false });
      if (error) throw error;
      const latest: Record<
        string,
        { status: string; error_code: string | null; requested_at: string }
      > = {};
      for (const r of data ?? []) {
        const t = r.ticker.toUpperCase();
        if (!latest[t]) {
          latest[t] = {
            status: r.status,
            error_code: r.error_code,
            requested_at: r.requested_at,
          };
        }
      }
      return latest;
    },
  });

  // Realtime — refresh on any V2 change for this user's symbols.
  useEffect(() => {
    if (!userId || symbols.length === 0) return;
    const ch = supabase
      .channel(`wl-v2-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "watchlist_analysis_v2" },
        (payload) => {
          const t = (payload.new as { ticker?: string } | null)?.ticker
            ?? (payload.old as { ticker?: string } | null)?.ticker;
          if (t && symbols.includes(t.toUpperCase())) {
            qc.invalidateQueries({ queryKey: ["watchlist-v2", "analysis"] });
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "watchlist_alerts_v2" },
        () => {
          qc.invalidateQueries({ queryKey: ["watchlist-v2", "analysis"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "watchlist_analysis_requests", filter: `user_id=eq.${userId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["watchlist-v2", "requests"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, symbols, qc]);

  // Compose rows.
  const rows: V2Row[] = useMemo(() => {
    const analysisMap: Record<string, unknown> = {};
    for (const a of analysisQuery.data ?? []) {
      const rec = a as { ticker: string };
      analysisMap[rec.ticker.toUpperCase()] = a;
    }
    const nameMap = namesQuery.data ?? {};
    const reqMap = requestsQuery.data ?? {};

    return symbols.map((sym) => {
      const raw = analysisMap[sym] as Record<string, unknown> | undefined;
      const req = reqMap[sym];
      const requestStatus: V2Row["requestStatus"] =
        req?.status === "pending" || req?.status === "failed" || req?.status === "succeeded"
          ? req.status
          : "none";
      const requestError = req?.error_code ? humanFailureReason(req.error_code) : null;

      if (!raw) {
        return {
          ticker: sym,
          companyName: nameMap[sym] ?? null,
          direction: "data_unavailable" as V2Direction,
          explanation: "",
          failureReason: null,
          price: null,
          changePct: null,
          volume: null,
          rvol: null,
          rvolClass: null,
          sessionType: "rth" as V2Session,
          sessionDate: "",
          analyzedAt: "",
          validThrough: "",
          intraday: [],
          driverIds: [],
          marketSignals: [],
          recentEvents: [],
          keyLevels: parseKeyLevels(null),
          inputsQuality: {},
          requestStatus,
          requestError,
          hasV2: false,
        };
      }

      const direction = isDirection(raw.direction) ? raw.direction : "data_unavailable";
      const sessionType =
        raw.session_type === "premarket" || raw.session_type === "rth" || raw.session_type === "postclose"
          ? (raw.session_type as V2Session)
          : "rth";
      const rvolClass = isRvolClass(raw.rvol_class) ? raw.rvol_class : null;

      return {
        ticker: sym,
        companyName: nameMap[sym] ?? null,
        direction,
        explanation: typeof raw.explanation === "string" ? raw.explanation : "",
        failureReason: typeof raw.failure_reason === "string" ? raw.failure_reason : null,
        price: typeof raw.price === "number" && Number.isFinite(raw.price) ? raw.price : null,
        changePct:
          typeof raw.change_pct === "number" && Number.isFinite(raw.change_pct) ? raw.change_pct : null,
        volume: typeof raw.volume === "number" && Number.isFinite(raw.volume) ? raw.volume : null,
        rvol: typeof raw.rvol === "number" && Number.isFinite(raw.rvol) ? raw.rvol : null,
        rvolClass,
        sessionType,
        sessionDate: typeof raw.session_date === "string" ? raw.session_date : "",
        analyzedAt: typeof raw.analyzed_at === "string" ? raw.analyzed_at : "",
        validThrough: typeof raw.valid_through === "string" ? raw.valid_through : "",
        intraday: parseIntradayBars(raw.intraday),
        driverIds: parseDriverIds(raw.driver_ids),
        marketSignals: parseMarketSignals(raw.market_signals),
        recentEvents: parseRecentEvents(raw.recent_events),
        keyLevels: parseKeyLevels(raw.key_levels),
        inputsQuality: parseInputsQuality(raw.inputs_quality),
        requestStatus,
        requestError,
        hasV2: true,
      };
    });
  }, [symbols, analysisQuery.data, namesQuery.data, requestsQuery.data]);

  // Manual refresh — invokes V2 analyzer with ticker only.
  const refreshMutation = useMutation({
    mutationFn: async (ticker: string) => {
      const upper = ticker.toUpperCase();
      const { data, error } = await supabase.functions.invoke(
        "analyze-watchlist-tickers-v2",
        { body: { ticker: upper } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["watchlist-v2", "analysis"] });
      qc.invalidateQueries({ queryKey: ["watchlist-v2", "requests"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Refresh failed";
      toast.error("Refresh failed", { description: msg });
    },
  });

  const addMutation = useMutation({
    mutationFn: async (symbol: string) => {
      if (!userId) throw new Error("not_authenticated");
      const upper = symbol.toUpperCase();
      const { error } = await supabase
        .from("watchlists")
        .insert({ user_id: userId, symbol: upper });
      if (error) throw error;
      // Kick off V2 analysis honestly — don't rely on V1 trigger for V2.
      try {
        await supabase.functions.invoke("analyze-watchlist-tickers-v2", {
          body: { ticker: upper },
        });
      } catch {
        // Non-fatal: row will show "Analysis pending" until next batch.
      }
      return upper;
    },
    onSuccess: (upper) => {
      qc.invalidateQueries({ queryKey: ["watchlist-v2"] });
      toast.success(`${upper} added`, { description: "Analysis pending." });
    },
    onError: (err: unknown, symbol) => {
      const e = err as { code?: string; message?: string };
      if (e?.code === "23505") {
        toast.info(`${String(symbol).toUpperCase()} is already in your watchlist`);
        return;
      }
      toast.error("Failed to add", { description: e?.message });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (symbol: string) => {
      if (!userId) throw new Error("not_authenticated");
      const upper = symbol.toUpperCase();
      // Delete only THIS user's watchlist row — never touch V2 analysis/history/alerts.
      const { error } = await supabase
        .from("watchlists")
        .delete()
        .eq("user_id", userId)
        .eq("symbol", upper);
      if (error) throw error;
      return upper;
    },
    onSuccess: (upper) => {
      qc.invalidateQueries({ queryKey: ["watchlist-v2"] });
      toast.success(`${upper} removed`);
    },
  });

  const refresh = useCallback((ticker: string) => refreshMutation.mutate(ticker), [refreshMutation]);
  const addSymbol = useCallback((s: string) => addMutation.mutate(s), [addMutation]);
  const removeSymbol = useCallback((s: string) => removeMutation.mutate(s), [removeMutation]);

  return {
    isAuthenticated: !!userId,
    isLoading:
      watchlistQuery.isLoading ||
      (symbols.length > 0 && (analysisQuery.isLoading || requestsQuery.isLoading)),
    rows,
    refresh,
    isRefreshing: refreshMutation.isPending,
    refreshingSymbol:
      refreshMutation.isPending && typeof refreshMutation.variables === "string"
        ? refreshMutation.variables.toUpperCase()
        : null,
    addSymbol,
    removeSymbol,
    isAdding: addMutation.isPending,
    isRemoving: removeMutation.isPending,
  };
}
