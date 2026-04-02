import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterSearch, setFilterSearch] = useState("");
  const [activeFilters, setActiveFilters] = useState<{ key: string; label: string; value: string }[]>([]);
  const [sorting, setSorting] = useState<SortingState>([{ id: "market_cap", desc: true }]);
  const [activeTab, setActiveTab] = useState("General");
  const [findSearch, setFindSearch] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [livePrices, setLivePrices] = useState<Record<string, { price: number; change: number; volume: number }>>({});
  const fetchedRef = useRef<Set<string>>(new Set());

  const { data: stocks, isLoading } = useQuery({
    queryKey: ["screener-stocks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stocks")
        .select("symbol, name, price, change_percent, market_cap, pe_ratio, volume, sector, industry, exchange")
        .order("market_cap", { ascending: false, nullsFirst: false })
        .limit(1000);
      if (error) throw error;
      return data as StockRow[];
    },
  });

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
        cell: ({ row }) => abbreviateNumber(row.original.market_cap),
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
          setLivePrices((prev) => ({ ...prev, [symbol]: { price, change, volume: vol } }));
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

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

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
            <Select defaultValue="us">
              <SelectTrigger className="h-8 text-xs w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="us">🇺🇸 United States</SelectItem>
                <SelectItem value="ca">🇨🇦 Canada</SelectItem>
                <SelectItem value="gb">🇬🇧 United Kingdom</SelectItem>
              </SelectContent>
            </Select>
            <Select defaultValue="none">
              <SelectTrigger className="h-8 text-xs w-[140px]">
                <SelectValue placeholder="Popular Screens" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select popular</SelectItem>
                <SelectItem value="mega-cap">Mega Cap</SelectItem>
                <SelectItem value="high-dividend">High Dividend</SelectItem>
                <SelectItem value="growth">Growth Stocks</SelectItem>
              </SelectContent>
            </Select>
            <Select defaultValue="none">
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
                  placeholder="Search 297 filters..."
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

        {/* Results Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <span className="text-sm font-semibold text-foreground">100,000+ Stocks &amp; ETFs</span>
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
            <Button variant="outline" size="sm" className="h-8 text-xs">
              <Download className="h-3.5 w-3.5 mr-1" />
              Download
            </Button>
            <Button size="sm" className="h-8 text-xs bg-accent-blue hover:bg-accent-blue-hover text-primary-foreground relative">
              <Star className="h-3.5 w-3.5 mr-1" />
              Watchlist
              <span className="absolute -top-1.5 -right-1.5 bg-green text-primary-foreground text-[0.625rem] px-1.5 py-0 rounded-full leading-4 font-semibold">
                New
              </span>
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs">Indicators</Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => navigate("/pro")}>Full Width 🔒</Button>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex items-center gap-0 border-b border-border mb-0 overflow-x-auto">
          {VIEW_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                activeTab === tab
                  ? "border-accent-blue text-accent-blue"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab}
              {tab === "Filters" && activeFilters.length > 0 && (
                <span className="ml-1 bg-accent-blue text-primary-foreground text-[0.625rem] px-1.5 rounded-full">
                  {activeFilters.length}
                </span>
              )}
            </button>
          ))}
          <button className="px-3 py-2 text-sm text-muted-foreground border-b-2 border-transparent hover:text-foreground whitespace-nowrap">
            + Add View
          </button>
          <button className="px-3 py-2 text-sm text-muted-foreground border-b-2 border-transparent hover:text-foreground whitespace-nowrap">
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
