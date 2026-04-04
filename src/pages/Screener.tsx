import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentPrice } from "@/lib/price-utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronUp, Search, Download, Plus, Star, ArrowUpRight, X, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import { AdBanner } from "@/components/layout/AdBanner";
import { ScreenerTutorialButton } from "@/components/screener/ScreenerTutorialDialog";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  type ColumnDef,
  type SortingState,
  flexRender,
} from "@tanstack/react-table";

function abbreviateNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toLocaleString();
}

function formatMarketCapScreener(n: number | null): string {
  if (!n) return "—";
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
};

const Screener = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const industryParam = searchParams.get("industry");
  const { user } = useAuth();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterSearch, setFilterSearch] = useState("");
  const [activeFilters, setActiveFilters] = useState<{ key: string; label: string; value: string }[]>([]);
  const [sorting, setSorting] = useState<SortingState>([{ id: "market_cap", desc: true }]);
  const [activeTab, setActiveTab] = useState("General");
  const [findSearch, setFindSearch] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [livePrices, setLivePrices] = useState<Record<string, { price: number; change: number; volume: number; marketCap: number | null }>>({});
  const fetchedRef = useRef<Set<string>>(new Set());
  const [marketCapFilter, setMarketCapFilter] = useState("none");

  const { data: stocks, isLoading } = useQuery({
    queryKey: ["screener-tickers", industryParam, marketCapFilter],
    queryFn: async () => {
      // When industry filter is active, query stocks table which has industry data
      if (industryParam) {
        const { data, error } = await supabase
          .from("stocks")
          .select("symbol, name, price, change_percent, market_cap, pe_ratio, volume, sector, industry, exchange")
          .ilike("industry", industryParam)
          .order("market_cap", { ascending: false, nullsFirst: false })
          .limit(500);
        if (error) throw error;
        return (data ?? []).map((r) => ({
          symbol: r.symbol,
          name: r.name,
          exchange: r.exchange,
          type: null as string | null,
          market_cap: r.market_cap as number | null,
          price: r.price as number | null,
          change_percent: r.change_percent as number | null,
          volume: r.volume as number | null,
          pe_ratio: r.pe_ratio as number | null,
          industry: r.industry as string | null,
          sector: r.sector as string | null,
        }));
      }

      // When a market cap filter is active, query stocks table which has market_cap data
      if (hasMarketCapFilter) {
        let query = supabase
          .from("stocks")
          .select("symbol, name, price, change_percent, market_cap, pe_ratio, volume, sector, industry, exchange")
          .not("market_cap", "is", null);

        if (marketCapFilter === "mega-cap") {
          query = query.gte("market_cap", 200_000_000_000);
        } else if (marketCapFilter === "large-cap") {
          query = query.gte("market_cap", 10_000_000_000).lt("market_cap", 200_000_000_000);
        } else if (marketCapFilter === "mid-cap") {
          query = query.gte("market_cap", 2_000_000_000).lt("market_cap", 10_000_000_000);
        } else if (marketCapFilter === "small-cap") {
          query = query.gte("market_cap", 300_000_000).lt("market_cap", 2_000_000_000);
        } else if (marketCapFilter === "micro-cap") {
          query = query.lt("market_cap", 300_000_000).gte("market_cap", 50_000_000);
        }

        const { data, error } = await query
          .order("market_cap", { ascending: false, nullsFirst: false })
          .limit(1000);
        if (error) throw error;
        return (data ?? []).map((r) => ({
          symbol: r.symbol,
          name: r.name,
          exchange: r.exchange,
          type: null as string | null,
          market_cap: r.market_cap as number | null,
          price: r.price as number | null,
          change_percent: r.change_percent as number | null,
          volume: r.volume as number | null,
          pe_ratio: r.pe_ratio as number | null,
          industry: r.industry as string | null,
          sector: r.sector as string | null,
        }));
      }

      const { data, error } = await supabase
        .from("ticker_search")
        .select("symbol, name, exchange, type")
        .eq("active", true)
        .order("symbol", { ascending: true })
        .limit(5000);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        symbol: r.symbol,
        name: r.name,
        exchange: r.exchange,
        type: r.type,
        market_cap: null as number | null,
        price: null as number | null,
        change_percent: null as number | null,
        volume: null as number | null,
        pe_ratio: null as number | null,
        industry: null as string | null,
        sector: null as string | null,
      }));
    },
    staleTime: 5 * 60_000,
  });

  const hasMarketCapFilter = ["mega-cap", "large-cap", "mid-cap", "small-cap", "micro-cap"].includes(marketCapFilter);

  const filteredData = useMemo(() => {
    let list = stocks ?? [];
    if (findSearch.trim()) {
      const q = findSearch.trim().toLowerCase();
      list = list.filter((s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
    }
    return list;
  }, [stocks, findSearch]);

  const columns = useMemo<ColumnDef<StockRow, any>[]>(
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
        cell: ({ row }) => (
          <span className="text-foreground truncate block max-w-[220px]">{row.original.name}</span>
        ),
        size: 200,
      },
      {
        accessorKey: "market_cap",
        header: "Market Cap",
        cell: ({ row }) => {
          const live = livePrices[row.original.symbol];
          const mc = live?.marketCap ?? row.original.market_cap;
          return formatMarketCapScreener(mc);
        },
        sortingFn: (rowA, rowB) => {
          const mcA = livePrices[rowA.original.symbol]?.marketCap ?? rowA.original.market_cap ?? 0;
          const mcB = livePrices[rowB.original.symbol]?.marketCap ?? rowB.original.market_cap ?? 0;
          return mcA - mcB;
        },
        meta: { align: "right" },
      },
      {
        accessorKey: "price",
        header: "Stock Price",
        cell: ({ row }) => {
          const live = livePrices[row.original.symbol];
          const p = live?.price ?? row.original.price;
          return p != null && p > 0 ? `$${p.toFixed(2)}` : "—";
        },
        meta: { align: "right" },
      },
      {
        accessorKey: "change_percent",
        header: "% Change",
        cell: ({ row }) => {
          const live = livePrices[row.original.symbol];
          const v = live?.change ?? row.original.change_percent;
          if (v == null) return "—";
          return (
            <span className={v >= 0 ? "price-positive" : "price-negative"}>
              {v.toFixed(2)}%
            </span>
          );
        },
        meta: { align: "right" },
      },
      {
        accessorKey: "industry",
        header: "Industry",
        cell: ({ row }) => (
          <span className="text-muted-foreground text-xs truncate block max-w-[200px]">
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
          return v != null && v > 0 ? v.toLocaleString() : "—";
        },
        meta: { align: "right" },
      },
      {
        accessorKey: "pe_ratio",
        header: "PE Ratio",
        cell: ({ row }) => (row.original.pe_ratio != null ? row.original.pe_ratio.toFixed(2) : "—"),
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

  // Fetch live prices for visible rows
  const visibleSymbols = table.getRowModel().rows.map((r) => r.original.symbol);
  useEffect(() => {
    const toFetch = visibleSymbols.filter((s) => !fetchedRef.current.has(s));
    if (toFetch.length === 0) return;
    toFetch.forEach((s) => fetchedRef.current.add(s));

    Promise.allSettled(
      toFetch.map(async (symbol) => {
        try {
          const { data } = await supabase.functions.invoke("get-watchlist-data", {
            body: { ticker: symbol },
          });
          if (!data) return;
          const price = resolveCurrentPrice(data);
          const prevClose = data?.prevDay?.c ?? 0;
          const change = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
          const vol = data?.day?.v > 0 ? data.day.v : (data?.min?.av ?? 0);
          const mc = data?.market_cap ?? data?.details?.market_cap ?? null;
          setLivePrices((prev) => ({ ...prev, [symbol]: { price, change, volume: vol, marketCap: mc } }));
        } catch { /* ignore individual failures */ }
      })
    );
  }, [visibleSymbols.join(",")]);

  // Sync pageSize changes
  const handlePageSizeChange = useCallback(
    (val: string) => {
      const size = parseInt(val);
      setPageSize(size);
      table.setPageSize(size);
    },
    [table],
  );

  const removeFilter = (key: string) => {
    setActiveFilters((f) => f.filter((x) => x.key !== key));
  };

  const clearIndustryFilter = () => {
    searchParams.delete("industry");
    setSearchParams(searchParams);
  };

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

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

  const totalStocks = filteredData.length;
  const pageIndex = table.getState().pagination.pageIndex;
  const totalPages = table.getPageCount();

  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex-1 max-w-[1280px] w-full mx-auto px-4 py-4">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-[0.8125rem] text-muted-foreground mb-4">
          <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
          <ChevronRight className="h-3 w-3" />
          <Link to="/screener" className="hover:text-foreground transition-colors">Stocks</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground">Stock Screener</span>
        </nav>

        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <h1 className="text-[1.375rem] font-bold text-foreground">Stock Screener</h1>
            <ScreenerTutorialButton variant="stock" />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-xs text-muted-foreground">Exchange Country</div>
            <Select defaultValue="us" onValueChange={(v) => { if (v !== "us") toast("Coming Soon", { description: "International markets coming soon." }); }}>
              <SelectTrigger className="h-8 text-xs w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="us">🇺🇸 United States</SelectItem>
                <SelectItem value="gb">🇬🇧 United Kingdom</SelectItem>
                <SelectItem value="ca">🇨🇦 Canada</SelectItem>
                <SelectItem value="de">🇩🇪 Germany</SelectItem>
                <SelectItem value="jp">🇯🇵 Japan</SelectItem>
                <SelectItem value="au">🇦🇺 Australia</SelectItem>
                <SelectItem value="fr">🇫🇷 France</SelectItem>
                <SelectItem value="cn">🇨🇳 China</SelectItem>
              </SelectContent>
            </Select>
            <Select value={marketCapFilter} onValueChange={(v) => { setMarketCapFilter(v); if (v === "high-dividend" || v === "growth") comingSoon(); }}>
              <SelectTrigger className="h-8 text-xs w-[140px]">
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
            <Select defaultValue="none" onValueChange={(v) => { if (v !== "none") comingSoon(); }}>
              <SelectTrigger className="h-8 text-xs w-[130px]">
                <SelectValue placeholder="Saved Screens" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select saved</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Filters Toggle */}
        <button
          onClick={() => setFiltersOpen(!filtersOpen)}
          className="flex items-center gap-1 text-sm font-medium text-foreground mb-2 hover:text-accent-blue transition-colors"
        >
          {filtersOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          Filters
        </button>

        {/* Filter Panel */}
        {filtersOpen && (
          <div className="fintech-card p-4 mb-4 space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <Button variant="outline" size="sm" className="border-accent-blue text-accent-blue hover:bg-accent-blue-light">
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Filters
              </Button>
              <div className="relative flex-1 max-w-[280px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                  placeholder="Search filters..."
                  className="h-8 pl-8 text-xs"
                />
              </div>
            </div>
            {activeFilters.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {activeFilters.map((f) => (
                  <span
                    key={f.key}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-accent-blue-light text-accent-blue text-xs font-medium"
                  >
                    {f.label}: {f.value}
                    <button onClick={() => removeFilter(f.key)}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Industry filter badge */}
        {industryParam && (
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-accent-blue-light text-accent-blue text-xs font-medium">
              Industry: {industryParam}
              <button onClick={clearIndustryFilter}>
                <X className="h-3 w-3" />
              </button>
            </span>
          </div>
        )}

        {/* Results Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <span className="text-sm font-semibold text-foreground">
            {industryParam || findSearch.trim() || hasMarketCapFilter ? `${filteredData.length} results` : "12,000+ Stocks & ETFs"}
          </span>
          {hasMarketCapFilter && filteredData.length === (stocks ?? []).length && (
            <span className="text-xs text-muted-foreground ml-2">Market cap filter requires live data — showing all results</span>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={findSearch}
                onChange={(e) => setFindSearch(e.target.value)}
                placeholder="Find..."
                className="h-8 pl-7 text-xs w-[120px]"
              />
            </div>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleDownloadCsv}>
              <Download className="h-3.5 w-3.5 mr-1" />
              Download
            </Button>
            <Button size="sm" className="h-8 text-xs bg-accent-blue hover:bg-accent-blue-hover text-primary-foreground relative" onClick={() => navigate(user ? "/watchlist" : "/auth")}>
              <Star className="h-3.5 w-3.5 mr-1" />
              Watchlist
              <span className="absolute -top-1.5 -right-1.5 bg-green text-primary-foreground text-[0.625rem] px-1.5 py-0 rounded-full leading-4 font-semibold">
                New
              </span>
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={comingSoon}>Indicators</Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => toast("Pro Feature", { description: "Full Width view is available for HedgeFun Pro subscribers.", action: { label: "Upgrade", onClick: () => navigate("/pro") } })}>Full Width 🔒</Button>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex items-center gap-0 border-b border-border mb-0 overflow-x-auto">
          {VIEW_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => { if (tab === "General") { setActiveTab(tab); } else { comingSoon(); } }}
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
          <button onClick={comingSoon} className="px-3 py-2 text-sm text-muted-foreground border-b-2 border-transparent hover:text-foreground whitespace-nowrap">
            + Add View
          </button>
          <button onClick={comingSoon} className="px-3 py-2 text-sm text-muted-foreground border-b-2 border-transparent hover:text-foreground whitespace-nowrap">
            ✏️ Edit View
          </button>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-2 py-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
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
                            "table-header px-3 py-2 cursor-pointer select-none hover:text-foreground whitespace-nowrap",
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
                  <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-surface transition-colors">
                    {row.getVisibleCells().map((cell) => {
                      const align = (cell.column.columnDef.meta as any)?.align;
                      return (
                        <td
                          key={cell.id}
                          className={cn(
                            "px-3 py-2 tabular-nums text-[0.875rem]",
                            align === "right" && "text-right",
                          )}
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
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 py-4">
            <Button
              variant="outline"
              size="sm"
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
              className="text-xs"
            >
              ← Previous
            </Button>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Page {pageIndex + 1} of {totalPages}
              </span>
              <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
                <SelectTrigger className="h-7 text-xs w-[90px]">
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
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
              className="text-xs"
            >
              Next →
            </Button>
          </div>
        )}

        {/* Back to Top */}
        {!isLoading && (
          <div className="text-center py-2">
            <button onClick={scrollToTop} className="text-xs text-accent-blue hover:underline">
              ↑ Back to Top
            </button>
          </div>
        )}

        {/* Related Tools */}
        <div className="mt-8 mb-8">
          <h2 className="text-[1.125rem] font-bold text-foreground mb-4">Related Tools</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {RELATED_TOOLS.map((tool) => (
              <button
                key={tool.title}
                onClick={() => navigate(tool.route)}
                className="fintech-card p-4 text-left hover:border-accent-blue transition-colors group relative"
              >
                <ArrowUpRight className="h-4 w-4 text-muted-foreground absolute top-3 right-3 group-hover:text-accent-blue transition-colors" />
                <h3 className="text-sm font-bold text-foreground mb-1">{tool.title}</h3>
                <p className="text-xs text-text-secondary leading-relaxed">{tool.description}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      <AdBanner />
      
    </div>
  );
};

export default Screener;
