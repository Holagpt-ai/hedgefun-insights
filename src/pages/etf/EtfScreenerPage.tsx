import { useState, useMemo, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronUp, Search, Download, Plus, Star, X, ChevronRight, MoreVertical, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdBanner } from "@/components/layout/AdBanner";
import { ScreenerTutorialButton } from "@/components/screener/ScreenerTutorialDialog";
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getPaginationRowModel,
  type ColumnDef, type SortingState, flexRender,
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
  assets: number | null;
  price: number | null;
  changePercent: number | null;
  volume: number | null;
  holdings: number | null;
};

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

  const { data: dbData, isLoading } = useQuery({
    queryKey: ["etfs-screener"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etfs")
        .select("symbol, name, asset_class, total_assets, price, change_percent, volume, holdings")
        .order("total_assets", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        symbol: r.symbol,
        name: r.name,
        assetClass: r.asset_class ?? "Equity",
        assets: r.total_assets,
        price: r.price,
        changePercent: r.change_percent,
        volume: r.volume,
        holdings: r.holdings,
      })) as EtfRow[];
    },
  });

  const allData = dbData ?? [];

  const filteredData = useMemo(() => {
    if (!findSearch.trim()) return allData;
    const q = findSearch.trim().toLowerCase();
    return allData.filter((s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
  }, [findSearch, allData]);

  const columns = useMemo<ColumnDef<EtfRow, any>[]>(
    () => [
      {
        accessorKey: "symbol", header: "Symbol", size: 80,
        cell: ({ row }) => (
          <button onClick={() => navigate(`/etf/${row.original.symbol.toLowerCase()}`)} className="ticker-symbol text-accent-blue hover:underline text-[0.875rem] font-semibold">
            {row.original.symbol}
          </button>
        ),
      },
      {
        accessorKey: "name", header: "Fund Name", size: 240,
        cell: ({ row }) => <span className="text-foreground truncate block max-w-[280px]">{row.original.name}</span>,
      },
      {
        accessorKey: "assetClass", header: "Asset Class", size: 120,
        cell: ({ row }) => <span className="text-foreground">{row.original.assetClass}</span>,
      },
      {
        accessorKey: "assets", header: "Assets", meta: { align: "right" }, size: 100,
        cell: ({ row }) => abbreviateNumber(row.original.assets),
      },
      {
        accessorKey: "price", header: "Stock Price", meta: { align: "right" }, size: 90,
        cell: ({ row }) => row.original.price != null ? `$${Number(row.original.price).toFixed(2)}` : "—",
      },
      {
        accessorKey: "changePercent", header: "% Change", meta: { align: "right" }, size: 90,
        cell: ({ row }) => {
          const v = row.original.changePercent;
          if (v == null || v === 0) return <span className="text-muted-foreground">-</span>;
          return <span className={v > 0 ? "price-positive" : "price-negative"}>{v.toFixed(2)}%</span>;
        },
      },
      {
        accessorKey: "volume", header: "Volume", meta: { align: "right" }, size: 110,
        cell: ({ row }) => row.original.volume != null ? row.original.volume.toLocaleString() : "—",
      },
      {
        accessorKey: "holdings", header: "Holdings", meta: { align: "right" }, size: 80,
        cell: ({ row }) => row.original.holdings != null ? row.original.holdings.toLocaleString() : "—",
      },
    ],
    [navigate],
  );

  const table = useReactTable({
    data: filteredData, columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  const handlePageSizeChange = useCallback((val: string) => {
    const size = parseInt(val);
    setPageSize(size);
    table.setPageSize(size);
  }, [table]);

  const removeFilter = (key: string) => setActiveFilters((f) => f.filter((x) => x.key !== key));
  const totalEtfs = filteredData.length;
  const pageIndex = table.getState().pagination.pageIndex;
  const totalPages = table.getPageCount();

  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex-1 max-w-[1280px] w-full mx-auto px-4 py-4">
        <nav className="flex items-center gap-1 text-[0.8125rem] text-muted-foreground mb-4">
          <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
          <ChevronRight className="h-3 w-3" />
          <Link to="/etfs" className="hover:text-foreground transition-colors">ETFs</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground">ETF Screener</span>
        </nav>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <h1 className="text-[1.375rem] font-bold text-foreground">ETF Screener</h1>
            <ScreenerTutorialButton variant="etf" />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-xs text-muted-foreground">Exchange Country</div>
            <Select defaultValue="us">
              <SelectTrigger className="h-8 text-xs w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="us">🇺🇸 United States</SelectItem>
                <SelectItem value="ca">🇨🇦 Canada</SelectItem>
                <SelectItem value="gb">🇬🇧 United Kingdom</SelectItem>
              </SelectContent>
            </Select>
            <Select defaultValue="none">
              <SelectTrigger className="h-8 text-xs w-[140px]"><SelectValue placeholder="Popular Screens" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select popular</SelectItem>
                <SelectItem value="low-cost">Low Cost</SelectItem>
                <SelectItem value="high-dividend">High Dividend</SelectItem>
                <SelectItem value="bond">Bond ETFs</SelectItem>
              </SelectContent>
            </Select>
            <Select defaultValue="none">
              <SelectTrigger className="h-8 text-xs w-[130px]"><SelectValue placeholder="Saved Screens" /></SelectTrigger>
              <SelectContent><SelectItem value="none">Select saved</SelectItem></SelectContent>
            </Select>
          </div>
        </div>

        <button onClick={() => setFiltersOpen(!filtersOpen)} className="flex items-center gap-1 text-sm font-medium text-foreground mb-2 hover:text-accent-blue transition-colors">
          {filtersOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />} Filters
        </button>

        {filtersOpen && (
          <div className="fintech-card p-4 mb-4 space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <Button variant="outline" size="sm" className="border-accent-blue text-accent-blue hover:bg-accent-blue-light"><Plus className="h-3.5 w-3.5 mr-1" />Add Filters</Button>
              <div className="relative flex-1 max-w-[280px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} placeholder="Search 106 filters..." className="h-8 pl-8 text-xs" />
              </div>
            </div>
            {activeFilters.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {activeFilters.map((f) => (
                  <span key={f.key} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-accent-blue-light text-accent-blue text-xs font-medium">
                    {f.label}: {f.value}
                    <button onClick={() => removeFilter(f.key)}><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <span className="text-sm font-semibold text-foreground">{totalEtfs.toLocaleString()} ETFs</span>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={findSearch} onChange={(e) => setFindSearch(e.target.value)} placeholder="Find..." className="h-8 pl-7 text-xs w-[120px]" />
            </div>
            <Button variant="outline" size="sm" className="h-8 text-xs"><Download className="h-3.5 w-3.5 mr-1" />Download</Button>
            <Button size="sm" className="h-8 text-xs bg-accent-blue hover:bg-accent-blue-hover text-primary-foreground relative">
              <Star className="h-3.5 w-3.5 mr-1" />Watchlist
              <span className="absolute -top-1.5 -right-1.5 bg-green text-primary-foreground text-[0.625rem] px-1.5 py-0 rounded-full leading-4 font-semibold">New</span>
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs">Indicators</Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => navigate("/pro")}>Full Width<Lock className="h-3 w-3 ml-1" /></Button>
            <Button variant="outline" size="icon" className="h-8 w-8"><MoreVertical className="h-3.5 w-3.5" /></Button>
          </div>
        </div>

        <div className="flex items-center gap-0 border-b border-border mb-0 overflow-x-auto">
          {VIEW_TABS.map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={cn("px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap", activeTab === tab ? "border-accent-blue text-accent-blue" : "border-transparent text-muted-foreground hover:text-foreground")}>
              {tab}
              {tab === "Filters" && activeFilters.length > 0 && <span className="ml-1 bg-accent-blue text-primary-foreground text-[0.625rem] px-1.5 rounded-full">{activeFilters.length}</span>}
            </button>
          ))}
          <button className="px-3 py-2 text-sm text-muted-foreground border-b-2 border-transparent hover:text-foreground whitespace-nowrap">+ Add View</button>
          <button className="px-3 py-2 text-sm text-muted-foreground border-b-2 border-transparent hover:text-foreground whitespace-nowrap">✏️ Edit View</button>
        </div>

        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="border-b-2 border-border bg-surface">
                  {table.getHeaderGroups().map((hg) =>
                    hg.headers.map((header) => {
                      const align = (header.column.columnDef.meta as any)?.align;
                      return (
                        <th key={header.id} onClick={header.column.getToggleSortingHandler()} className={cn("table-header px-3 py-2.5 cursor-pointer select-none hover:text-foreground whitespace-nowrap", align === "right" ? "text-right" : "text-left")}>
                          <span className="inline-flex items-center gap-1">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {{ asc: <ChevronUp className="h-3 w-3" />, desc: <ChevronDown className="h-3 w-3" /> }[header.column.getIsSorted() as string] ?? null}
                          </span>
                        </th>
                      );
                    })
                  )}
                </tr>
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-b-0 hover:bg-surface transition-colors">
                    {row.getVisibleCells().map((cell) => {
                      const align = (cell.column.columnDef.meta as any)?.align;
                      return (
                        <td key={cell.id} className={cn("px-3 py-2.5 tabular-nums text-[0.875rem]", align === "right" ? "text-right" : "text-left")}>
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

        <div className="flex items-center justify-between py-3 border-t border-border mt-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Show</span>
            <select value={pageSize} onChange={(e) => handlePageSizeChange(e.target.value)} className="border border-border rounded px-2 py-1 text-sm bg-background text-foreground">
              {[20, 50, 100].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <span>per page</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="text-xs" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>← Previous</Button>
            <span className="text-sm text-muted-foreground">Page {pageIndex + 1} of {totalPages}</span>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>Next →</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
