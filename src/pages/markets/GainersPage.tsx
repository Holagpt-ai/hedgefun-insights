import { useState, useMemo } from "react";
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
import { Search, Info, MoreVertical, Download } from "lucide-react";
import { getTopGainers } from "@/lib/polygon";
import { MarketMoversTabBar } from "@/components/markets/MarketMoversTabBar";
import { IndexSparklines } from "@/components/markets/IndexSparklines";
import { AdBanner } from "@/components/layout/AdBanner";

import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";

interface GainerRow {
  rank: number;
  symbol: string;
  name: string;
  changePercent: number;
  price: number;
  volume: number;
  marketCap: number;
}

const SEED: GainerRow[] = [
  { rank: 1, symbol: "ACXP", name: "Acurx Pharmaceuticals, Inc.", changePercent: 107.93, price: 6.03, volume: 107076910, marketCap: 15360000 },
  { rank: 2, symbol: "SAFX", name: "XCF Global, Inc.", changePercent: 74.50, price: 0.498, volume: 127799140, marketCap: 115920000 },
  { rank: 3, symbol: "SXTP", name: "60 Degrees Pharmaceuticals, Inc.", changePercent: 71.28, price: 3.22, volume: 57303910, marketCap: 4140000 },
  { rank: 4, symbol: "PAVS", name: "Paranovus Entertainment Technology Ltd.", changePercent: 65.22, price: 2.28, volume: 6002947, marketCap: 2920000 },
  { rank: 5, symbol: "ASNS", name: "Actelis Networks, Inc.", changePercent: 47.57, price: 0.555, volume: 380034166, marketCap: 4860000 },
  { rank: 6, symbol: "ROMA", name: "Roma Green Finance Limited", changePercent: 39.19, price: 4.83, volume: 741198, marketCap: 287700000 },
  { rank: 7, symbol: "TANH", name: "Tantech Holdings Ltd", changePercent: 35.35, price: 1.03, volume: 271153, marketCap: 6320000 },
  { rank: 8, symbol: "AMCI", name: "AMC Robotics Corporation", changePercent: 35.00, price: 9.45, volume: 867715, marketCap: 213530000 },
  { rank: 9, symbol: "BODI", name: "The Beachbody Company, Inc.", changePercent: 30.97, price: 10.91, volume: 257251, marketCap: 78330000 },
  { rank: 10, symbol: "OCGN", name: "Ocugen, Inc.", changePercent: 29.94, price: 2.30, volume: 40979796, marketCap: 754160000 },
  { rank: 11, symbol: "POLA", name: "Polar Power, Inc.", changePercent: 26.80, price: 1.94, volume: 1443273, marketCap: 5160000 },
  { rank: 12, symbol: "CVGI", name: "Commercial Vehicle Group, Inc.", changePercent: 25.31, price: 2.03, volume: 46302295, marketCap: 69860000 },
  { rank: 13, symbol: "NVTS", name: "Navitas Semiconductor Corporation", changePercent: 24.88, price: 10.84, volume: 55662295, marketCap: 2500000000 },
  { rank: 14, symbol: "KALA", name: "KALA BIO, Inc.", changePercent: 24.16, price: 0.365, volume: 291099810, marketCap: 10310000 },
  { rank: 15, symbol: "AHG", name: "Akso Health Group", changePercent: 23.60, price: 2.20, volume: 224677, marketCap: 1880000000 },
  { rank: 16, symbol: "ADAG", name: "Adagene Inc.", changePercent: 21.16, price: 3.55, volume: 2127061, marketCap: 167320000 },
  { rank: 17, symbol: "FTEL", name: "Fitell Corporation", changePercent: 20.89, price: 1.91, volume: 1074684, marketCap: 2690000 },
  { rank: 18, symbol: "LIXT", name: "Lixte Biotechnology Holdings, Inc.", changePercent: 20.62, price: 3.10, volume: 42227, marketCap: 27010000 },
  { rank: 19, symbol: "PED", name: "PEDEVCO Corp.", changePercent: 20.62, price: 0.80, volume: 1357245, marketCap: 212840000 },
  { rank: 20, symbol: "ACTG", name: "Acacia Research Corporation", changePercent: 20.48, price: 5.00, volume: 2763084, marketCap: 482300000 },
];

