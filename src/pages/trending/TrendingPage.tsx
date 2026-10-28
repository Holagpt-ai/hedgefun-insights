import { useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { Lock, ArrowUpRight, Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { AdBanner } from "@/components/layout/AdBanner";
import { toast } from "sonner";
import { usePageSeo } from "@/hooks/usePageSeo";
import { BRAND } from "@/config/brand";
import { useAuth } from "@/contexts/AuthContext";
import { trackPublicDiscoveryNav } from "@/lib/analytics/public-events";
import { publicStockDetailPath, publicWatchlistEntryHref } from "@/lib/public/public-workflow-links";
import { trackEvent } from "@/lib/analytics";
import {
  formatTrendingDataFootnote,
  latestTrendingDataTimestamp,
  mapTrendingStockRows,
  TRENDING_EMPTY_MESSAGE,
  TRENDING_ERROR_MESSAGE,
  TRENDING_VOLUME_RANK_SECTION_TITLE,
  trendingPageSeoDescription,
  trendingPageSeoTitle,
  type TrendingTableRow,
} from "@/lib/trending/trending-page-present";

function abbr(n: number | null | undefined): string {
  if (n == null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

const TABS = ["Overview", "Performance", "Dividends", "Price", "Profile"];

export default function TrendingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState("Overview");
  const [sorting, setSorting] = useState<SortingState>([{ id: "volume", desc: true }]);

  const { data: stocks, isLoading, isError } = useQuery({
    queryKey: ["trending-stocks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stocks")
        .select("symbol, name, market_cap, change_percent, volume, updated_at")
        .not("volume", "is", null)
        .gt("volume", 0)
        .order("volume", { ascending: false })
        .limit(20);
      if (error) throw error;
      return mapTrendingStockRows(data);
    },
    staleTime: 300_000,
  });

  const filtered = useMemo(() => {
    if (!stocks) return [];
    if (!search) return stocks;
    const q = search.toLowerCase();
    return stocks.filter(
      (s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q),
    );
  }, [stocks, search]);

  const dataFootnote = useMemo(
    () => formatTrendingDataFootnote(latestTrendingDataTimestamp(stocks)),
    [stocks],
  );

  const columns = useMemo<ColumnDef<TrendingTableRow>[]>(
    () => [
      {
        id: "rank",
        header: () => <span className="text-right block">No.</span>,
        cell: ({ row }) => (
          <span className="text-right block text-muted-foreground tabular-nums">
            {row.index + 1}
          </span>
        ),
        size: 40,
        enableSorting: false,
      },
      {
        accessorKey: "symbol",
        header: "Symbol",
        size: 70,
        cell: ({ getValue }) => {
          const t = getValue<string>();
          return (
            <button
              onClick={() => {
                trackEvent("stock_search", { ticker: t });
                trackPublicDiscoveryNav({ from: "trending", to: "stock_detail", symbol: t });
                navigate(publicStockDetailPath(t));
              }}
              className="text-primary font-bold hover:underline text-[0.875rem]"
            >
              {t}
            </button>
          );
        },
      },
      {
        accessorKey: "name",
        header: "Company Name",
        cell: ({ getValue }) => (
          <span className="truncate block max-w-[260px] text-foreground text-[0.875rem]">
            {getValue<string>()}
          </span>
        ),
      },
      {
        accessorKey: "volume",
        header: () => <span className="text-right block">Volume ↓</span>,
        cell: ({ getValue }) => {
          const v = getValue<number | null>();
          return (
            <span className="text-right block tabular-nums text-[0.875rem]">
              {v != null ? v.toLocaleString() : "—"}
            </span>
          );
        },
        size: 110,
      },
      {
        accessorKey: "market_cap",
        header: () => <span className="text-right block">Market Cap</span>,
        cell: ({ getValue }) => (
          <span className="text-right block tabular-nums text-[0.875rem]">
            {abbr(getValue<number | null>())}
          </span>
        ),
        size: 100,
      },
      {
        accessorKey: "change_percent",
        header: () => <span className="text-right block">% Change</span>,
        cell: ({ getValue }) => {
          const v = getValue<number | null>();
          if (v == null) return <span className="text-right block">—</span>;
          const positive = v >= 0;
          return (
            <span
              className={`text-right block tabular-nums font-medium text-[0.875rem] ${
                positive ? "text-green" : "text-red"
              }`}
            >
              {positive ? "+" : ""}
              {v.toFixed(2)}%
            </span>
          );
        },
        size: 90,
      },
    ],
    [navigate],
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  });

  usePageSeo({
    title: trendingPageSeoTitle(BRAND.name),
    description: trendingPageSeoDescription(BRAND.name),
  });

  const showEmpty = !isLoading && !isError && (!stocks || stocks.length === 0);

  return (
    <div className="min-w-0">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[1.75rem] font-bold text-foreground">Trending by volume</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Session leaders by reported share volume in our database — not site visitor rankings.
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 text-muted-foreground shrink-0" onClick={() => navigate("/pro")}>
            Full Width <Lock className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="flex gap-8">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="text-[1.125rem] font-bold text-foreground">{TRENDING_VOLUME_RANK_SECTION_TITLE}</h2>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                   <Input
                     ref={searchRef}
                     placeholder="Find..."
                     value={search}
                     onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 h-8 w-[140px] text-sm"
                  />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">Indicators</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem>Default</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-primary border-primary hover:bg-primary/5"
                  onClick={() => navigate("/screener")}
                >
                  Screener →
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8">
                  <Download className="h-3.5 w-3.5" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="h-8 w-8 text-muted-foreground">⋮</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => searchRef.current?.focus()}>Find...</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => toast("Coming Soon", { description: "Indicators will be available in a future update." })}>Indicators</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/screener")}>Screener</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="flex items-center gap-0 border-b border-border mb-4 overflow-x-auto">
              {TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => {
                    if (tab !== "Overview") {
                      toast("Coming Soon", { description: `${tab} tab will be available in a future update.` });
                      return;
                    }
                    setActiveTab(tab);
                  }}
                  className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                    activeTab === tab
                      ? "text-primary border-b-2 border-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab}
                </button>
              ))}
              <button
                className="px-4 py-2 text-sm text-muted-foreground border border-border rounded-md ml-2 mb-1 hover:text-foreground"
                onClick={() => toast("Coming Soon", { description: "Add View will be available in a future update." })}
              >
                + Add View
              </button>
              <button
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground ml-1"
                onClick={() => toast("Coming Soon", { description: "Edit View will be available in a future update." })}
              >
                Edit View
              </button>
            </div>

            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 10 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : isError ? (
              <p className="text-sm text-muted-foreground py-8 text-center" role="status">
                {TRENDING_ERROR_MESSAGE}
              </p>
            ) : showEmpty ? (
              <p className="text-sm text-muted-foreground py-8 text-center" role="status">
                {TRENDING_EMPTY_MESSAGE}
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse min-w-[700px]">
                    <thead>
                      {table.getHeaderGroups().map((hg) => (
                        <tr key={hg.id} className="border-b-2 border-border bg-surface">
                          {hg.headers.map((header) => (
                            <th
                              key={header.id}
                              className="py-2.5 px-3 text-[0.8125rem] font-semibold text-muted-foreground cursor-pointer select-none"
                              style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                              onClick={header.column.getToggleSortingHandler()}
                            >
                              {flexRender(header.column.columnDef.header, header.getContext())}
                            </th>
                          ))}
                        </tr>
                      ))}
                    </thead>
                    <tbody>
                      {table.getRowModel().rows.map((row) => (
                        <tr key={row.id} className="border-b border-border hover:bg-surface transition-colors">
                          {row.getVisibleCells().map((cell) => (
                            <td
                              key={cell.id}
                              className="py-[10px] px-3"
                              style={{ width: cell.column.getSize() !== 150 ? cell.column.getSize() : undefined }}
                            >
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between mt-4 flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                  >
                    ← Previous
                  </Button>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span>
                      Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
                    </span>
                    <Select
                      value={String(table.getState().pagination.pageSize)}
                      onValueChange={(val) => table.setPageSize(Number(val))}
                    >
                      <SelectTrigger className="h-8 w-[100px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[20, 50, 100].map((s) => (
                          <SelectItem key={s} value={String(s)}>
                            {s} Rows
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                  >
                    Next →
                  </Button>
                </div>

                <p className="text-[0.8125rem] text-muted-foreground mt-2">{dataFootnote}</p>

                <div className="text-center mt-6">
                  <button
                    onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                    className="text-sm text-primary hover:underline"
                  >
                    ↑ Back to Top
                  </button>
                </div>
              </>
            )}
          </div>

          <aside className="hidden md:flex flex-col gap-4 w-[300px] shrink-0 sticky top-20 self-start">
            {[
              { title: `${BRAND.name} Pro`, desc: "Upgrade now for unlimited access to all data and tools.", route: "/pro" },
              { title: "Market Newsletter", desc: "Get a daily email with the top market news in bullet point format.", route: "/newsletter" },
              { title: "Stock Screener", desc: "Filter, sort and analyze all stocks to find your next investment.", route: "/screener" },
              {
                title: "Watchlists",
                desc: "Save symbols in your Stocksist dashboard watchlist (sign in required).",
                route: publicWatchlistEntryHref(Boolean(user)),
              },
            ].map((card) => (
              <button
                key={card.title}
                onClick={() => navigate(card.route)}
                className="relative border border-border rounded-[var(--radius)] p-4 text-left hover:border-primary transition-colors cursor-pointer group"
              >
                <ArrowUpRight className="absolute top-3 right-3 h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                <h3 className="text-[1rem] font-bold text-foreground mb-1">{card.title}</h3>
                <p className="text-[0.875rem] text-muted-foreground pr-5">{card.desc}</p>
              </button>
            ))}
          </aside>
        </div>
      </div>

      <AdBanner />
    </div>
  );
}
