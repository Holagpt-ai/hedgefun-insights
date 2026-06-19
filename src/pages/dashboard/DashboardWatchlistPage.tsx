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
import { Skeleton } from "@/components/ui/skeleton";
import DashboardIndexCards from "@/components/dashboard/DashboardIndexCards";
import { searchTickers, EXCHANGE_LABELS, type SearchResult } from "@/lib/search-tickers";
import { resolveCurrentPrice, estDate } from "@/lib/price-utils";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Search, Star, Trash2, Lock } from "lucide-react";

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

function abbreviateNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString();
}

export default function DashboardWatchlistPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isPro =
    profile?.plan === "pro" ||
    profile?.plan === "admin" ||
    profile?.plan === "unlimited";
  const planLabel = isPro ? "PRO PLAN — LIVE DATA" : "FREE PLAN";

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const searchRef = useRef<HTMLDivElement>(null);

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
    enabled: !!user && isPro,
  });

  const symbols = useMemo(
    () => (watchlistEntries ?? []).map((e: any) => e.symbol),
    [watchlistEntries]
  );

  const { data: snapshots, isLoading: snapsLoading, refetch } = useQuery({
    queryKey: ["watchlist-snapshots", symbols],
    queryFn: async () => {
      if (!symbols.length) return {} as Record<string, any>;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/market-data?type=snapshots&tickers=${symbols.join(",")}`,
        {
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
        }
      );
      if (!res.ok) return {} as Record<string, any>;
      return res.json();
    },
    enabled: symbols.length > 0,
    refetchInterval: 60000,
  });

  const watchlistRows: WatchlistRow[] = useMemo(() => {
    if (!watchlistEntries || !snapshots) return [];
    return watchlistEntries.map((entry: any) => {
      const snap = (snapshots as any)[entry.symbol];
      const price = snap ? resolveCurrentPrice(snap) : 0;
      const change = snap?.todaysChange ?? 0;
      const changePct = snap?.todaysChangePerc ?? 0;
      const volume = snap?.day?.v ?? 0;
      const marketCap = snap?.details?.market_cap ?? 0;
      return {
        id: entry.id,
        symbol: entry.symbol,
        name: snap?.name ?? entry.symbol,
        price,
        change,
        changePct,
        volume,
        marketCap,
      };
    });
  }, [watchlistEntries, snapshots]);

  const addMutation = useMutation({
    mutationFn: async ({ symbol }: { symbol: string }) => {
      const { error } = await supabase
        .from("watchlists")
        .insert({ user_id: user!.id, symbol });
      if (error) throw error;
    },
    onSuccess: (_, { symbol }) => {
      queryClient.invalidateQueries({ queryKey: ["watchlist", user?.id] });
      toast.success(`${symbol} added to watchlist`);
      setSearchQuery("");
      setSearchResults([]);
      setShowSearchResults(false);
    },
    onError: () => toast.error("Failed to add symbol"),
  });

  const removeMutation = useMutation({
    mutationFn: async ({ id }: { id: string; symbol: string }) => {
      const { error } = await supabase.from("watchlists").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { symbol }) => {
      queryClient.invalidateQueries({ queryKey: ["watchlist", user?.id] });
      toast.success(`${symbol} removed`);
    },
    onError: () => toast.error("Failed to remove symbol"),
  });

  const handleSearchChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const q = e.target.value;
      setSearchQuery(q);
      clearTimeout(debounceRef.current);
      if (!q.trim()) {
        setSearchResults([]);
        setShowSearchResults(false);
        return;
      }
      debounceRef.current = setTimeout(async () => {
        setIsSearching(true);
        try {
          const results = await searchTickers(q);
          setSearchResults(results.slice(0, 8));
          setShowSearchResults(true);
        } catch {
          setSearchResults([]);
        } finally {
          setIsSearching(false);
        }
      }, 300);
    },
    []
  );

  const columns = useMemo<ColumnDef<WatchlistRow, any>[]>(
    () => [
      {
        id: "symbol",
        header: "Symbol",
        size: 120,
        cell: ({ row }) => (
          <button
            onClick={() => navigate(`/stocks/${row.original.symbol.toLowerCase()}`)}
            className="font-semibold text-accent-blue hover:underline text-sm"
          >
            {row.original.symbol}
          </button>
        ),
      },
      {
        id: "name",
        header: "Name",
        size: 200,
        cell: ({ row }) => (
          <span className="text-foreground text-sm truncate block max-w-[200px]">
            {row.original.name}
          </span>
        ),
      },
      {
        id: "price",
        header: "Price",
        size: 90,
        cell: ({ row }) => (
          <span className="tabular-nums text-foreground text-sm">
            {row.original.price > 0 ? `$${row.original.price.toFixed(2)}` : "—"}
          </span>
        ),
      },
      {
        id: "change",
        header: "Change %",
        size: 100,
        cell: ({ row }) => {
          const c = row.original.changePct;
          return (
            <span
              className={cn(
                "tabular-nums font-medium text-sm",
                c >= 0 ? "text-[#22cc66]" : "text-[#ff4466]"
              )}
            >
              {c >= 0 ? "+" : ""}
              {c.toFixed(2)}%
            </span>
          );
        },
      },
      {
        id: "volume",
        header: "Volume",
        size: 100,
        cell: ({ row }) => (
          <span className="tabular-nums text-foreground text-sm">
            {row.original.volume > 0 ? abbreviateNumber(row.original.volume) : "—"}
          </span>
        ),
      },
      {
        id: "market_cap",
        header: "Market Cap",
        size: 110,
        cell: ({ row }) => (
          <span className="tabular-nums text-foreground text-sm">
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
    data: watchlistRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="px-4 sm:px-6 py-6 max-w-[1200px] mx-auto space-y-6">
      <title>My Watchlist | HedgeFun</title>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Watchlist</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track your favorite stocks — ad-free
        </p>
      </div>

      {/* Index cards */}
      <DashboardIndexCards />

      {/* Date + plan strip */}
      <div className="text-xs text-muted-foreground uppercase tracking-wider">
        {estDate()} · {planLabel}
      </div>

      {/* PRO gate */}
      {!isPro && (
        <div className="flex flex-col items-center justify-center text-center py-16 px-6 border border-border rounded-xl bg-surface space-y-3">
          <Lock className="h-10 w-10 text-muted-foreground" />
          <h2 className="text-lg font-semibold text-foreground">
            My Watchlist — PRO Feature
          </h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Track your favorite stocks ad-free with live prices, volume, and market cap.
            Or unlock everything with Unlimited for just $10/month.
          </p>
          <button
            onClick={() => navigate("/pro")}
            className="mt-1 bg-accent-blue text-primary-foreground text-sm font-semibold px-6 py-2.5 rounded-lg hover:opacity-90 transition-opacity duration-200"
          >
            Unlock PRO — $5/month
          </button>
        </div>
      )}

      {/* PRO content */}
      {isPro && (
        <>
          {/* Search */}
          <div ref={searchRef} className="relative max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={handleSearchChange}
                placeholder="Search ticker or company..."
                className="pl-9 h-10 text-sm"
              />
            </div>
            {showSearchResults && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
                {searchResults.map((r) => (
                  <button
                    key={r.ticker}
                    onClick={() => addMutation.mutate({ symbol: r.ticker })}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted transition-colors text-left"
                  >
                    <span className="font-semibold text-accent-blue text-sm w-16">
                      {r.ticker}
                    </span>
                    <span className="flex-1 text-sm text-foreground truncate">
                      {r.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {EXCHANGE_LABELS[r.exchange] ?? r.exchange}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {isSearching && (
              <div className="absolute top-full left-0 mt-1 text-xs text-muted-foreground">
                Searching...
              </div>
            )}
          </div>

          {/* Loading */}
          {(wlLoading || snapsLoading) && (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          )}

          {/* Empty */}
          {!wlLoading && !snapsLoading && watchlistRows.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center py-16 px-6 border border-border rounded-xl bg-surface space-y-3">
              <Star className="h-10 w-10 text-muted-foreground" />
              <h2 className="text-lg font-semibold text-foreground">
                Your watchlist is empty
              </h2>
              <p className="text-sm text-muted-foreground">
                Search for a ticker above to add your first stock.
              </p>
            </div>
          )}

          {/* Table */}
          {!wlLoading && !snapsLoading && watchlistRows.length > 0 && (
            <div className="border border-border rounded-xl bg-surface overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/30 border-b border-border">
                    {table.getHeaderGroups().map((hg) => (
                      <tr key={hg.id}>
                        {hg.headers.map((h) => (
                          <th
                            key={h.id}
                            style={{ width: h.getSize() }}
                            className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                          >
                            {flexRender(h.column.columnDef.header, h.getContext())}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody className="divide-y divide-border">
                    {table.getRowModel().rows.map((row) => (
                      <tr key={row.id} className="hover:bg-muted/20 transition-colors">
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id} className="px-4 py-3">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Refresh + AI Analyst */}
          {watchlistRows.length > 0 && (
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => refetch()}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                ↻ Refresh prices
              </button>
              <button
                onClick={() =>
                  navigate(
                    "/dashboard/ai?prompt=Analyze%20my%20current%20watchlist%20and%20highlight%20any%20setups%2C%20risks%2C%20or%20opportunities%20I%20should%20be%20aware%20of."
                  )
                }
                className="text-xs text-accent-blue hover:underline transition-colors duration-200"
              >
                Discuss in AI Analyst →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
