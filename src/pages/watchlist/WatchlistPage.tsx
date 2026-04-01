import { useState, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
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
import { resolveCurrentPrice } from "@/lib/price-utils";
import { toast } from "sonner";
import {
  Search,
  Star,
  Trash2,
  ChevronDown,
  Pencil,
  RefreshCw,
  Lock,
} from "lucide-react";
import { format, parseISO, isToday, isYesterday } from "date-fns";

// ── helpers ──────────────────────────────────────────────
function cleanCompanyName(name: string): string {
  return name
    .replace(/\s+(Common Stock|Class A|Class B|Class C|Ordinary Shares?|American Depositary Shares?|ADS|ADR|Inc\.|Corp\.|Ltd\.|LLC|ETF|Trust|Fund).*$/i, '')
    .replace(/,\s*$/, '')
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

// ── types ────────────────────────────────────────────────
interface WatchlistRow {
  id: string;
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  volume: number;
  marketCap: number;
}

// ── tabs ─────────────────────────────────────────────────
const TABS = [
  "General",
  "Holdings",
  "Dividends",
  "Performance",
  "Forecasts",
  "Earnings",
  "Fundamentals",
] as const;

const MARKET_DATA_FUNCTION = "market-data";

// ═════════════════════════════════════════════════════════
// COMPONENT
// ═════════════════════════════════════════════════════════
const WatchlistPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>("General");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const searchRef = useRef<HTMLDivElement>(null);
  const [tickerNames, setTickerNames] = useState<Record<string, string>>({});

  // ── watchlist symbols from DB ─────────────────────────
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

  // ── fetch live snapshots for all watchlist symbols ─────
  const symbols = useMemo(() => (watchlistEntries ?? []).map((e) => e.symbol), [watchlistEntries]);

  const { data: snapshotData } = useQuery({
    queryKey: ["watchlist-snapshots", symbols],
    queryFn: async () => {
      if (symbols.length === 0) return {};
      const results: Record<string, any> = {};
      await Promise.all(
        symbols.map(async (sym) => {
          try {
            const { data, error } = await supabase.functions.invoke("get-watchlist-data", {
              body: { ticker: sym },
            });
            if (error) throw error;
            results[sym] = data;
          } catch {
            // silently skip failed snapshots
          }
        })
      );
      return results;
    },
    enabled: symbols.length > 0,
    refetchInterval: 60_000,
  });

  // ── build table rows from entries + snapshots ─────────
  // ── fetch company names from ticker_search table ───────
  const { data: nameMap } = useQuery({
    queryKey: ["watchlist-names", symbols],
    queryFn: async () => {
      if (symbols.length === 0) return {};
      const { data } = await supabase
        .from("ticker_search")
        .select("symbol, name")
        .in("symbol", symbols);
      const map: Record<string, string> = {};
      (data ?? []).forEach((r) => { map[r.symbol] = r.name; });
      return map;
    },
    enabled: symbols.length > 0,
    staleTime: 5 * 60_000,
  });

  const watchlistRows: WatchlistRow[] = useMemo(() => {
    if (!watchlistEntries) return [];
    return watchlistEntries.map((entry) => {
      const snap = snapshotData?.[entry.symbol];

      // Price fallback chain for all sessions
      const dayClose = snap?.day?.c;
      const minClose = snap?.min?.c;
      const lastTrade = snap?.lastTrade?.p;
      const prevClose = snap?.prevDay?.c;
      const price = (dayClose && dayClose > 0) ? dayClose
        : (minClose && minClose > 0) ? minClose
        : (lastTrade && lastTrade > 0) ? lastTrade
        : (prevClose && prevClose > 0) ? prevClose
        : 0;

      // Volume fallback
      const volume = snap?.day?.v > 0 ? snap.day.v : (snap?.min?.av ?? snap?.min?.v ?? 0);

      // Name from ticker_search table, then snapshot fallbacks
      const name = nameMap?.[entry.symbol]
        || tickerNames[entry.symbol]
        || entry.symbol;

      const change = snap?.todaysChange ?? 0;
      const changePct = snap?.todaysChangePerc ?? 0;

      return {
        id: entry.id,
        symbol: entry.symbol,
        name,
        price,
        change,
        changePct,
        volume,
        marketCap: 0,
      };
    });
  }, [watchlistEntries, snapshotData, nameMap, tickerNames]);

  // ── news ───────────────────────────────────────────────
  const [newsLimit, setNewsLimit] = useState(20);
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

  // ── mutations ──────────────────────────────────────────
  const addMutation = useMutation({
    mutationFn: async (symbol: string) => {
      const { error } = await supabase
        .from("watchlists")
        .insert({ symbol: symbol.toUpperCase(), user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: async (_d, symbol) => {
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
      trackEvent("watchlist_add", { ticker: symbol });
      toast.success(`${symbol.toUpperCase()} added to watchlist`);
      // Cache company name from ticker_search
      const { data } = await supabase
        .from("ticker_search")
        .select("name")
        .eq("symbol", symbol.toUpperCase())
        .limit(1)
        .maybeSingle();
      if (data?.name) {
        setTickerNames((prev) => ({ ...prev, [symbol.toUpperCase()]: data.name }));
      }
    },
    onError: (err: any, symbol) => {
      if (err?.code === "23505") {
        toast.info(`${symbol.toUpperCase()} is already in your watchlist`);
      } else {
        toast.error("Failed to add to watchlist", { description: err?.message });
      }
    },
  });

  const removeMutation = useMutation({
    mutationFn: async ({ id, symbol }: { id: string; symbol: string }) => {
      const { error } = await supabase
        .from("watchlists")
        .delete()
        .eq("id", id);
      if (error) throw error;
      return symbol;
    },
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: ["watchlist"] });
      const prev = queryClient.getQueryData(["watchlist", user?.id]);
      queryClient.setQueryData(
        ["watchlist", user?.id],
        (old: any[] | undefined) => old?.filter((w) => w.id !== id) ?? []
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev)
        queryClient.setQueryData(["watchlist", user?.id], ctx.prev);
    },
    onSettled: (_d, _e, vars) => {
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
      if (vars) trackEvent("watchlist_remove", { ticker: vars.symbol });
    },
  });

  // ── search using searchTickers (ticker_search table) ──
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
        // Fallback to direct Supabase query if edge function returns nothing
        if (!data || data.length === 0) {
          const { data: rows } = await supabase
            .from("ticker_search")
            .select("symbol, name, exchange, type")
            .or(`symbol.ilike.${value.toUpperCase()}%,name.ilike.%${value}%`)
            .eq("active", true)
            .order("symbol")
            .limit(10);
          data = (rows ?? []).map((r) => ({
            ticker: r.symbol,
            name: r.name,
            exchange: r.exchange,
            type: r.type,
          }));
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

  // ── first symbol for chart view ────────────────────────
  const firstSymbol = symbols[0]?.toLowerCase();

  // ── TanStack columns ──────────────────────────────────
  const columns = useMemo<ColumnDef<WatchlistRow, any>[]>(
    () => [
      {
        accessorKey: "symbol",
        header: "Symbol",
        size: 80,
        cell: ({ row }) => (
          <button
            onClick={() => navigate(`/stocks/${row.original.symbol.toLowerCase()}`)}
            className="ticker-symbol text-accent-blue hover:underline text-[0.8125rem]"
          >
            {row.original.symbol}
          </button>
        ),
      },
      {
        accessorKey: "name",
        header: "Company Name",
        size: 180,
        cell: ({ row }) => (
          <span className="text-foreground text-[0.8125rem] truncate block max-w-[180px]">
            {row.original.name}
          </span>
        ),
      },
      {
        id: "price",
        header: "Price",
        size: 90,
        cell: ({ row }) => (
          <span className="tabular-nums text-foreground">
            {row.original.price > 0 ? `$${row.original.price.toFixed(2)}` : "—"}
          </span>
        ),
      },
      {
        id: "change",
        header: "Change",
        size: 90,
        cell: ({ row }) => {
          const c = row.original.change;
          const pos = c >= 0;
          return (
            <span className={cn("tabular-nums font-medium", pos ? "price-positive" : "price-negative")}>
              {pos ? "+" : ""}{c.toFixed(2)}
            </span>
          );
        },
      },
      {
        id: "chg_pct",
        header: "% Change",
        size: 90,
        cell: ({ row }) => {
          const c = row.original.changePct;
          const pos = c >= 0;
          return (
            <span className={cn("tabular-nums font-medium", pos ? "price-positive" : "price-negative")}>
              {pos ? "+" : ""}{c.toFixed(2)}%
            </span>
          );
        },
      },
      {
        id: "volume",
        header: "Volume",
        size: 100,
        cell: ({ row }) => (
          <span className="tabular-nums text-foreground">
            {row.original.volume > 0 ? abbreviateNumber(row.original.volume) : "—"}
          </span>
        ),
      },
      {
        id: "market_cap",
        header: "Market Cap",
        size: 110,
        cell: ({ row }) => (
          <span className="tabular-nums text-foreground">
            {row.original.marketCap > 0 ? abbreviateNumber(row.original.marketCap) : "—"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        size: 48,
        cell: ({ row }) => (
          <button
            onClick={() =>
              removeMutation.mutate({ id: row.original.id, symbol: row.original.symbol })
            }
            className="text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ),
      },
    ],
    [navigate, removeMutation]
  );

  const table = useReactTable({
    data: watchlistRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  // ── averages ───────────────────────────────────────────
  const averages = useMemo(() => {
    if (!watchlistRows.length) return { marketCap: 0, change: 0, pe: 0, count: 0 };
    const avgChg = watchlistRows.reduce((s, w) => s + w.changePct, 0) / watchlistRows.length;
    return { marketCap: 0, change: avgChg, pe: 0, count: watchlistRows.length };
  }, [watchlistRows]);

  // ── news grouped by date ───────────────────────────────
  const groupedNews = useMemo(() => {
    if (!news) return [];
    const groups: { date: string; items: typeof news }[] = [];
    for (const item of news) {
      const dateKey = item.published_at
        ? format(parseISO(item.published_at), "yyyy-MM-dd")
        : "unknown";
      const existing = groups.find((g) => g.date === dateKey);
      if (existing) existing.items.push(item);
      else groups.push({ date: dateKey, items: [item] });
    }
    return groups;
  }, [news]);

  // ═════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════
  return (
    <div>
      <title>My Watchlist | HedgeFun</title>
      <IndexSparklineCards />
      <div className="w-full flex flex-col items-center border-b border-border bg-surface py-1">
        <AdBanner slot="top" />
      </div>
      <div className="px-4 py-4 max-w-[1200px]">
        <h1 className="text-xl font-bold text-foreground mb-3">Watchlist</h1>

        {/* Row 1: controls */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" className="text-sm gap-1 h-8 px-3">
              My Watchlist
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>

            {/* Search */}
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
                      <span className="ticker-symbol text-accent-blue text-xs font-semibold">
                        {r.ticker}
                      </span>
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
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1 px-2.5" onClick={comingSoon}>
              💲 USD
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1 px-2.5"
              onClick={() => {
                if (firstSymbol) navigate(`/chart/${firstSymbol}`);
                else toast("No ticker selected", { description: "Add a stock to your watchlist first." });
              }}
            >
              Chart View →
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1 px-2.5" onClick={comingSoon}>
              Options
              <ChevronDown className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Row 2: Tab bar */}
        <div className="flex items-center gap-0 border-b border-border mb-4 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => {
                if (tab !== "General") { comingSoon(); return; }
                setActiveTab(tab);
              }}
              className={cn(
                "px-3 py-2 text-sm whitespace-nowrap transition-colors border-b-2 -mb-px",
                activeTab === tab
                  ? "border-accent-blue text-accent-blue font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab}
            </button>
          ))}
          <button onClick={comingSoon} className="px-3 py-2 text-sm whitespace-nowrap text-accent-blue border-b-2 border-transparent -mb-px hover:border-accent-blue">
            + Add View
          </button>
          <button onClick={comingSoon} className="px-3 py-2 text-sm whitespace-nowrap text-muted-foreground border-b-2 border-transparent -mb-px hover:text-foreground">
            ✏️ Edit View
          </button>
        </div>

        {/* ── Auth gate / Table ───────────────────── */}
        {!user ? (
          <div className="fintech-card flex flex-col items-center justify-center px-6 py-16 text-center my-4">
            <Lock className="h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-lg font-bold text-foreground mb-2">
              Sign in to access your Watchlist
            </h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm">
              Save stocks and track your portfolio in one place.
            </p>
            <div className="flex gap-3">
              <Button
                className="bg-accent-blue hover:bg-accent-blue-hover text-primary-foreground"
                onClick={() => navigate("/signup")}
              >
                Sign Up Free
              </Button>
              <Button variant="outline" onClick={() => navigate("/login")}>
                Log In
              </Button>
            </div>
          </div>
        ) : wlLoading ? (
          <div className="space-y-2 my-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded" />
            ))}
          </div>
        ) : watchlistRows.length === 0 ? (
          <div className="fintech-card flex flex-col items-center justify-center px-6 py-12 text-center my-4">
            <Star className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">
              Add stocks to your watchlist to track them here
            </p>
            <p className="text-xs text-muted-foreground">
              Use the search bar above to find and add tickers.
            </p>
          </div>
        ) : (
          <>
            <div className="fintech-card overflow-x-auto my-4">
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  {table.getHeaderGroups().map((hg) => (
                    <tr key={hg.id} className="border-b-2 border-border" style={{ background: "hsl(var(--surface))" }}>
                      {hg.headers.map((header) => (
                        <th
                          key={header.id}
                          className="table-header text-right px-3 py-2.5 first:text-left"
                          style={{ width: header.getSize() }}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => (
                    <tr key={row.id} className="border-b border-border-subtle last:border-b-0 hover:bg-surface transition-colors">
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-3 py-2.5 text-right first:text-left text-[0.8125rem]">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Watchlist Averages */}
            <div className="fintech-card p-4 mb-6">
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">Watchlist Averages</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-0.5">Stocks</p>
                  <p className="text-lg font-bold text-foreground">{averages.count}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-0.5">Avg 1D Change</p>
                  <p className={cn("text-lg font-bold", averages.change >= 0 ? "price-positive" : "price-negative")}>
                    {averages.change >= 0 ? "+" : ""}{averages.change.toFixed(2)}%
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-0.5">Dividend Yield</p>
                  <p className="text-lg font-bold text-foreground">—</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-0.5">PE Ratio</p>
                  <p className="text-lg font-bold text-foreground">—</p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* News Feed */}
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
                      const time = item.published_at
                        ? format(parseISO(item.published_at), "h:mm a")
                        : "";
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
                              <span className="ml-2 text-[0.8125rem] text-muted-foreground">
                                {item.source}
                              </span>
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
