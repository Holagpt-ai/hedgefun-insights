import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  type ColumnDef,
  type SortingState,
  flexRender,
} from "@tanstack/react-table";
import { ArrowUpRight, Lock, ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AdBanner } from "@/components/layout/AdBanner";

import { tickerToSlug } from "@/lib/ticker-utils";
import { cn } from "@/lib/utils";

const LETTERS = ["All", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];

function abbr(n: number | null | undefined): string {
  if (n == null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

interface StockRow {
  symbol: string;
  name: string;
  price: number | null;
  change_percent: number | null;
  market_cap: number | null;
  revenue: number | null;
  pe_ratio: number | null;
  exchange: string | null;
  sector: string | null;
  industry: string | null;
}

export default function AllStocksPage() {
  useEffect(() => { document.title = "All Stock Symbols | HedgeFun"; }, []);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeLetter = searchParams.get("letter") || "All";
  const [sorting, setSorting] = useState<SortingState>([{ id: "market_cap", desc: true }]);
  const [nlEmail, setNlEmail] = useState("");

  const { data: stocks, isLoading } = useQuery({
    queryKey: ["all-stocks", activeLetter],
    queryFn: async () => {
      let q = supabase
        .from("stocks")
        .select("symbol, name, price, change_percent, market_cap, revenue, pe_ratio, exchange, sector, industry")
        .order("market_cap", { ascending: false, nullsFirst: false });

      if (activeLetter !== "All") {
        q = q.ilike("symbol", `${activeLetter}%`);
      }

      const { data, error } = await q.limit(1000);
      if (error) throw error;
      return (data ?? []) as StockRow[];
    },
    staleTime: 60_000,
  });

  const columns = useMemo<ColumnDef<StockRow>[]>(() => [
    {
      id: "row_num",
      header: () => <span className="text-right w-full block">No.</span>,
      cell: ({ row }) => <span className="text-right block text-muted-foreground">{row.index + 1}</span>,
      size: 48,
      enableSorting: false,
    },
    {
      accessorKey: "symbol",
      header: "Symbol",
      size: 80,
      cell: ({ row }) => (
        <button
          onClick={() => navigate(`/stocks/${tickerToSlug(row.original.symbol)}`)}
          className="text-accent-blue font-semibold hover:underline cursor-pointer"
        >
          {row.original.symbol}
        </button>
      ),
    },
    {
      accessorKey: "name",
      header: "Company Name",
      size: 200,
      cell: ({ getValue }) => <span className="truncate block">{getValue() as string}</span>,
    },
    {
      accessorKey: "price",
      header: () => <span className="text-right w-full block">Stock Price</span>,
      size: 100,
      cell: ({ getValue }) => {
        const v = getValue() as number | null;
        return <span className="text-right block">{v != null ? `$${v.toFixed(2)}` : "—"}</span>;
      },
    },
    {
      accessorKey: "change_percent",
      header: () => <span className="text-right w-full block">% Change</span>,
      size: 90,
      cell: ({ getValue }) => {
        const v = getValue() as number | null;
        if (v == null) return <span className="text-right block">—</span>;
        return (
          <span className={cn("text-right block font-medium", v >= 0 ? "text-green" : "text-red")}>
            {v >= 0 ? "+" : ""}{v.toFixed(2)}%
          </span>
        );
      },
    },
    {
      accessorKey: "market_cap",
      header: () => <span className="text-right w-full block">Market Cap</span>,
      size: 110,
      cell: ({ getValue }) => <span className="text-right block">{abbr(getValue() as number | null)}</span>,
    },
    {
      accessorKey: "revenue",
      header: () => <span className="text-right w-full block">Revenue</span>,
      size: 110,
      cell: ({ getValue }) => <span className="text-right block">{abbr(getValue() as number | null)}</span>,
    },
    {
      accessorKey: "pe_ratio",
      header: () => <span className="text-right w-full block">PE Ratio</span>,
      size: 80,
      cell: ({ getValue }) => {
        const v = getValue() as number | null;
        return <span className="text-right block">{v != null ? v.toFixed(2) : "—"}</span>;
      },
    },
    {
      accessorKey: "exchange",
      header: "Exchange",
      size: 80,
      cell: ({ getValue }) => {
        const v = getValue() as string | null;
        if (!v) return "—";
        return (
          <span className="inline-block px-2 py-0.5 text-xs rounded bg-muted text-muted-foreground font-medium">
            {v}
          </span>
        );
      },
    },
  ], [navigate]);

  const table = useReactTable({
    data: stocks ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 100 } },
  });

  const setLetter = (l: string) => {
    if (l === "All") {
      setSearchParams({});
    } else {
      setSearchParams({ letter: l });
    }
    table.setPageIndex(0);
  };

  return (
    <>
      <div className="max-w-[1400px] mx-auto px-4 py-6">
        {/* Breadcrumb */}
        <nav className="text-[0.8125rem] text-muted-foreground mb-4">
          <button onClick={() => navigate("/")} className="hover:underline cursor-pointer">Home</button>
          <span className="mx-1">»</span>
          <span className="text-foreground">Stocks</span>
        </nav>

        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-border pb-3 mb-4">
          <h1 className="text-[1.75rem] font-bold text-foreground">All Stock Symbols</h1>
          <Button variant="outline" size="sm" className="gap-1.5 text-muted-foreground">
            <Lock className="h-3.5 w-3.5" /> Full Width
          </Button>
        </div>

        {/* Letter tabs */}
        <div className="flex flex-wrap gap-0 border-b border-border mb-6">
          {LETTERS.map((l) => (
            <button
              key={l}
              onClick={() => setLetter(l)}
              className={cn(
                "px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                activeLetter === l
                  ? "text-accent-blue border-b-2 border-accent-blue"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {l}
            </button>
          ))}
        </div>

        <div className="flex gap-6">
          {/* Main table */}
          <div className="flex-1 min-w-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  {table.getHeaderGroups().map((hg) => (
                    <tr key={hg.id} className="border-b-2 border-border">
                      {hg.headers.map((h) => (
                        <th
                          key={h.id}
                          onClick={h.column.getCanSort() ? h.column.getToggleSortingHandler() : undefined}
                          className={cn(
                            "text-[0.8125rem] font-semibold text-secondary-foreground px-2.5 py-2 text-left",
                            h.column.getCanSort() && "cursor-pointer select-none hover:text-foreground"
                          )}
                          style={{ width: h.getSize() }}
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {h.column.getIsSorted() === "asc" ? " ↑" : h.column.getIsSorted() === "desc" ? " ↓" : ""}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {isLoading
                    ? Array.from({ length: 20 }).map((_, i) => (
                        <tr key={i} className="border-b border-border/50">
                          {columns.map((_, ci) => (
                            <td key={ci} className="px-2.5 py-2">
                              <Skeleton className="h-4 w-full" />
                            </td>
                          ))}
                        </tr>
                      ))
                    : table.getRowModel().rows.map((row) => (
                        <tr key={row.id} className="border-b border-border/50 hover:bg-surface transition-colors">
                          {row.getVisibleCells().map((cell) => (
                            <td key={cell.id} className="px-2.5 py-2">
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          ))}
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {!isLoading && (
              <div className="flex items-center justify-between mt-4 text-sm">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                  className="gap-1"
                >
                  <ChevronLeft className="h-4 w-4" /> Previous
                </Button>
                <span className="text-muted-foreground">
                  Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                  className="gap-1"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Back to top */}
            <div className="text-center mt-6">
              <button
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                className="text-sm text-accent-blue hover:underline cursor-pointer inline-flex items-center gap-1"
              >
                <ArrowUp className="h-3.5 w-3.5" /> Back to Top
              </button>
            </div>
          </div>

          {/* Right sidebar */}
          <aside className="hidden lg:flex flex-col gap-4 w-[300px] shrink-0">
            {/* Pro card */}
            <button
              onClick={() => navigate("/pro")}
              className="relative border border-border rounded-md p-5 text-left hover:border-accent-blue transition-colors cursor-pointer bg-card"
            >
              <ArrowUpRight className="absolute top-4 right-4 h-4 w-4 text-muted-foreground" />
              <h3 className="text-base font-bold text-foreground">HedgeFun Pro</h3>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                Upgrade now for unlimited access to all data and tools.
              </p>
            </button>

            {/* Ad */}
            <div className="min-h-[250px]">
              <AdBanner />
            </div>

            {/* Screener card */}
            <button
              onClick={() => navigate("/screener")}
              className="relative border border-border rounded-md p-5 text-left hover:border-accent-blue transition-colors cursor-pointer bg-card"
            >
              <ArrowUpRight className="absolute top-4 right-4 h-4 w-4 text-muted-foreground" />
              <h3 className="text-base font-bold text-foreground">Stock Screener</h3>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                Filter, sort and analyze all stocks to find your next investment.
              </p>
            </button>

            {/* Newsletter card */}
            <div className="border border-border rounded-md p-5 bg-card">
              <h3 className="text-base font-bold text-foreground">Market Newsletter</h3>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                Get a daily email with the top market news in bullet point format.
              </p>
              <div className="mt-3 flex gap-2">
                <Input
                  placeholder="Enter your email"
                  value={nlEmail}
                  onChange={(e) => setNlEmail(e.target.value)}
                  className="h-9 text-sm"
                />
                <Button size="sm" className="bg-accent-blue hover:bg-accent-blue-hover text-primary-foreground shrink-0">
                  Subscribe
                </Button>
              </div>
            </div>
          </aside>
        </div>
      </div>
      <Footer />
    </>
  );
}
