import { useState, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AdBanner } from "@/components/layout/AdBanner";
import { IndexSparklineCards } from "@/components/home/IndexSparklineCards";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { searchTickers, EXCHANGE_LABELS, type SearchResult } from "@/lib/search-tickers";
import { toast } from "sonner";
import { useWatchlistAI } from "@/hooks/useWatchlistAI";
import {
  Search,
  Star,
  Trash2,
  ChevronDown,
  Pencil,
  RefreshCw,
  Lock,
  Brain,
  ChevronRight,
  ChevronUp,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { format, parseISO, isToday, isYesterday, formatDistanceToNow } from "date-fns";

function cleanCompanyName(name: string): string {
  return name
    .replace(/,?\s*(Common Stock|Ordinary Shares?|American Depositary Shares?|Depositary Shares?|Class [A-Z]( Common Stock)?|Series [A-Z]|ADS|ADR|Units?|Warrants?|Rights?).*$/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function abbreviateNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatDateLabel(dateStr: string): string {
  const d = parseISO(dateStr);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMM d, yyyy");
}

function sentimentColor(sentiment: string): string {
  if (sentiment === "Very Bullish") return "text-emerald-600";
  if (sentiment === "Bullish") return "text-green-600";
  if (sentiment === "Neutral") return "text-amber-500";
  return "text-red-500";
}

function sentimentBg(sentiment: string): string {
  if (sentiment === "Very Bullish") return "bg-emerald-50 border-emerald-200";
  if (sentiment === "Bullish") return "bg-green-50 border-green-200";
  if (sentiment === "Neutral") return "bg-amber-50 border-amber-200";
  return "bg-red-50 border-red-100";
}

function scoreColor(score: number): string {
  if (score >= 75) return "#059669";
  if (score >= 51) return "#16a34a";
  if (score >= 31) return "#d97706";
  return "#dc2626";
}

function HFScoreRing({ score, size = 52 }: { score: number; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  const color = scoreColor(score);
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={4} />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={4}
          strokeDasharray={`${fill} ${circ}`}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute text-xs font-bold" style={{ color }}>{score}</span>
    </div>
  );
}

function SmartTag({ tag }: { tag: string }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent/60 text-foreground/70 border border-border/50">
      {tag}
    </span>
  );
}

function AIMonitorBar({
  tickerCount,
  alertCount,
  lastUpdated,
}: {
  tickerCount: number;
  alertCount: number;
  lastUpdated: Date | null;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 mb-3 rounded-lg border border-border bg-card text-sm flex-wrap">
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="font-semibold text-foreground">HF AI Monitor</span>
      </div>
      <span className="text-muted-foreground">
        Watching <strong className="text-foreground">{tickerCount}</strong> stocks
      </span>
      <span className="text-muted-foreground hidden sm:inline">·</span>
      <span className="text-muted-foreground hidden sm:inline">
        <strong className="text-foreground">{alertCount}</strong> alerts today
      </span>
      {lastUpdated && (
        <>
          <span className="text-muted-foreground hidden sm:inline">·</span>
          <span className="text-muted-foreground hidden sm:inline">
            Last analysis{" "}
            <strong className="text-foreground">
              {formatDistanceToNow(lastUpdated, { addSuffix: true })}
            </strong>
          </span>
        </>
      )}
      <div className="ml-auto flex items-center gap-1.5">
        <Brain className="h-3.5 w-3.5 text-accent-blue" />
        <span className="text-xs text-accent-blue font-medium">LIVE</span>
      </div>
    </div>
  );
}

interface WatchlistEntryType {
  id: string;
  symbol: string;
}

interface AIAnalysisType {
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

interface AIAlertType {
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

function WatchlistStockRow({
  entry,
  snap,
  nameMap,
  tickerNames,
  aiData,
  aiAlerts,
  onRemove,
  refreshing,
  onRefresh,
}: {
  entry: WatchlistEntryType;
  snap: Record<string, unknown> | undefined;
  nameMap: Record<string, string> | undefined;
  tickerNames: Record<string, string>;
  aiData: AIAnalysisType | undefined;
  aiAlerts: AIAlertType[];
  onRemove: (id: string, symbol: string) => void;
  refreshing: boolean;
  onRefresh: (ticker: string) => void;
}) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const symbol = entry.symbol;
  const name = cleanCompanyName(nameMap?.[symbol] || tickerNames[symbol] || symbol);

  const snapAny = snap as Record<string, Record<string, number>> | undefined;
  const dayClose = snapAny?.day?.c;
  const minClose = snapAny?.min?.c;
  const lastTrade = snapAny?.lastTrade?.p;
  const prevClose = snapAny?.prevDay?.c;
  const price =
    dayClose && dayClose > 0 ? dayClose
    : minClose && minClose > 0 ? minClose
    : lastTrade && lastTrade > 0 ? lastTrade
    : prevClose && prevClose > 0 ? prevClose
    : 0;
  const snapNum = snap as Record<string, number> | undefined;
  const changePct = snapNum?.todaysChangePerc ?? 0;
  const volume = (snapAny?.day?.v ?? 0) > 0 ? snapAny!.day.v : (snapAny?.min?.av ?? 0);
  const pricePos = changePct >= 0;
  const tickerAlerts = aiAlerts.filter((a) => a.ticker === symbol).slice(0, 3);

  return (
    <div className={cn("fintech-card mb-2 overflow-hidden transition-all duration-200", expanded && "ring-1 ring-accent-blue/30")}>
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <button
              onClick={() => navigate(`/stocks/${symbol.toLowerCase()}`)}
              className="ticker-symbol text-accent-blue hover:underline text-sm font-bold"
            >
              {symbol}
            </button>
            <span className="text-xs text-muted-foreground truncate max-w-[160px]">{name}</span>
          </div>
          {aiData?.smart_tags?.length ? (
            <div className="flex flex-wrap gap-1 mt-1">
              {aiData.smart_tags.slice(0, 3).map((tag) => (
                <SmartTag key={tag} tag={tag} />
              ))}
            </div>
          ) : null}
        </div>

        <div className="text-right min-w-[72px]">
          <div className="text-sm font-semibold tabular-nums text-foreground">
            {price > 0 ? `$${price.toFixed(2)}` : "—"}
          </div>
          <div className={cn("text-xs tabular-nums font-medium", pricePos ? "price-positive" : "price-negative")}>
            {pricePos ? "+" : ""}{changePct.toFixed(2)}%
          </div>
        </div>

        <div className="text-right min-w-[56px] hidden sm:block">
          <div className="text-xs text-muted-foreground">Vol</div>
          <div className="text-xs tabular-nums text-foreground">
            {volume > 0 ? abbreviateNumber(volume) : "—"}
          </div>
        </div>

        <div className="flex flex-col items-center min-w-[56px]">
          {aiData ? (
            <>
              <HFScoreRing score={aiData.hf_score} size={44} />
              {aiData.score_delta !== null && aiData.score_delta !== 0 && (
                <span className={cn("text-[10px] font-medium mt-0.5", aiData.score_delta > 0 ? "text-emerald-600" : "text-red-500")}>
                  {aiData.score_delta > 0 ? "▲" : "▼"} {Math.abs(aiData.score_delta)}
                </span>
              )}
            </>
          ) : (
            <div className="h-11 w-11 rounded-full border-4 border-border bg-surface flex items-center justify-center">
              <span className="text-[10px] text-muted-foreground">—</span>
            </div>
          )}
        </div>

        <div className="min-w-[160px] max-w-[220px] hidden md:block">
          {aiData ? (
            <>
              <div className={cn("text-xs font-semibold mb-0.5", sentimentColor(aiData.sentiment))}>
                {aiData.sentiment}
              </div>
              <div className="text-[11px] text-muted-foreground leading-snug line-clamp-2">
                {aiData.summary}
              </div>
            </>
          ) : (
            <div className="text-xs text-muted-foreground">No AI analysis yet</div>
          )}
        </div>

        <div className="flex items-center gap-1.5 ml-auto shrink-0">
          <button
            onClick={() => onRefresh(symbol)}
            disabled={refreshing}
            className="text-muted-foreground hover:text-accent-blue transition-colors p-1"
            title="Refresh AI analysis"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          </button>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={() => onRemove(entry.id, symbol)}
            className="text-muted-foreground hover:text-destructive transition-colors p-1"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {expanded && aiData && (
        <div className="border-t border-border px-4 py-3 bg-surface/50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Brain className="h-3.5 w-3.5 text-accent-blue" />
                <span className="text-xs font-semibold text-foreground">AI Analysis</span>
                <span className={cn("ml-auto text-xs font-semibold", sentimentColor(aiData.sentiment))}>
                  {aiData.sentiment}
                </span>
                <span className="text-xs text-muted-foreground">· {aiData.confidence}% confidence</span>
              </div>
              <div className={cn("rounded-md border p-2.5 mb-2", sentimentBg(aiData.sentiment))}>
                <p className="text-xs text-foreground leading-relaxed">{aiData.summary}</p>
              </div>
              {aiData.reasoning?.length > 0 && (
                <ul className="space-y-1">
                  {aiData.reasoning.map((r, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <span className="text-accent-blue mt-0.5 shrink-0">•</span>
                      {r}
                    </li>
                  ))}
                </ul>
              )}
              {aiData.analyzed_at && (
                <p className="text-[10px] text-muted-foreground mt-2">
                  Last analyzed {formatDistanceToNow(new Date(aiData.analyzed_at), { addSuffix: true })}
                </p>
              )}
            </div>

            <div>
              <div className="text-xs font-semibold text-foreground mb-2">Recent AI Alerts</div>
              {tickerAlerts.length === 0 ? (
                <p className="text-xs text-muted-foreground">No alerts yet for {symbol}.</p>
              ) : (
                <div className="space-y-2">
                  {tickerAlerts.map((alert) => (
                    <div key={alert.id} className="rounded-md border border-border bg-card p-2">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {alert.score_to !== null && alert.score_from !== null && alert.score_to > alert.score_from
                          ? <TrendingUp className="h-3 w-3 text-emerald-600" />
                          : <TrendingDown className="h-3 w-3 text-red-500" />
                        }
                        <span className="text-xs font-medium text-foreground capitalize">
                          {alert.alert_type.replace("_", " ")}
                        </span>
                        {alert.score_from !== null && alert.score_to !== null && (
                          <span className="text-xs text-muted-foreground ml-auto">
                            {alert.score_from} → {alert.score_to}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">{alert.reason}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const WatchlistPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const searchRef = useRef<HTMLDivElement>(null);
  const [tickerNames, setTickerNames] = useState<Record<string, string>>({});
  const [newsLimit, setNewsLimit] = useState(20);

  const { data: watchlistEntries, isLoading: wlLoading } = useQuery({
    queryKey: ["watchlist", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("watchlists")
        .select("id, symbol")
        .eq("user_id", user!.id)
        .order("added_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const symbols = useMemo(() => (watchlistEntries ?? []).map((e) => e.symbol), [watchlistEntries]);

  const { analysis, alerts, lastUpdated, refreshTicker, refreshing } = useWatchlistAI(symbols);

  const { data: snapshotData } = useQuery({
    queryKey: ["watchlist-snapshots", symbols],
    queryFn: async () => {
      if (symbols.length === 0) return {};
      const results: Record<string, unknown> = {};
      await Promise.all(
        symbols.map(async (sym) => {
          try {
            const { data, error } = await supabase.functions.invoke("get-watchlist-data", { body: { ticker: sym } });
            if (error) throw error;
            results[sym] = data;
          } catch { /* skip */ }
        })
      );
      return results;
    },
    enabled: symbols.length > 0,
    refetchInterval: 60_000,
  });

  const { data: nameMap } = useQuery({
    queryKey: ["watchlist-names", symbols],
    queryFn: async () => {
      if (symbols.length === 0) return {};
      const { data } = await supabase.from("ticker_search").select("symbol, name").in("symbol", symbols);
      const map: Record<string, string> = {};
      (data ?? []).forEach((r) => { map[r.symbol] = r.name; });
      return map;
    },
    enabled: symbols.length > 0,
    staleTime: 5 * 60_000,
  });

  const { data: news, isLoading: newsLoading } = useQuery({
    queryKey: ["watchlist-news", newsLimit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_news")
        .select("*")
        .order("published_at", { ascending: false })
        .limit(newsLimit);
      if (error) throw error;
      return data;
    },
  });

  const addMutation = useMutation({
    mutationFn: async (symbol: string) => {
      const { error } = await supabase.from("watchlists").insert({ symbol: symbol.toUpperCase(), user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: async (_d, symbol) => {
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
      trackEvent("watchlist_add", { ticker: symbol });
      toast.success(`${symbol.toUpperCase()} added to watchlist`);
      const { data } = await supabase.from("ticker_search").select("name").eq("symbol", symbol.toUpperCase()).limit(1).maybeSingle();
      if (data?.name) setTickerNames((prev) => ({ ...prev, [symbol.toUpperCase()]: data.name }));
    },
    onError: (err: unknown, symbol) => {
      const e = err as { code?: string; message?: string };
      if (e?.code === "23505") toast.info(`${symbol.toUpperCase()} is already in your watchlist`);
      else toast.error("Failed to add to watchlist", { description: e?.message });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async ({ id, symbol }: { id: string; symbol: string }) => {
      const { error } = await supabase.from("watchlists").delete().eq("id", id);
      if (error) throw error;
      return symbol;
    },
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: ["watchlist"] });
      const prev = queryClient.getQueryData(["watchlist", user?.id]);
      queryClient.setQueryData(["watchlist", user?.id], (old: WatchlistEntryType[] | undefined) => old?.filter((w) => w.id !== id) ?? []);
      return { prev };
    },
    onError: (_e: unknown, _v: unknown, ctx: { prev: unknown } | undefined) => {
      if (ctx?.prev) queryClient.setQueryData(["watchlist", user?.id], ctx.prev);
    },
    onSettled: (_d: unknown, _e: unknown, vars: { id: string; symbol: string } | undefined) => {
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
      if (vars) trackEvent("watchlist_remove", { ticker: vars.symbol });
    },
  });

  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setSearchResults([]);
      setShowSearchResults(false);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        let data = await searchTickers(value);
        if (!data || data.length === 0) {
          const { data: rows } = await supabase
            .from("ticker_search")
            .select("symbol, name, exchange, type")
            .or(`symbol.ilike.${value.toUpperCase()}%,name.ilike.%${value}%`)
            .eq("active", true)
            .order("symbol")
            .limit(10);
          data = (rows ?? []).map((r) => ({ ticker: r.symbol, name: r.name, exchange: r.exchange, type: r.type }));
        }
        setSearchResults(data);
        setShowSearchResults(true);
      } catch {
        setSearchResults([]);
        setShowSearchResults(true);
      }
      setIsSearching(false);
    }, 200);
  }, []);

  const handleSelectResult = (r: SearchResult) => {
    addMutation.mutate(r.ticker);
    setSearchQuery("");
    setSearchResults([]);
    setShowSearchResults(false);
  };

  const comingSoon = () => toast("Coming Soon", { description: "This feature is not yet available." });

  const aiStats = useMemo(() => {
    const values = Object.values(analysis);
    if (!values.length) return null;
    const avgScore = Math.round(values.reduce((s, a) => s + a.hf_score, 0) / values.length);
    const bullish = values.filter((a) => a.sentiment === "Bullish" || a.sentiment === "Very Bullish").length;
    const bearish = values.filter((a) => a.sentiment === "Bearish").length;
    return { avgScore, bullish, bearish };
  }, [analysis]);

  const groupedNews = useMemo(() => {
    if (!news) return [];
    const groups: { date: string; items: typeof news }[] = [];
    for (const item of news) {
      const dateKey = item.published_at ? format(parseISO(item.published_at), "yyyy-MM-dd") : "unknown";
      const existing = groups.find((g) => g.date === dateKey);
      if (existing) existing.items.push(item);
      else groups.push({ date: dateKey, items: [item] });
    }
    return groups;
  }, [news]);

  return (
    <div>
      <title>My Watchlist | HedgeFun</title>
      <IndexSparklineCards />
      <div className="w-full flex flex-col items-center border-b border-border bg-surface py-1">
        <AdBanner slot="top" />
      </div>

      <div className="px-4 py-4 max-w-[1200px]">
        <h1 className="text-xl font-bold text-foreground mb-3">My AI Watchlist</h1>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" className="text-sm gap-1 h-8 px-3">
              My Watchlist <ChevronDown className="h-3.5 w-3.5" />
            </Button>
            <div ref={searchRef} className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                onFocus={() => searchResults.length > 0 && setShowSearchResults(true)}
                placeholder="Add new stock..."
                className="pl-8 h-8 text-sm w-[200px]"
              />
              {showSearchResults && searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg z-50 overflow-hidden max-h-[300px] overflow-y-auto">
                  {searchResults.map((r) => (
                    <button
                      key={r.ticker}
                      onClick={() => handleSelectResult(r)}
                      className="w-full px-3 py-2 flex items-center gap-2 hover:bg-accent text-left text-sm"
                    >
                      <span className="ticker-symbol text-accent-blue text-xs font-semibold">{r.ticker}</span>
                      <span className="text-foreground truncate flex-1">{r.name}</span>
                      <span className="text-[0.6875rem] text-muted-foreground">
                        {EXCHANGE_LABELS[r.exchange ?? ""] ?? r.exchange ?? ""}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {isSearching && searchQuery.trim().length >= 1 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg z-50 px-3 py-2 text-sm text-muted-foreground">
                  Searching...
                </div>
              )}
              {showSearchResults && searchResults.length === 0 && searchQuery.trim().length >= 1 && !isSearching && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg z-50 px-3 py-2 text-sm text-muted-foreground">
                  No results for "{searchQuery}"
                </div>
              )}
            </div>
            <Button variant="ghost" size="sm" className="h-8 gap-1 text-sm" onClick={comingSoon}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
          </div>
        </div>

        {aiStats && symbols.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <div className="fintech-card px-3 py-2.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Avg HF Score</p>
              <p className="text-xl font-bold" style={{ color: scoreColor(aiStats.avgScore) }}>{aiStats.avgScore}</p>
            </div>
            <div className="fintech-card px-3 py-2.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Bullish</p>
              <p className="text-xl font-bold text-emerald-600">{aiStats.bullish}</p>
            </div>
            <div className="fintech-card px-3 py-2.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Bearish</p>
              <p className="text-xl font-bold text-red-500">{aiStats.bearish}</p>
            </div>
            <div className="fintech-card px-3 py-2.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">AI Alerts Today</p>
              <p className="text-xl font-bold text-foreground">{alerts.length}</p>
            </div>
          </div>
        )}

        {symbols.length > 0 && (
          <AIMonitorBar
            tickerCount={symbols.length}
            alertCount={alerts.length}
            lastUpdated={lastUpdated}
          />
        )}

        {!user ? (
          <div className="fintech-card flex flex-col items-center justify-center px-6 py-16 text-center my-4">
            <Lock className="h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-lg font-bold text-foreground mb-2">Sign in to access your Watchlist</h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm">Save stocks and track your portfolio in one place.</p>
            <div className="flex gap-3">
              <Button className="bg-accent-blue hover:bg-accent-blue-hover text-primary-foreground" onClick={() => navigate("/signup")}>
                Sign Up Free
              </Button>
              <Button variant="outline" onClick={() => navigate("/login")}>Log In</Button>
            </div>
          </div>
        ) : wlLoading ? (
          <div className="space-y-2 my-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : (watchlistEntries ?? []).length === 0 ? (
          <div className="fintech-card flex flex-col items-center justify-center px-6 py-12 text-center my-4">
            <Star className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">Add stocks to your watchlist to track them here</p>
            <p className="text-xs text-muted-foreground">Use the search bar above to find and add tickers.</p>
          </div>
        ) : (
          <div className="my-4">
            {(watchlistEntries ?? []).map((entry) => (
              <WatchlistStockRow
                key={entry.id}
                entry={entry}
                snap={snapshotData?.[entry.symbol] as Record<string, unknown> | undefined}
                nameMap={nameMap}
                tickerNames={tickerNames}
                aiData={analysis[entry.symbol]}
                aiAlerts={alerts}
                onRemove={(id, symbol) => removeMutation.mutate({ id, symbol })}
                refreshing={!!refreshing[entry.symbol]}
                onRefresh={refreshTicker}
              />
            ))}
          </div>
        )}

        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-lg font-bold text-foreground">News</h2>
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ["watchlist-news"] })}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
          {newsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full rounded" />
              ))}
            </div>
          ) : (
            <>
              {groupedNews.map((group) => (
                <div key={group.date} className="mb-4">
                  <p className="text-[0.8125rem] font-semibold text-muted-foreground mb-2">
                    {formatDateLabel(group.date)}
                  </p>
                  <div className="space-y-0">
                    {group.items.map((item) => {
                      const time = item.published_at ? format(parseISO(item.published_at), "h:mm a") : "";
                      return (
                        <div key={item.id} className="flex items-start gap-3 py-2 border-b border-border-subtle last:border-b-0">
                          <span className="text-[0.8125rem] text-muted-foreground w-[52px] shrink-0 tabular-nums pt-0.5">
                            {time}
                          </span>
                          <div className="flex-1 min-w-0">
                            <a
                              href={item.url ?? "#"}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[0.875rem] text-accent-blue hover:underline leading-snug"
                            >
                              {item.headline}
                            </a>
                            {item.source && (
                              <span className="ml-2 text-[0.8125rem] text-muted-foreground">{item.source}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {(news?.length ?? 0) >= newsLimit && (
                <Button variant="outline" size="sm" onClick={() => setNewsLimit((l) => l + 20)} className="mt-2">
                  Load More
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="w-full flex flex-col items-center border-t border-border bg-surface py-1 mt-8">
        <AdBanner slot="bottom" />
      </div>
    </div>
  );
};

export default WatchlistPage;