function abbr(n: number | null | undefined): string {
  if (n == null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return n.toLocaleString();
  return n.toString();
}

const TIME_TABS = ["Today", "Week", "Month", "YTD", "Year", "3 Years", "5 Years"];
const VIEW_TABS = ["Overview", "Performance", "Price", "Profile", "Financials"];

export default function GainersPage() {
  const navigate = useNavigate();
  const [sorting, setSorting] = useState<SortingState>([{ id: "changePercent", desc: true }]);
  const [search, setSearch] = useState("");
  const [activeTime, setActiveTime] = useState("Today");

  const { data: apiData, isLoading } = useQuery({
    queryKey: ["top-gainers-page"],
    queryFn: async () => {
      try {
        const res = await getTopGainers();
        if (Array.isArray(res) && res.length > 0) {
          return res.map((m: any, i: number) => ({
            rank: i + 1,
            symbol: m.ticker || m.symbol || "",
            name: m.name || m.ticker || "",
            changePercent: m.todaysChangePerc ?? m.change_percent ?? 0,
            price: m.day?.c ?? m.price ?? 0,
            volume: m.day?.v ?? m.volume ?? 0,
            marketCap: m.market_cap ?? 0,
          }));
        }
        return null;
      } catch {
        return null;
      }
    },
    staleTime: 60_000,
  });

  const rows = apiData ?? SEED;
  const filtered = useMemo(() => {
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) => r.symbol.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const columns = useMemo<ColumnDef<GainerRow>[]>(
    () => [
      {
        accessorKey: "rank",
        header: "No.",
        size: 40,
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-[0.875rem] tabular-nums" style={{ color: "hsl(var(--text-secondary))" }}>
            {row.index + 1}
          </span>
        ),
      },
      {
        accessorKey: "symbol",
        header: "Symbol",
        size: 70,
        cell: ({ getValue }) => {
          const s = getValue<string>();
          return (
            <button
              onClick={() => {
                trackEvent("stock_search", { ticker: s });
                navigate(`/stocks/${s.toLowerCase()}`);
              }}
              className="ticker-symbol text-[0.875rem] hover:underline"
              style={{ color: "hsl(var(--accent-blue))" }}
            >
              {s}
            </button>
          );
        },
      },
      {
        accessorKey: "name",
        header: "Company Name",
        cell: ({ getValue }) => (
          <span className="text-[0.875rem]" style={{ color: "hsl(var(--text-primary))" }}>
            {getValue<string>()}
          </span>
        ),
      },
      {
        accessorKey: "changePercent",
        header: "% Change",
        size: 90,
        cell: ({ getValue }) => {
          const v = getValue<number>();
          return (
            <span className="text-[0.875rem] font-medium tabular-nums text-right block" style={{ color: "hsl(var(--green))" }}>
              {v.toFixed(2)}%
            </span>
          );
        },
      },
      {
        accessorKey: "price",
        header: "Stock Price",
        size: 90,
        cell: ({ getValue }) => (
          <span className="text-[0.875rem] tabular-nums text-right block" style={{ color: "hsl(var(--text-primary))" }}>
            {getValue<number>().toFixed(2)}
          </span>
        ),
      },
      {
        accessorKey: "volume",
        header: "Volume",
        size: 110,
        cell: ({ getValue }) => (
          <span className="text-[0.875rem] tabular-nums text-right block" style={{ color: "hsl(var(--text-primary))" }}>
            {getValue<number>().toLocaleString()}
          </span>
        ),
      },
      {
        accessorKey: "marketCap",
        header: "Market Cap",
        size: 100,
        cell: ({ getValue }) => (
          <span className="text-[0.875rem] tabular-nums text-right block" style={{ color: "hsl(var(--text-primary))" }}>
            {abbr(getValue<number>())}
          </span>
        ),
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

  const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="w-full">
      {/* Market Movers Tab Bar */}
      <MarketMoversTabBar />

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Page Heading */}
        <h1 className="text-[1.75rem] font-bold mb-4" style={{ color: "hsl(var(--text-primary))" }}>
          Market Movers
        </h1>

        {/* Time Tab Bar */}
        <div className="flex items-center gap-1 mb-6">
          {TIME_TABS.map((t) => (
            <button
              key={t}
              onClick={() => setActiveTime(t)}
              className="text-[0.875rem] px-3.5 py-1.5 rounded transition-colors"
              style={
                activeTime === t
                  ? { background: "hsl(var(--text-primary))", color: "white", fontWeight: 600 }
                  : { color: "hsl(var(--text-secondary))" }
              }
            >
              {t}
            </button>
          ))}
        </div>

        {/* Index Sparklines */}
        <IndexSparklines />

        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-[1.125rem] font-bold" style={{ color: "hsl(var(--text-primary))" }}>
              Gainers Today
            </h2>
            <Info className="h-4 w-4" style={{ color: "hsl(var(--text-muted))" }} />
            <span className="text-[0.8125rem]" style={{ color: "hsl(var(--text-muted))" }}>
              Updated {today}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "hsl(var(--text-muted))" }} />
              <input
                type="text"
                placeholder="Find..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-[120px] pl-8 pr-2 text-[0.8125rem] rounded border border-border bg-background"
              />
            </div>
            <Button variant="outline" size="sm" className="text-[0.8125rem] h-8 gap-1">
              Indicators
            </Button>
            <Button variant="outline" size="sm" className="text-[0.8125rem] h-8" style={{ color: "hsl(var(--accent-blue))", borderColor: "hsl(var(--accent-blue))" }}>
              Screener →
            </Button>
            <Button variant="outline" size="sm" className="h-8 w-8 p-0">
              <Download className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="sm" className="h-8 w-8 p-0">
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* View Tab Bar */}
        <div className="flex items-center gap-0 border-b border-border mb-0">
          {VIEW_TABS.map((t, i) => (
            <button
              key={t}
              className="px-3 py-2 text-[0.875rem] transition-colors relative"
              style={{
                fontWeight: i === 0 ? 600 : 400,
                color: i === 0 ? "hsl(var(--accent-blue))" : "hsl(var(--text-secondary))",
              }}
            >
              {t}
              {i === 0 && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: "hsl(var(--accent-blue))" }} />
              )}
            </button>
          ))}
          <button className="px-3 py-2 text-[0.8125rem] border border-border rounded ml-2" style={{ color: "hsl(var(--text-secondary))" }}>
            + Add View
          </button>
          <button className="px-3 py-2 text-[0.8125rem]" style={{ color: "hsl(var(--text-secondary))" }}>
            Edit View
          </button>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-2 py-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} style={{ background: "hsl(var(--surface))", borderBottom: "2px solid hsl(var(--border))" }}>
                    {hg.headers.map((header) => {
                      const isRight = ["changePercent", "price", "volume", "marketCap"].includes(header.id);
                      const isRank = header.id === "rank";
                      return (
                        <th
                          key={header.id}
                          className="table-header px-3 py-2.5 cursor-pointer select-none"
                          style={{
                            textAlign: isRight || isRank ? "right" : "left",
                            width: header.getSize() !== 150 ? header.getSize() : undefined,
                          }}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          <span className="inline-flex items-center gap-1">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {header.column.getIsSorted() === "desc" && " ↓"}
                            {header.column.getIsSorted() === "asc" && " ↑"}
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="transition-colors"
                    style={{ borderBottom: "1px solid hsl(var(--border-subtle))" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "hsl(var(--surface))")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const isRight = ["changePercent", "price", "volume", "marketCap", "rank"].includes(cell.column.id);
                      return (
                        <td
                          key={cell.id}
                          className="px-3 py-2.5"
                          style={{ textAlign: isRight ? "right" : "left" }}
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
        <div className="flex items-center justify-between py-4 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="text-[0.8125rem] h-8"
          >
            ← Previous
          </Button>
          <div className="flex items-center gap-3 text-[0.8125rem]" style={{ color: "hsl(var(--text-secondary))" }}>
            <span>Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}</span>
            <select
              value={table.getState().pagination.pageSize}
              onChange={(e) => table.setPageSize(Number(e.target.value))}
              className="h-8 rounded border border-border bg-background px-2 text-[0.8125rem]"
            >
              {[20, 50, 100].map((s) => (
                <option key={s} value={s}>{s} Rows</option>
              ))}
            </select>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="text-[0.8125rem] h-8"
          >
            Next →
          </Button>
        </div>

        <div className="w-full flex flex-col items-center border-t border-border bg-surface py-1 mt-8">
          <AdBanner slot="bottom" />
        </div>
      </div>

      
    </div>
  );
}
