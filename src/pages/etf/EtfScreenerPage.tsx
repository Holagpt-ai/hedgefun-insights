import { useState, useMemo, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronUp, Search, Download, Plus, Star, HelpCircle, X, ChevronRight, MoreVertical, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdBanner } from "@/components/layout/AdBanner";

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
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toLocaleString()}`;
}

type EtfRow = {
  symbol: string;
  name: string;
  assetClass: string;
  assets: number;
  price: number;
  changePercent: number;
  volume: number;
  holdings: number;
};

const SEED_ETFS: EtfRow[] = [
  { symbol: "VOO", name: "Vanguard S&P 500 ETF", assetClass: "Equity", assets: 856.11e9, price: 622.72, changePercent: -0.17, volume: 15565740, holdings: 518 },
  { symbol: "IVV", name: "iShares Core S&P 500 ETF", assetClass: "Equity", assets: 730.39e9, price: 680.12, changePercent: -0.18, volume: 13571843, holdings: 507 },
  { symbol: "SPY", name: "State Street SPDR S&P 500 ETF", assetClass: "Equity", assets: 670.58e9, price: 677.18, changePercent: -0.16, volume: 81464152, holdings: 504 },
  { symbol: "VTI", name: "Vanguard Total Stock Market ETF", assetClass: "Equity", assets: 575.22e9, price: 333.51, changePercent: -0.23, volume: 7763234, holdings: 3525 },
  { symbol: "QQQ", name: "Invesco QQQ Trust Series I", assetClass: "Equity", assets: 386.79e9, price: 607.77, changePercent: 0, volume: 64093235, holdings: 104 },
  { symbol: "VEA", name: "Vanguard FTSE Developed Markets ETF", assetClass: "Equity", assets: 206.98e9, price: 65.97, changePercent: 0.09, volume: 24905263, holdings: 3906 },
  { symbol: "VUG", name: "Vanguard Growth ETF", assetClass: "Equity", assets: 194.80e9, price: 463.28, changePercent: -0.18, volume: 1565931, holdings: 155 },
  { symbol: "GLD", name: "SPDR Gold Shares", assetClass: "Commodity", assets: 176.88e9, price: 477.86, changePercent: 1.13, volume: 9699635, holdings: 2 },
  { symbol: "IEFA", name: "iShares Core MSCI EAFE ETF", assetClass: "Equity", assets: 171.17e9, price: 92.60, changePercent: 0.17, volume: 34153484, holdings: 2658 },
  { symbol: "VTV", name: "Vanguard Value ETF", assetClass: "Equity", assets: 168.32e9, price: 199.92, changePercent: -0.27, volume: 5175206, holdings: 326 },
  { symbol: "BND", name: "Vanguard Total Bond Market ETF", assetClass: "Fixed Income", assets: 152.63e9, price: 74.22, changePercent: -0.31, volume: 8620199, holdings: 15000 },
  { symbol: "AGG", name: "iShares Core U.S. Aggregate Bond ETF", assetClass: "Fixed Income", assets: 139.74e9, price: 100.11, changePercent: -0.33, volume: 10177745, holdings: 13181 },
  { symbol: "IEMG", name: "iShares Core MSCI Emerging Markets ETF", assetClass: "Equity", assets: 137.17e9, price: 72.11, changePercent: 0.39, volume: 21693434, holdings: 2735 },
  { symbol: "VXUS", name: "Vanguard Total International Stock ETF", assetClass: "Equity", assets: 135.51e9, price: 79.12, changePercent: 0.22, volume: 9260054, holdings: 8728 },
  { symbol: "IWF", name: "iShares Russell 1000 Growth ETF", assetClass: "Equity", assets: 115.86e9, price: 451.37, changePercent: -0.24, volume: 4043058, holdings: 393 },
  { symbol: "VWO", name: "Vanguard FTSE Emerging Markets ETF", assetClass: "Equity", assets: 110.98e9, price: 55.51, changePercent: 0.69, volume: 14386608, holdings: 5034 },
  { symbol: "VGT", name: "Vanguard Information Technology ETF", assetClass: "Equity", assets: 108.15e9, price: 731.99, changePercent: 0.02, volume: 567286, holdings: 325 },
  { symbol: "IJH", name: "iShares Core S&P Mid-Cap ETF", assetClass: "Equity", assets: 106.71e9, price: 68.57, changePercent: -0.46, volume: 25518009, holdings: 408 },
  { symbol: "VIG", name: "Vanguard Dividend Appreciation ETF", assetClass: "Equity", assets: 102.14e9, price: 221.66, changePercent: -0.49, volume: 1419942, holdings: 348 },
  { symbol: "VO", name: "Vanguard Mid-Cap ETF", assetClass: "Equity", assets: 94.53e9, price: 295.34, changePercent: -0.87, volume: 749045, holdings: 297 },
];

const VIEW_TABS = ["General", "Filters", "Dividends", "Performance"];

export default function EtfScreenerPage() {
  const navigate = useNavigate();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterSearch, setFilterSearch] = useState("");
  const [activeFilters, setActiveFilters] = useState<{ key: string; label: string; value: string }[]>([]);
  const [sorting, setSorting] = useState<SortingState>([{ id: "assets", desc: true }]);
  const [activeTab, setActiveTab] = useState("General");
  const [findSearch, setFindSearch] = useState("");
  const [pageSize, setPageSize] = useState(20);

  const filteredData = useMemo(() => {
    let list = SEED_ETFS;
    if (findSearch.trim()) {
      const q = findSearch.trim().toLowerCase();
      list = list.filter((s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
    }
    return list;
  }, [findSearch]);

  const columns = useMemo<ColumnDef<EtfRow, any>[]>(
    () => [
      {
        accessorKey: "symbol",
        header: "Symbol",
        cell: ({ row }) => (
          <button
            onClick={() => navigate(`/etf/${row.original.symbol.toLowerCase()}`)}
            className="ticker-symbol text-accent-blue hover:underline text-[0.875rem] font-semibold"
          >
            {row.original.symbol}
          </button>
        ),
        size: 80,
      },
      {
        accessorKey: "name",
        header: "Fund Name",
        cell: ({ row }) => (
          <span className="text-foreground truncate block max-w-[280px]">{row.original.name}</span>
        ),
        size: 240,
      },
      {
        accessorKey: "assetClass",
        header: "Asset Class",
        cell: ({ row }) => <span className="text-foreground">{row.original.assetClass}</span>,
        size: 120,
      },
      {
        accessorKey: "assets",
        header: "Assets",
        cell: ({ row }) => abbreviateNumber(row.original.assets),
        meta: { align: "right" },
        size: 100,
      },
      {
        accessorKey: "price",
        header: "Stock Price",
        cell: ({ row }) => `$${row.original.price.toFixed(2)}`,
        meta: { align: "right" },
        size: 90,
      },
      {
        accessorKey: "changePercent",
        header: "% Change",
        cell: ({ row }) => {
          const v = row.original.changePercent;
          if (v === 0) return <span className="text-muted-foreground">-</span>;
          return (
            <span className={v > 0 ? "price-positive" : "price-negative"}>
              {v > 0 ? "" : ""}{v.toFixed(2)}%
            </span>
          );
        },
        meta: { align: "right" },
        size: 90,
      },
      {
        accessorKey: "volume",
        header: "Volume",
        cell: ({ row }) => row.original.volume.toLocaleString(),
        meta: { align: "right" },
        size: 110,
      },
      {
        accessorKey: "holdings",
        header: "Holdings",
        cell: ({ row }) => row.original.holdings.toLocaleString(),
        meta: { align: "right" },
        size: 80,
      },
    ],
    [navigate],
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

  const totalEtfs = filteredData.length;
  const pageIndex = table.getState().pagination.pageIndex;
  const totalPages = table.getPageCount();

  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex-1 max-w-[1280px] w-full mx-auto px-4 py-4">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-[0.8125rem] text-muted-foreground mb-4">
          <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
          <ChevronRight className="h-3 w-3" />
          <Link to="/etfs" className="hover:text-foreground transition-colors">ETFs</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground">ETF Screener</span>
        </nav>

        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <h1 className="text-[1.375rem] font-bold text-foreground">ETF Screener</h1>
            <button className="flex items-center gap-1 text-accent-blue text-sm hover:underline">
              <HelpCircle className="h-3.5 w-3.5" />
              Screener Tutorial
            </button>
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
                <SelectItem value="low-cost">Low Cost</SelectItem>
                <SelectItem value="high-dividend">High Dividend</SelectItem>
                <SelectItem value="bond">Bond ETFs</SelectItem>
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
                  placeholder="Search 106 filters..."
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
          <span className="text-sm font-semibold text-foreground">{totalEtfs > 20 ? "5005" : totalEtfs.toLocaleString()} ETFs</span>
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
            <Button variant="outline" size="sm" className="h-8 text-xs">
              Full Width
              <Lock className="h-3 w-3 ml-1" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8">
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b-2 border-border bg-surface">
                {table.getHeaderGroups().map((hg) =>
                  hg.headers.map((header) => {
                    const align = (header.column.columnDef.meta as any)?.align;
                    return (
                      <th
                        key={header.id}
                        onClick={header.column.getToggleSortingHandler()}
                        className={cn(
                          "table-header px-3 py-2.5 cursor-pointer select-none hover:text-foreground whitespace-nowrap",
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
                          "px-3 py-2.5 tabular-nums text-[0.875rem]",
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

        {/* Pagination */}
        {totalPages > 1 && (
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
                Page {pageIndex + 1} of {totalPages > 1 ? totalPages : 251}
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

        {/* Always show pagination info even with 1 page of seed data */}
        {totalPages <= 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 py-4">
            <Button variant="outline" size="sm" disabled className="text-xs">← Previous</Button>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Page 1 of 251</span>
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
            <Button variant="outline" size="sm" disabled className="text-xs">Next →</Button>
          </div>
        )}

        {/* Back to Top */}
        <div className="text-center py-2">
          <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="text-xs text-accent-blue hover:underline">
            ↑ Back to Top
          </button>
        </div>
      </div>

      <AdBanner />
      
    </div>
  );
}
