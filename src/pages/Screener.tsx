import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronUp, Search, Download, Plus, Star, ArrowUpRight, X, ChevronRight } from "lucide-react";
import { useReactTable, getCoreRowModel, getSortedRowModel, getPaginationRowModel, type ColumnDef, type SortingState, flexRender } from "@tanstack/react-table";
import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentPrice } from "@/lib/price-utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import { AdBanner } from "@/components/layout/AdBanner";
import { ScreenerTutorialButton } from "@/components/screener/ScreenerTutorialDialog";
import { FilterModal } from "@/components/screener/FilterModal";
import { InlineFilterBar } from "@/components/screener/FilterInput";
import { useScreenerQuery } from "@/components/screener/useScreenerQuery";
import { type ActiveFilter } from "@/components/screener/filters.config";
import { useAuth } from "@/contexts/AuthContext";
import { usePageSeo } from "@/hooks/usePageSeo";
import { toast } from "sonner";

function formatMarketCapScreener(n: number | null): string {
  if (!n || n <= 0) return "—";
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  return n.toLocaleString();
}

const RELATED_TOOLS = [
  { title: "ETF Screener", description: "Like the stock screener, but for exchange-traded funds (ETFs)", route: "/etfs/screener" },
  { title: "Comparison Tool", description: "Compare two or more stocks, with tables and charts", route: "/stocks/compare" },
  { title: "Stock Exchanges", description: "See a list of all supported global stock exchanges", route: "/stocks/exchanges" },
  { title: "Watchlist", description: "Track your stocks and portfolios", route: "/watchlist" },
];

const VIEW_TABS = ["General", "Performance", "Analysts", "Dividends", "Financials", "Valuation"];

type StockRow = {
  symbol: string;
  name: string;
  price: number | null;
  change_percent: number | null;
  market_cap: number | null;
  pe_ratio: number | null;
  volume: number | null;
  sector: string | null;
  industry: string | null;
  exchange: string | null;
  dividend_yield: number | null;
};

type LivePrice = { price: number; change: number; volume: number; marketCap: number | null };

