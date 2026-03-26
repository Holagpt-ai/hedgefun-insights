import { useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
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
  stocks: {
    symbol: string;
    name: string;
    price: number | null;
    change_percent: number | null;
    market_cap: number | null;
    pe_ratio: number | null;
    volume: number | null;
    week_52_low: number | null;
  } | null;
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

// ═════════════════════════════════════════════════════════
// COMPONENT
// ═════════════════════════════════════════════════════════
const WatchlistPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>("General");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    { symbol: string; name: string }[]
  >([]);

  // ── watchlist data ─────────────────────────────────────
  const { data: watchlist, isLoading: wlLoading } = useQuery({
    queryKey: ["watchlist", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("watchlists")
        .select(
          "id, symbol, stocks(symbol, name, price, change_percent, market_cap, pe_ratio, volume, week_52_low)"
        )
        .eq("user_id", user!.id)
        .order("added_at", { ascending: false });
      if (error) throw error;
      return data as unknown as WatchlistRow[];
    },
    enabled: !!user,
  });

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
        .insert({ symbol, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: (_d, symbol) => {
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
      trackEvent("watchlist_add", { ticker: symbol });
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
        (old: WatchlistRow[] | undefined) =>
          old?.filter((w) => w.id !== id) ?? []
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

  // ── search ─────────────────────────────────────────────
  const handleSearch = useCallback(async (value: string) => {
    setSearchQuery(value);
    if (!value.trim()) {
      setSearchResults([]);
      return;
    }
    const { data } = await supabase
      .from("stocks")
      .select("symbol, name")
      .or(`symbol.ilike.%${value}%,name.ilike.%${value}%`)
      .limit(6);
    setSearchResults(data ?? []);
  }, []);

  // ── averages ───────────────────────────────────────────
  const averages = useMemo(() => {
    const rows = (watchlist ?? []).filter((w) => w.stocks);
    if (!rows.length)
      return { marketCap: 0, change: 0, divYield: 0, pe: 0, count: 0 };
    const totalMC = rows.reduce(
      (s, w) => s + (w.stocks?.market_cap ?? 0),
      0
    );
    const avgChg =
      rows.reduce((s, w) => s + (w.stocks?.change_percent ?? 0), 0) /
      rows.length;
    const avgPE =
      rows.reduce((s, w) => s + (w.stocks?.pe_ratio ?? 0), 0) / rows.length;
    return {
      marketCap: totalMC,
      change: avgChg,
      divYield: 0,
      pe: avgPE,
      count: rows.length,
    };
  }, [watchlist]);

  // ── TanStack columns ──────────────────────────────────
  const columns = useMemo<ColumnDef<WatchlistRow, any>[]>(
    () => [
      {
        accessorKey: "symbol",
        header: "Symbol",
        size: 80,
        cell: ({ row }) => (
          <button
            onClick={() =>
              navigate(`/stocks/${row.original.symbol.toLowerCase()}`)
            }
            className="ticker-symbol text-accent-blue hover:underline text-[0.8125rem]"
          >
            {row.original.symbol}
          </button>
        ),
      },
      {
        id: "price",
        header: "Price",
        size: 90,
        cell: ({ row }) => {
          const p = row.original.stocks?.price;
          return (
            <span className="tabular-nums text-foreground">
              {p != null ? `$${p.toFixed(2)}` : "—"}
            </span>
          );
        },
      },
      {
        id: "chg_pct",
        header: "Chg %",
        size: 80,
        cell: ({ row }) => {
          const c = row.original.stocks?.change_percent;
          if (c == null) return <span>—</span>;
          const pos = c >= 0;
          return (
            <span
              className={cn(
                "tabular-nums font-medium",
                pos ? "price-positive" : "price-negative"
              )}
            >
              {pos ? "↑" : "↓"}
              {Math.abs(c).toFixed(2)}%
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
            {abbreviateNumber(row.original.stocks?.volume)}
          </span>
        ),
      },
      {
        id: "afterhr_price",
        header: "Afterhr. Price",
        size: 100,
        cell: () => (
          <span className="text-muted-foreground tabular-nums">—</span>
        ),
      },
      {
        id: "afterhr_chg",
        header: "Afterhr. Chg%",
        size: 90,
        cell: () => (
          <span className="text-muted-foreground tabular-nums">—</span>
        ),
      },
      {
        id: "market_cap",
        header: "Market Cap",
        size: 110,
        cell: ({ row }) => (
          <span className="tabular-nums text-foreground">
            {abbreviateNumber(row.original.stocks?.market_cap)}
          </span>
        ),
      },
      {
        id: "pe_ratio",
        header: "PE Ratio",
        size: 80,
        cell: ({ row }) => {
          const pe = row.original.stocks?.pe_ratio;
          return (
            <span className="tabular-nums text-foreground">
              {pe != null ? pe.toFixed(2) : "—"}
            </span>
          );
        },
      },
      {
        id: "earnings_date",
        header: "Earnings Date",
        size: 110,
        cell: () => (
          <span className="text-muted-foreground tabular-nums">—</span>
        ),
      },
      {
        id: "chg_52w_low",
        header: "% Chg 52w Low",
        size: 110,
        cell: ({ row }) => {
          const low = row.original.stocks?.week_52_low;
          const price = row.original.stocks?.price;
          if (low == null || price == null || low === 0)
            return <span>—</span>;
          const pct = ((price - low) / low) * 100;
          return (
            <span className="tabular-nums price-positive">
              +{pct.toFixed(2)}%
            </span>
          );
        },
      },
      {
        id: "actions",
        header: "",
        size: 48,
        cell: ({ row }) => (
          <button
            onClick={() =>
              removeMutation.mutate({
                id: row.original.id,
                symbol: row.original.symbol,
              })
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
    data: watchlist ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

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
      {/* Page title */}
      <title>My Watchlist | HedgeFun</title>
      {/* Index sparklines */}
      <IndexSparklineCards />
      <div className="w-full flex flex-col items-center border-b border-border bg-surface py-1">
        <AdBanner slot="top" />
      </div>
      {/* Main content */}
      <div className="px-4 py-4 max-w-[1200px]">
        {/* ── Watchlist header ────────────────────── */}
        <h1 className="text-xl font-bold text-foreground mb-3">Watchlist</h1>

        {/* Row 1: controls */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="text-sm gap-1 h-8 px-3"
            >
              My Watchlist
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>

            {/* Search add stock */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Add new stock..."
                className="pl-8 h-8 text-sm w-[200px]"
              />
              {searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg z-50 overflow-hidden">
                  {searchResults.map((r) => (
                    <button
                      key={r.symbol}
                      onClick={() => {
                        addMutation.mutate(r.symbol);
                        setSearchQuery("");
                        setSearchResults([]);
                      }}
                      className="w-full px-3 py-2 flex items-center gap-2 hover:bg-accent text-left text-sm"
                    >
                      <span className="ticker-symbol text-accent-blue text-xs">
                        {r.symbol}
                      </span>
                      <span className="text-foreground truncate">{r.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Button variant="ghost" size="sm" className="h-8 gap-1 text-sm">
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1 px-2.5"
            >
              💲 USD
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1 px-2.5"
            >
              Chart View →
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1 px-2.5"
            >
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
              onClick={() => setActiveTab(tab)}
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
          <button className="px-3 py-2 text-sm whitespace-nowrap text-accent-blue border-b-2 border-transparent -mb-px hover:border-accent-blue">
            + Add View
          </button>
          <button className="px-3 py-2 text-sm whitespace-nowrap text-muted-foreground border-b-2 border-transparent -mb-px hover:text-foreground">
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
        ) : (watchlist ?? []).length === 0 ? (
          <div className="fintech-card flex flex-col items-center justify-center px-6 py-12 text-center my-4">
            <Star className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              Your watchlist is empty. Use the search above to add stocks.
            </p>
          </div>
        ) : (
          <>
            {/* Data table */}
            <div className="fintech-card overflow-x-auto my-4">
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  {table.getHeaderGroups().map((hg) => (
                    <tr
                      key={hg.id}
                      className="border-b-2 border-border"
                      style={{ background: "hsl(var(--surface))" }}
                    >
                      {hg.headers.map((header) => (
                        <th
                          key={header.id}
                          className="table-header text-right px-3 py-2.5 first:text-left"
                          style={{ width: header.getSize() }}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-border-subtle last:border-b-0 hover:bg-surface transition-colors"
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          className="px-3 py-2.5 text-right first:text-left text-[0.8125rem]"
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Watchlist Averages ──────────────── */}
            <div className="fintech-card p-4 mb-6">
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                Watchlist Averages
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-0.5">
                    Market Cap
                  </p>
                  <p className="text-lg font-bold text-foreground">
                    {abbreviateNumber(averages.marketCap)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-0.5">
                    1D Change
                  </p>
                  <p
                    className={cn(
                      "text-lg font-bold",
                      averages.change >= 0
                        ? "price-positive"
                        : "price-negative"
                    )}
                  >
                    {averages.change >= 0 ? "+" : ""}
                    {averages.change.toFixed(2)}%
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-0.5">
                    Dividend Yield
                  </p>
                  <p className="text-lg font-bold text-foreground">0.00%</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-0.5">
                    PE Ratio
                  </p>
                  <p className="text-lg font-bold text-foreground">
                    {averages.pe.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── News Feed ──────────────────────────── */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-lg font-bold text-foreground">News</h2>
            <button
              onClick={() =>
                queryClient.invalidateQueries({
                  queryKey: ["watchlist-news"],
                })
              }
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
                        <div
                          key={item.id}
                          className="flex items-start gap-3 py-2 border-b border-border-subtle last:border-b-0"
                        >
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setNewsLimit((l) => l + 20)}
                  className="mt-2"
                >
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
