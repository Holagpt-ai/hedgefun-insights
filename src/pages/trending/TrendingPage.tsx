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
import { tickerToSlug } from "@/lib/ticker-utils";
import { AdBanner } from "@/components/layout/AdBanner";
import { toast } from "sonner";

/* ── seed data (used if DB returns nothing) ── */
const SEED: TrendingStock[] = [
  { symbol: "ORCL", name: "Oracle Corporation", views: 1948, market_cap: 429_390_000_000, change_percent: -1.43, volume: 51_544_624 },
  { symbol: "NVDA", name: "NVIDIA Corporation", views: 1725, market_cap: 4_490_000_000_000, change_percent: 1.16, volume: 179_118_529 },
  { symbol: "MSFT", name: "Microsoft Corporation", views: 1024, market_cap: 3_010_000_000_000, change_percent: -0.89, volume: 31_706_375 },
  { symbol: "MU", name: "Micron Technology, Inc.", views: 838, market_cap: 453_700_000_000, change_percent: 3.54, volume: 33_745_433 },
  { symbol: "KALA", name: "KALA BIO, Inc.", views: 664, market_cap: 8_300_000, change_percent: 12.82, volume: 1_226_544 },
  { symbol: "AMZN", name: "Amazon.com, Inc.", views: 627, market_cap: 2_300_000_000_000, change_percent: 0.39, volume: 35_678_835 },
  { symbol: "AVGO", name: "Broadcom Inc.", views: 624, market_cap: 1_620_000_000_000, change_percent: -0.92, volume: 29_531_698 },
  { symbol: "PLTR", name: "Palantir Technologies Inc.", views: 558, market_cap: 361_480_000_000, change_percent: -3.38, volume: 47_501_392 },
  { symbol: "DOMO", name: "Domo, Inc.", views: 517, market_cap: 183_080_000, change_percent: 2.58, volume: 5_920_569 },
  { symbol: "HIMS", name: "Hims & Hers Health, Inc.", views: 451, market_cap: 5_350_000_000, change_percent: 5.91, volume: 118_638_532 },
  { symbol: "AMD", name: "Advanced Micro Devices, Inc.", views: 418, market_cap: 331_350_000_000, change_percent: 0.27, volume: 29_139_162 },
  { symbol: "META", name: "Meta Platforms, Inc.", views: 396, market_cap: 1_650_000_000_000, change_percent: 1.03, volume: 9_859_251 },
  { symbol: "AAPL", name: "Apple Inc.", views: 387, market_cap: 3_830_000_000_000, change_percent: 0.37, volume: 30_590_766 },
  { symbol: "TSM", name: "Taiwan Semiconductor Manufact...", views: 381, market_cap: 1_580_000_000_000, change_percent: -0.46, volume: 12_985_621 },
  { symbol: "GOOGL", name: "Alphabet Inc.", views: 371, market_cap: 3_710_000_000_000, change_percent: 0.22, volume: 23_239_685 },
  { symbol: "TSSI", name: "TSS, Inc.", views: 369, market_cap: 318_740_000, change_percent: 10.61, volume: 2_439_408 },
  { symbol: "SOFI", name: "SoFi Technologies, Inc.", views: 364, market_cap: 23_320_000_000, change_percent: -2.66, volume: 62_077_130 },
  { symbol: "NBIS", name: "Nebius Group N.V.", views: 363, market_cap: 24_400_000_000, change_percent: 1.57, volume: 7_125_504 },
  { symbol: "TSLA", name: "Tesla, Inc.", views: 363, market_cap: 1_500_000_000_000, change_percent: 0.14, volume: 59_258_743 },
  { symbol: "AVAV", name: "AeroVironment, Inc.", views: 336, market_cap: 11_010_000_000, change_percent: -2.52, volume: 2_507_155 },
];

type TrendingStock = {
  symbol: string;
  name: string;
  views: number;
  market_cap: number | null;
  change_percent: number | null;
  volume: number | null;
};

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
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState("Overview");
  const [sorting, setSorting] = useState<SortingState>([{ id: "views", desc: true }]);

  const { data: stocks, isLoading } = useQuery({
    queryKey: ["trending-stocks"],
    queryFn: async () => {
      const { data } = await supabase
        .from("stocks")
        .select("symbol, name, market_cap, change_percent, volume")
        .order("volume", { ascending: false })
        .limit(20);
      if (data && data.length > 0) {
        return data.map((s, i) => ({
          symbol: s.symbol,
          name: s.name,
          views: SEED[i]?.views ?? Math.floor(Math.random() * 1000),
          market_cap: s.market_cap,
          change_percent: s.change_percent,
          volume: s.volume,
        })) as TrendingStock[];
      }
      return SEED;
    },
    staleTime: 300_000,
  });

  const filtered = useMemo(() => {
    if (!stocks) return [];
    if (!search) return stocks;
    const q = search.toLowerCase();
    return stocks.filter(
      (s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
    );
  }, [stocks, search]);

  const columns = useMemo<ColumnDef<TrendingStock>[]>(
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
              onClick={() => navigate(`/stocks/${tickerToSlug(t)}`)}
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
        accessorKey: "views",
        header: () => <span className="text-right block">Views ↓</span>,
        cell: ({ getValue }) => (
          <span className="text-right block tabular-nums text-[0.875rem]">
            {getValue<number>().toLocaleString()}
          </span>
        ),
        size: 80,
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
      {
        accessorKey: "volume",
        header: () => <span className="text-right block">Volume</span>,
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
    ],
    [navigate]
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

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="min-w-0">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-[1.75rem] font-bold text-foreground">Trending Today</h1>
          <Button variant="outline" size="sm" className="gap-1.5 text-muted-foreground shrink-0" onClick={() => navigate("/pro")}>
            Full Width <Lock className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Two-column layout */}
        <div className="flex gap-8">
          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Section heading row */}
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="text-[1.125rem] font-bold text-foreground">Top Stocks</h2>
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
                <Button variant="outline" size="icon" className="h-8 w-8 text-muted-foreground">⋮</Button>
              </div>
            </div>

            {/* Tab bar */}
            <div className="flex items-center gap-0 border-b border-border mb-4 overflow-x-auto">
              {TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                    activeTab === tab
                      ? "text-primary border-b-2 border-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab}
                </button>
              ))}
              <button className="px-4 py-2 text-sm text-muted-foreground border border-border rounded-md ml-2 mb-1 hover:text-foreground">
                + Add View
              </button>
              <button className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground ml-1">
                Edit View
              </button>
            </div>

            {/* Table */}
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 10 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
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

                {/* Pagination */}
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

                {/* Updated timestamp */}
                <p className="text-[0.8125rem] text-muted-foreground mt-2">
                  Updated: {dateStr}, 8:30 AM EDT. Stocks are sorted by pageviews according to Plausible Analytics.
                </p>

                {/* Back to top */}
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

          {/* Sidebar */}
          <aside className="hidden md:flex flex-col gap-4 w-[300px] shrink-0 sticky top-20 self-start">
            {[
              { title: "HedgeFun Pro", desc: "Upgrade now for unlimited access to all data and tools.", route: "/pro" },
              { title: "Market Newsletter", desc: "Get a daily email with the top market news in bullet point format.", route: "/newsletter" },
              { title: "Stock Screener", desc: "Filter, sort and analyze all stocks to find your next investment.", route: "/screener" },
              { title: "Watchlists", desc: "Keep track of all your favorite stocks in real-time.", route: "/watchlist" },
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

      {/* Ad banner above footer */}
      <AdBanner />

      
    </div>
  );
}