const Screener = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const industryParam = searchParams.get("industry");
  const { user, profile } = useAuth();

  const userTier: "free" | "pro" | "unlimited" =
    (profile?.plan as "free" | "pro" | "unlimited") ?? "free";

  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [sorting, setSorting] = useState<SortingState>([{ id: "market_cap", desc: true }]);
  const [activeTab, setActiveTab] = useState("General");
  const [findSearch, setFindSearch] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [marketCapFilter, setMarketCapFilter] = useState("none");
  const [livePrices, setLivePrices] = useState<Record<string, LivePrice>>({});
  const fetchedRef = useRef<Set<string>>(new Set());

  const { stocks, isLoading, hasActiveFilters } = useScreenerQuery({
    activeFilters,
    industryParam,
    marketCapFilter,
    userTier,
  });

  const filteredData = useMemo(() => {
    let list = (stocks ?? []) as StockRow[];
    if (findSearch.trim()) {
      const q = findSearch.trim().toLowerCase();
      list = list.filter((s) => s.symbol.toLowerCase().includes(q) || (s.name ?? "").toLowerCase().includes(q));
    }
    return list;
  }, [stocks, findSearch]);

  const columns = useMemo<ColumnDef<StockRow>[]>(
    () => [
      {
        accessorKey: "symbol",
        header: "Symbol",
        cell: ({ row }) => (
          <button
            onClick={() => {
              trackEvent("stock_search", { ticker: row.original.symbol });
              navigate(`/stocks/${row.original.symbol.toLowerCase()}`);
            }}
            className="ticker-symbol text-accent-blue hover:underline text-[0.875rem]"
          >
            {row.original.symbol}
          </button>
        ),
        size: 90,
      },
      {
        accessorKey: "name",
        header: "Company Name",
        cell: ({ row }) => <span className="text-sm">{row.original.name}</span>,
        size: 200,
      },
      {
        accessorKey: "market_cap",
        header: "Market Cap",
        cell: ({ row }) => {
          const live = livePrices[row.original.symbol];
          return <span className="text-sm">{formatMarketCapScreener(live?.marketCap ?? row.original.market_cap)}</span>;
        },
        sortingFn: (rowA, rowB) => {
          const a = livePrices[rowA.original.symbol]?.marketCap ?? rowA.original.market_cap ?? 0;
          const b = livePrices[rowB.original.symbol]?.marketCap ?? rowB.original.market_cap ?? 0;
          return a - b;
        },
        meta: { align: "right" },
      },
      {
        accessorKey: "price",
        header: "Stock Price",
        cell: ({ row }) => {
          const live = livePrices[row.original.symbol];
          const p = live?.price ?? row.original.price;
          return <span className="text-sm">{p != null && p > 0 ? `$${p.toFixed(2)}` : "—"}</span>;
        },
        meta: { align: "right" },
      },
      {
        accessorKey: "change_percent",
        header: "% Change",
        cell: ({ row }) => {
          const live = livePrices[row.original.symbol];
          const v = live?.change ?? row.original.change_percent;
          if (v == null) return <span className="text-sm">—</span>;
          return <span className={cn("text-sm", v >= 0 ? "price-positive" : "price-negative")}>{v.toFixed(2)}%</span>;
        },
        meta: { align: "right" },
      },
      {
        accessorKey: "industry",
        header: "Industry",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.industry ?? row.original.sector ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "volume",
        header: "Volume",
        cell: ({ row }) => {
          const live = livePrices[row.original.symbol];
          const v = live?.volume ?? row.original.volume;
          return <span className="text-sm">{v != null && v > 0 ? v.toLocaleString() : "—"}</span>;
        },
        meta: { align: "right" },
      },
      {
        accessorKey: "pe_ratio",
        header: "PE Ratio",
        cell: ({ row }) => <span className="text-sm">{row.original.pe_ratio != null ? row.original.pe_ratio.toFixed(2) : "—"}</span>,
        meta: { align: "right" },
      },
    ],
    [navigate, livePrices],
  );

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  const visibleSymbols = table.getRowModel().rows.map((r) => r.original.symbol);
  const visibleKey = visibleSymbols.join(",");
  useEffect(() => {
    const toFetch = visibleSymbols.filter((s) => !fetchedRef.current.has(s));
    if (toFetch.length === 0) return;
    toFetch.forEach((s) => fetchedRef.current.add(s));
    Promise.allSettled(
      toFetch.map(async (symbol) => {
        try {
          const { data } = await supabase.functions.invoke("get-watchlist-data", { body: { ticker: symbol } });
          if (!data) return;
          const price = resolveCurrentPrice(data);
          const prevClose = data?.prevDay?.c ?? 0;
          const change = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
          const vol = data?.day?.v > 0 ? data.day.v : (data?.min?.av ?? 0);
          const mc = data?.market_cap ?? data?.details?.market_cap ?? null;
          setLivePrices((prev) => ({ ...prev, [symbol]: { price, change, volume: vol, marketCap: mc } }));
        } catch {
          /* ignore */
        }
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKey]);

  const handlePageSizeChange = useCallback(
    (val: string) => {
      const size = parseInt(val);
      setPageSize(size);
      table.setPageSize(size);
    },
    [table],
  );

  const removeFilter = (id: string) => {
    setActiveFilters((prev) => prev.filter((f) => f.id !== id));
  };

  const updateFilter = (updated: ActiveFilter) => {
    setActiveFilters((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
  };

  const clearIndustryFilter = () => {
    searchParams.delete("industry");
    setSearchParams(searchParams);
  };

  const comingSoon = () => toast("Coming Soon", { description: "This view will be available in a future update." });

  const handleDownloadCsv = () => {
    const rows = table.getRowModel().rows.map((r) => r.original);
    if (!rows.length) return;
    const header = "Symbol,Company Name,Market Cap,Stock Price,% Change,Volume,PE Ratio";
    const csvRows = rows.map((s) => {
      const live = livePrices[s.symbol];
      const price = live?.price ?? s.price;
      const change = live?.change ?? s.change_percent;
      const vol = live?.volume ?? s.volume;
      const mc = live?.marketCap ?? s.market_cap;
      return `${s.symbol},"${(s.name ?? "").replace(/"/g, '""')}",${mc ?? ""},${price != null ? price.toFixed(2) : ""},${change != null ? change.toFixed(2) : ""},${vol ?? ""},${s.pe_ratio != null ? s.pe_ratio.toFixed(2) : ""}`;
    });
    const csv = [header, ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "screener_results.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded screener results as CSV.");
  };

  const pageIndex = table.getState().pagination.pageIndex;
  const totalPages = table.getPageCount();

  usePageSeo({
    title: "Stock Screener — Filter & Find Stocks | HedgeFun",
    description: "Screen and filter thousands of stocks by price, volume, market cap, sector, and more on HedgeFun.",
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-foreground">Home</Link>
          <ChevronRight className="h-3 w-3" />
          <Link to="/stocks" className="hover:text-foreground">Stocks</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground">Stock Screener</span>
        </nav>

        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-bold">Stock Screener</h1>
            <ScreenerTutorialButton />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={marketCapFilter}
              onValueChange={(v) => {
                setMarketCapFilter(v);
                if (v === "high-dividend" || v === "growth") comingSoon();
              }}
            >
              <SelectTrigger className="h-9 w-[160px] text-xs">
                <SelectValue placeholder="Popular Screens" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select popular</SelectItem>
                <SelectItem value="mega-cap">Mega Cap</SelectItem>
                <SelectItem value="large-cap">Large Cap</SelectItem>
                <SelectItem value="mid-cap">Mid Cap</SelectItem>
                <SelectItem value="small-cap">Small Cap</SelectItem>
                <SelectItem value="micro-cap">Micro Cap</SelectItem>
                <SelectItem value="high-dividend">High Dividend</SelectItem>
                <SelectItem value="growth">Growth Stocks</SelectItem>
              </SelectContent>
            </Select>
            <Select onValueChange={(v) => { if (v !== "none") comingSoon(); }}>
              <SelectTrigger className="h-9 w-[140px] text-xs">
                <SelectValue placeholder="Saved Screens" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select saved</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setFilterModalOpen(true)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-accent-blue hover:bg-accent-blue-hover text-white text-xs font-medium transition-colors shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Filters
            {activeFilters.length > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-accent-blue text-white text-[10px] font-semibold">
                {activeFilters.length}
              </span>
            )}
          </button>

          <InlineFilterBar
            activeFilters={activeFilters}
            onUpdate={updateFilter}
            onRemove={removeFilter}
          />

          {activeFilters.length > 0 && (
            <button
              onClick={() => setActiveFilters([])}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-1"
            >
              Clear all
            </button>
          )}
        </div>

        {/* Industry filter badge */}
        {industryParam && (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-accent-blue/10 text-accent-blue text-xs font-medium">
              Industry: {industryParam}
              <button onClick={clearIndustryFilter} className="hover:opacity-70">
                <X className="h-3 w-3" />
              </button>
            </span>
          </div>
        )}

        {/* Results Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold">
            {hasActiveFilters ? `${filteredData.length} results` : "12,000+ Stocks & ETFs"}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={findSearch}
                onChange={(e) => setFindSearch(e.target.value)}
                placeholder="Find..."
                className="h-8 pl-7 text-xs w-[120px]"
              />
            </div>
            <Button variant="outline" size="sm" onClick={handleDownloadCsv} className="h-8 text-xs gap-1.5">
              <Download className="h-3.5 w-3.5" />
              Download
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(user ? "/watchlist" : "/auth")}
              className="h-8 text-xs gap-1.5"
            >
              <Star className="h-3.5 w-3.5" />
              Watchlist
              <span className="ml-1 px-1 rounded bg-accent-blue text-white text-[9px] font-semibold">New</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() =>
                toast("Pro Feature", {
                  description: "Full Width view is available for HedgeFun Pro subscribers.",
                  action: { label: "Upgrade", onClick: () => navigate("/pro") },
                })
              }
            >
              Full Width 🔒
            </Button>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
          {VIEW_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => {
                if (tab === "General") setActiveTab(tab);
                else comingSoon();
              }}
              className={cn(
                "px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                activeTab === tab
                  ? "border-accent-blue text-accent-blue"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <div className="fintech-card overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  {table.getHeaderGroups().map((hg) =>
                    hg.headers.map((header) => {
                      const align = (header.column.columnDef.meta as any)?.align;
                      return (
                        <th
                          key={header.id}
                          onClick={header.column.getToggleSortingHandler()}
                          className={cn(
                            "px-3 py-2 text-xs font-semibold text-muted-foreground cursor-pointer select-none",
                            align === "right" ? "text-right" : "text-left",
                          )}
                        >
                          <span className="inline-flex items-center gap-1">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {{
                              asc: <ChevronUp className="h-3 w-3" />,
                              desc: <ChevronDown className="h-3 w-3" />,
                            }[header.column.getIsSorted() as string] ?? null}
                          </span>
                        </th>
                      );
                    }),
                  )}
                </tr>
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="border-b border-border hover:bg-muted/40 transition-colors">
                    {row.getVisibleCells().map((cell) => {
                      const align = (cell.column.columnDef.meta as any)?.align;
                      return (
                        <td
                          key={cell.id}
                          className={cn("px-3 py-2", align === "right" ? "text-right" : "text-left")}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!isLoading && totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="text-xs text-accent-blue hover:underline disabled:opacity-40 disabled:no-underline"
            >
              ← Previous
            </button>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>
                Page {pageIndex + 1} of {totalPages}
              </span>
              <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
                <SelectTrigger className="h-7 w-[90px] text-xs">
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
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="text-xs text-accent-blue hover:underline disabled:opacity-40 disabled:no-underline"
            >
              Next →
            </button>
          </div>
        )}

        {/* Back to Top */}
        {!isLoading && (
          <div className="flex justify-center">
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="text-xs text-accent-blue hover:underline"
            >
              ↑ Back to Top
            </button>
          </div>
        )}

        {/* Related Tools */}
        <div className="space-y-3 pt-4">
          <h2 className="text-lg font-semibold">Related Tools</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {RELATED_TOOLS.map((tool) => (
              <button
                key={tool.title}
                onClick={() => navigate(tool.route)}
                className="fintech-card p-4 text-left hover:border-accent-blue transition-colors group relative"
              >
                <ArrowUpRight className="absolute top-3 right-3 h-3.5 w-3.5 text-muted-foreground group-hover:text-accent-blue" />
                <h3 className="text-sm font-semibold mb-1">{tool.title}</h3>
                <p className="text-xs text-muted-foreground">{tool.description}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      <AdBanner />

      {/* Filter Modal */}
      <FilterModal
        open={filterModalOpen}
        onClose={() => setFilterModalOpen(false)}
        activeFilters={activeFilters}
        onApply={setActiveFilters}
        userTier={userTier}
      />
    </div>
  );
};

export default Screener;
