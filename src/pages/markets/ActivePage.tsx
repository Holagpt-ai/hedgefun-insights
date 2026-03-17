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
import { Search, MoreVertical, Download } from "lucide-react";
import { MarketMoversTabBar } from "@/components/markets/MarketMoversTabBar";
import { IndexSparklines } from "@/components/markets/IndexSparklines";

import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";

interface ActiveRow {
  rank: number;
  symbol: string;
  name: string;
  volume: number;
  price: number;
  changePercent: number;
  marketCap: number;
}

const SEED: ActiveRow[] = [
  { rank: 1, symbol: "ASNS", name: "Actelis Networks, Inc.", volume: 380034166, price: 0.555, changePercent: 47.57, marketCap: 4860000 },
  { rank: 2, symbol: "KALA", name: "KALA BIO, Inc.", volume: 291099810, price: 0.365, changePercent: 24.16, marketCap: 10310000 },
  { rank: 3, symbol: "NVDA", name: "NVIDIA Corporation", volume: 145251625, price: 186.03, changePercent: 0.69, marketCap: 4520000000000 },
  { rank: 4, symbol: "SCNX", name: "Scienture Holdings, Inc.", volume: 143013800, price: 0.464, changePercent: 19.46, marketCap: 18860000 },
  { rank: 5, symbol: "SAFX", name: "XCF Global, Inc.", volume: 127799140, price: 0.498, changePercent: 74.50, marketCap: 115920000 },
  { rank: 6, symbol: "DXST", name: "Decent Holding Inc.", volume: 127029691, price: 0.442, changePercent: 10.91, marketCap: 20060000 },
  { rank: 7, symbol: "PATH", name: "UiPath, Inc.", volume: 120191583, price: 12.38, changePercent: 6.82, marketCap: 6620000000 },
  { rank: 8, symbol: "KOS", name: "Kosmos Energy Ltd.", volume: 116400575, price: 2.01, changePercent: -16.60, marketCap: 966860000 },
  { rank: 9, symbol: "HIMS", name: "Hims & Hers Health, Inc.", volume: 111773002, price: 25.88, changePercent: 10.27, marketCap: 5900000000 },
  { rank: 10, symbol: "ACXP", name: "Acurx Pharmaceuticals, Inc.", volume: 107076910, price: 6.03, changePercent: 107.93, marketCap: 15360000 },
  { rank: 11, symbol: "WORX", name: "SCWorx Corp.", volume: 94008938, price: 0.146, changePercent: 15.32, marketCap: 2310000 },
  { rank: 12, symbol: "AAL", name: "American Airlines Group Inc.", volume: 90955060, price: 11.04, changePercent: -0.63, marketCap: 7290000000 },
  { rank: 13, symbol: "ONDS", name: "Ondas Inc.", volume: 88354210, price: 9.83, changePercent: -1.80, marketCap: 4420000000 },
  { rank: 14, symbol: "ELPW", name: "Elong Power Holding Limited", volume: 87853828, price: 0.0523, changePercent: -17.90, marketCap: 5930000 },
  { rank: 15, symbol: "GSUN", name: "Golden Sun Technology Group Limited", volume: 84655265, price: 0.569, changePercent: 12.33, marketCap: 4970000 },
  { rank: 16, symbol: "ORCL", name: "Oracle Corporation", volume: 83294053, price: 163.12, changePercent: 9.18, marketCap: 469140000000 },
  { rank: 17, symbol: "SGN", name: "Signing Day Sports, Inc.", volume: 78510016, price: 0.720, changePercent: 12.61, marketCap: 9870000 },
  { rank: 18, symbol: "NIO", name: "NIO Inc.", volume: 78323659, price: 5.47, changePercent: -4.04, marketCap: 13830000000 },
  { rank: 19, symbol: "INTC", name: "Intel Corporation", volume: 72474401, price: 47.98, changePercent: 2.57, marketCap: 239660000000 },
  { rank: 20, symbol: "PLUG", name: "Plug Power Inc.", volume: 67391084, price: 2.23, changePercent: 5.19, marketCap: 3110000000 },
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

const VIEW_TABS = ["Overview", "Performance", "Price", "Profile", "Financials", "Technicals"];

export default function ActivePage() {
  const navigate = useNavigate();
  const [sorting, setSorting] = useState<SortingState>([{ id: "volume", desc: true }]);
  const [search, setSearch] = useState("");

  const { data: apiData, isLoading } = useQuery({
    queryKey: ["most-active-page"],
    queryFn: async () => {
      // No dedicated Polygon endpoint for most active yet — use seed
      return null;
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

  const columns = useMemo<ColumnDef<ActiveRow>[]>(
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
        accessorKey: "volume",
        header: "Volume",
        size: 120,
        cell: ({ getValue }) => (
          <span className="text-[0.875rem] tabular-nums text-right block" style={{ color: "hsl(var(--text-primary))" }}>
            {getValue<number>().toLocaleString()}
          </span>
        ),
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
        accessorKey: "changePercent",
        header: "% Change",
        size: 90,
        cell: ({ getValue }) => {
          const v = getValue<number>();
          const positive = v >= 0;
          return (
            <span
              className="text-[0.875rem] font-medium tabular-nums text-right block"
              style={{ color: positive ? "hsl(var(--green))" : "hsl(var(--red))" }}
            >
              {v.toFixed(2)}%
            </span>
          );
        },
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
      <MarketMoversTabBar />

      <div className="max-w-7xl mx-auto px-4 py-6">
        <h1 className="text-[1.75rem] font-bold mb-4" style={{ color: "hsl(var(--text-primary))" }}>
          Market Movers
        </h1>

        {/* No time tab bar for Most Active */}

        <IndexSparklines />

        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-[1.125rem] font-bold" style={{ color: "hsl(var(--text-primary))" }}>
              Active Today
            </h2>
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
                      const isRight = ["volume", "price", "changePercent", "marketCap"].includes(header.id);
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
                      const isRight = ["volume", "price", "changePercent", "marketCap", "rank"].includes(cell.column.id);
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
      </div>

      
    </div>
  );
}
