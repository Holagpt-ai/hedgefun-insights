import { useMemo, useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowUpDown, ChevronUp, Download, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getListMeta, type ListFilter } from "@/config/stockListMeta";
import { tickerToSlug } from "@/lib/ticker-utils";
import {
  Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator, BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

/* ── helpers ── */
function abbr(n: number | null | undefined): string {
  if (n == null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function pct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function formatVolume(val: number | null | undefined): string {
  if (val == null || val === 0) return "—";
  if (val >= 1e9) return `${(val / 1e9).toFixed(1)}B`;
  if (val >= 1e6) return `${(val / 1e6).toFixed(1)}M`;
  if (val >= 1e3) return `${(val / 1e3).toFixed(1)}K`;
  return val.toLocaleString();
}

/* Column label map */
const COL_LABELS: Record<string, string> = {
  symbol: "Symbol",
  name: "Company Name",
  price: "Stock Price",
  changePercent: "% Change",
  marketCap: "Market Cap",
  peRatio: "P/E",
  volume: "Volume",
  revenue: "Revenue",
  sector: "Sector",
  industry: "Industry",
  exchange: "Exchange",
  eps: "EPS",
  beta: "Beta",
  divYield: "Div. Yield",
  divPayout: "Payout Ratio",
  employees: "Employees",
  revenueGrowth: "Rev. Growth",
  founded: "Founded",
  taxRate: "Tax Rate",
  rsi: "RSI",
  shortFloat: "Short % Float",
  consecutiveYears: "Consec. Years",
  country: "Country",
};

/* Map column key to row accessor */
const DB_KEY: Record<string, string> = {
  symbol: "symbol",
  name: "name",
  price: "price",
  changePercent: "change_percent",
  marketCap: "market_cap",
  peRatio: "pe_ratio",
  volume: "volume",
  revenue: "revenue",
  sector: "sector",
  industry: "industry",
  exchange: "exchange",
  eps: "eps",
  beta: "beta",
};

type StockRow = Record<string, any>;

const COMING_SOON_TABS = ["Performance", "Dividends", "Price", "Profile", "+ Add View", "Edit View"];

export default function StockListDetailPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const meta = getListMeta(slug);

  const [activeTab, setActiveTab] = useState("Overview");
  const [sorting, setSorting] = useState<SortingState>([{ id: "market_cap", desc: true }]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [livePrices, setLivePrices] = useState<Record<string, any>>({});

  const { data: stocks = [], isLoading } = useQuery({
    queryKey: ["stock-list", slug],
    queryFn: async () => {
      const f: ListFilter | undefined = meta.filter;

      if (f?.symbols && f.symbols.length > 0) {
        const { data, error } = await supabase
          .from("stocks")
          .select("symbol, name, price, change_percent, market_cap, pe_ratio, volume, revenue, sector, industry, exchange, eps, beta")
          .in("symbol", f.symbols)
          .order("market_cap", { ascending: false, nullsFirst: false });
        if (error) throw error;
        return (data ?? []) as StockRow[];
      }

      let query = supabase
        .from("stocks")
        .select("symbol, name, price, change_percent, market_cap, pe_ratio, volume, revenue, sector, industry, exchange, eps, beta");

      if (f?.marketCapMin != null) query = query.gte("market_cap", f.marketCapMin);
      if (f?.marketCapMax != null) query = query.lt("market_cap", f.marketCapMax);
      if (f?.exchange) query = query.ilike("exchange", `%${f.exchange}%`);
      if (f?.sector) query = query.ilike("sector", `%${f.sector}%`);
      if (f?.industry) query = query.ilike("industry", `%${f.industry}%`);
      if (f?.priceMax != null) query = query.lte("price", f.priceMax);

      const { data, error } = await query
        .order("market_cap", { ascending: false, nullsFirst: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as StockRow[];
    },
  });

  // Fetch live prices for visible rows
  const fetchLivePrices = useCallback(async (symbols: string[]) => {
    if (symbols.length === 0) return;
    try {
      const { data, error } = await supabase.functions.invoke("get-watchlist-data", {
        body: { symbols },
      });
      if (error || !data?.results) return;
      const updated: Record<string, any> = {};
      for (const snap of data.results) {
        const sym = snap.ticker;
        const price = snap?.day?.c > 0 ? snap.day.c : (snap?.min?.c > 0 ? snap.min.c : (snap?.lastTrade?.p ?? snap?.prevDay?.c ?? null));
        const prevClose = snap?.prevDay?.c ?? null;
        const change = price && prevClose ? ((price - prevClose) / prevClose) * 100 : null;
        const volume = (snap?.day?.v > 0 ? snap.day.v : null) ?? snap?.min?.av ?? snap?.min?.v ?? null;
        const marketCap = snap?.market_cap ?? null;
        updated[sym] = { price, change, volume, marketCap };
      }
      setLivePrices(prev => ({ ...prev, ...updated }));
    } catch { /* silent */ }
  }, []);

  // Build enriched data: merge DB rows with live prices
  const enrichedStocks = useMemo(() => {
    return stocks.map(row => {
      const live = livePrices[row.symbol];
      if (!live) return row;
      return {
        ...row,
        price: live.price ?? row.price,
        change_percent: live.change ?? row.change_percent,
        volume: live.volume ?? row.volume,
        market_cap: live.marketCap ?? row.market_cap,
      };
    });
  }, [stocks, livePrices]);

  const columns = useMemo<ColumnDef<StockRow>[]>(() => {
    return meta.columns.map((col) => {
      const dbKey = DB_KEY[col] ?? col;
      const label = COL_LABELS[col] ?? col;
      const hasData = !!DB_KEY[col];

      if (col === "symbol") {
        return {
          id: dbKey,
          accessorKey: "symbol",
          header: ({ column }: any) => (
            <button className="flex items-center gap-1 text-left" onClick={() => column.toggleSorting()}>
              No. <span className="font-semibold">{label}</span> <ArrowUpDown className="h-3 w-3" />
            </button>
          ),
          cell: ({ row }: any) => {
            const pageIndex = row.table?.getState().pagination.pageIndex ?? 0;
            const pSize = row.table?.getState().pagination.pageSize ?? 25;
            return (
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground text-xs w-6 text-right">{pageIndex * pSize + row.index + 1}</span>
                <Link
                  to={`/stocks/${tickerToSlug(row.original.symbol)}`}
                  className="font-semibold text-accent-blue hover:underline"
                >
                  {row.original.symbol}
                </Link>
              </div>
            );
          },
        };
      }

      if (col === "name") {
        return {
          id: "name",
          accessorKey: "name",
          header: ({ column }: any) => (
            <button className="flex items-center gap-1" onClick={() => column.toggleSorting()}>
              {label} <ArrowUpDown className="h-3 w-3" />
            </button>
          ),
          cell: ({ row }: any) => <span className="truncate max-w-[200px] block">{row.original.name}</span>,
        };
      }

      if (col === "marketCap" || col === "revenue") {
        return {
          id: dbKey,
          accessorKey: hasData ? dbKey : undefined,
          header: ({ column }: any) => (
            <button className="flex items-center gap-1 justify-end w-full" onClick={() => column.toggleSorting()}>
              {label} <ArrowUpDown className="h-3 w-3" />
            </button>
          ),
          cell: ({ row }: any) => (
            <div className="text-right tabular-nums">{hasData ? abbr(row.original[dbKey]) : "—"}</div>
          ),
        };
      }

      if (col === "changePercent") {
        return {
          id: "change_percent",
          accessorKey: "change_percent",
          header: ({ column }: any) => (
            <button className="flex items-center gap-1 justify-end w-full" onClick={() => column.toggleSorting()}>
              {label} <ArrowUpDown className="h-3 w-3" />
            </button>
          ),
          cell: ({ row }: any) => {
            const v = row.original.change_percent;
            return (
              <div className={`text-right tabular-nums font-medium ${v != null && v >= 0 ? "text-green" : "text-red"}`}>
                {pct(v)}
              </div>
            );
          },
        };
      }

      if (col === "price") {
        return {
          id: "price",
          accessorKey: "price",
          header: ({ column }: any) => (
            <button className="flex items-center gap-1 justify-end w-full" onClick={() => column.toggleSorting()}>
              {label} <ArrowUpDown className="h-3 w-3" />
            </button>
          ),
          cell: ({ row }: any) => (
            <div className="text-right tabular-nums">
              {row.original.price != null ? `$${Number(row.original.price).toFixed(2)}` : "—"}
            </div>
          ),
        };
      }

      if (col === "volume") {
        return {
          id: "volume",
          accessorKey: "volume",
          header: ({ column }: any) => (
            <button className="flex items-center gap-1 justify-end w-full" onClick={() => column.toggleSorting()}>
              {label} <ArrowUpDown className="h-3 w-3" />
            </button>
          ),
          cell: ({ row }: any) => (
            <div className="text-right tabular-nums">{formatVolume(row.original.volume)}</div>
          ),
        };
      }

      // Generic column
      return {
        id: dbKey,
        accessorKey: hasData ? dbKey : undefined,
        header: ({ column }: any) => (
          <button className="flex items-center gap-1" onClick={() => column.toggleSorting()}>
            {label} <ArrowUpDown className="h-3 w-3" />
          </button>
        ),
        cell: ({ row }: any) => {
          if (!hasData) return <span className="text-muted-foreground">—</span>;
          const v = row.original[dbKey];
          if (v == null) return <span className="text-muted-foreground">—</span>;
          if (typeof v === "number") return <div className="text-right tabular-nums">{v.toFixed(2)}</div>;
          return <span>{String(v)}</span>;
        },
      };
    });
  }, [meta.columns]);

  const table = useReactTable({
    data: enrichedStocks,
    columns,
    state: { sorting, globalFilter, pagination: { pageIndex: 0, pageSize } },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  // Fetch live data for visible rows
  useEffect(() => {
    const visibleRows = table.getRowModel().rows;
    const symbols = visibleRows.map(r => r.original.symbol).filter(Boolean);
    if (symbols.length > 0) {
      fetchLivePrices(symbols);
    }
  }, [table.getRowModel().rows.map(r => r.original.symbol).join(","), fetchLivePrices]);

  const totalStocks = table.getFilteredRowModel().rows.length;

  const handleTabClick = (tab: string) => {
    if (COMING_SOON_TABS.includes(tab)) {
      toast({ title: "Coming Soon", description: `${tab} tab is coming soon.` });
      return;
    }
    setActiveTab(tab);
  };

  return (
    <div className="min-w-0">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Breadcrumb */}
        <Breadcrumb className="mb-4">
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink href="/" className="text-[0.8125rem]">Home</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink href="/stocks/lists" className="text-[0.8125rem]">Lists</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage className="text-[0.8125rem]">{meta.title}</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Two-column layout */}
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-start justify-between mb-1">
              <h1 className="text-[1.375rem] font-bold text-foreground">{meta.title}</h1>
            </div>
            <p className="text-sm text-muted-foreground max-w-2xl mb-5">{meta.description}</p>

            {/* Stats bar */}
            <div className="flex items-center gap-6 mb-4 text-sm">
              <span className="font-semibold text-foreground">{totalStocks} {totalStocks === 1 ? "Stock" : "Stocks"}</span>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-0 border-b border-border mb-4 overflow-x-auto">
              {["Overview", "Performance", "Dividends", "Price", "Profile"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => handleTabClick(tab)}
                  className={`px-4 py-2 text-[0.8125rem] font-medium whitespace-nowrap transition-colors ${
                    activeTab === tab
                      ? "border-b-2 border-accent-blue text-accent-blue"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Controls row */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Find..."
                  value={globalFilter}
                  onChange={(e) => setGlobalFilter(e.target.value)}
                  className="h-8 w-48 pl-8 text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => navigate("/screener")}>
                  Screener →
                </Button>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Table */}
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 10 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <div className="border border-border rounded-[var(--radius)] overflow-hidden">
                <Table>
                  <TableHeader>
                    {table.getHeaderGroups().map((hg) => (
                      <TableRow key={hg.id} className="bg-muted/30">
                        {hg.headers.map((h) => (
                          <TableHead key={h.id} className="h-10 px-3 text-[0.8125rem] font-semibold text-muted-foreground whitespace-nowrap">
                            {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                          </TableHead>
                        ))}
                      </TableRow>
                    ))}
                  </TableHeader>
                  <TableBody>
                    {table.getRowModel().rows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={columns.length} className="text-center text-muted-foreground py-12">
                          No stocks found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      table.getRowModel().rows.map((row) => (
                        <TableRow key={row.id} className="hover:bg-muted/40">
                          {row.getVisibleCells().map((cell) => (
                            <TableCell key={cell.id} className="px-3 py-2 text-[0.875rem]">
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Pagination */}
            <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                >
                  ← Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                >
                  Next →
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Rows:</span>
                <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); table.setPageSize(Number(v)); }}>
                  <SelectTrigger className="h-8 w-[70px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[25, 50, 100].map((s) => (
                      <SelectItem key={s} value={String(s)}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Back to top */}
            <div className="text-center mt-6">
              <button
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                className="text-xs text-accent-blue hover:underline inline-flex items-center gap-1"
              >
                <ChevronUp className="h-3 w-3" /> Back to Top
              </button>
            </div>
          </div>

          {/* Right sidebar */}
          <div className="hidden lg:block w-[280px] flex-shrink-0 space-y-4">
            <SidebarCard
              title="HedgeFun Pro"
              body="Upgrade for unlimited access to all data and tools."
              cta="Upgrade Now →"
              to="/pro"
            />
            <SidebarCard
              title="Market Newsletter"
              body="Get a daily email with the top market news in bullet point format."
              cta="Subscribe Free →"
              to="/newsletter"
            />
            <SidebarCard
              title="Stock Screener"
              body="Filter, sort and analyze all stocks to find your next investment."
              cta="Open Screener →"
              to="/screener"
              variant="outline"
            />
            <SidebarCard
              title="Watchlists"
              body="Keep track of your favorite stocks in real time."
              cta="View Watchlist →"
              to="/watchlist"
              variant="outline"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarCard({ title, body, cta, to, variant }: {
  title: string; body: string; cta: string; to: string; variant?: "outline" | "default";
}) {
  const navigate = useNavigate();
  return (
    <div className="border border-border rounded-[var(--radius)] p-4">
      <h3 className="text-sm font-bold text-foreground mb-2">{title}</h3>
      <p className="text-[0.8125rem] text-muted-foreground mb-3">{body}</p>
      <Button
        variant={variant ?? "default"}
        onClick={() => navigate(to)}
        className={`w-full h-9 text-sm ${!variant ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""}`}
      >
        {cta}
      </Button>
    </div>
  );
}
