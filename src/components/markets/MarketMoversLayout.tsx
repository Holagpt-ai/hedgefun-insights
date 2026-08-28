import { useState, useMemo } from "react";
import { resolveMarketSession } from "@/lib/price-utils";
import { currentMoversEmptyMessage } from "@/lib/markets/movers-integrity";
import { useNavigate } from "react-router-dom";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { Search, Info, MoreVertical, Download, RefreshCw } from "lucide-react";
import { MarketMoversTabBar } from "@/components/markets/MarketMoversTabBar";
import { IndexSparklines } from "@/components/markets/IndexSparklines";
import { AdBanner } from "@/components/layout/AdBanner";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  initialMoversSorting,
  compareMoverVolume,
  type MoversDefaultSort,
} from "@/components/markets/movers-table-sort";
import {
  MOVERS_OPTIONAL_COLUMN_CLASS,
  MOVERS_PAGE_INNER_CLASS,
  MOVERS_PAGE_SHELL_CLASS,
  MOVERS_PAGINATION_CLASS,
  MOVERS_TABLE_CLASS,
  MOVERS_TABLE_SCROLLER_CLASS,
  MOVERS_TOOLBAR_CLASS,
  MOVERS_NAME_TEXT_CLASS,
  isOptionalMoversColumn,
} from "@/components/markets/movers-responsive";

export interface MoverRow {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
}

const TIME_TABS = ["Today"];
const VIEW_TABS = ["Overview"];

interface TableProps {
  sectionTitle: string;
  rows: MoverRow[];
  isLoading: boolean;
  refetch?: () => void;
  defaultSortDesc?: boolean;
  defaultSort?: MoversDefaultSort;
  colorMode?: "green" | "red" | "mixed";
}

/** Reusable movers table (no page wrapper) */
export function MoversTable({
  sectionTitle,
  rows,
  isLoading,
  refetch,
  defaultSortDesc = true,
  defaultSort,
  colorMode = "mixed",
}: TableProps) {
  const navigate = useNavigate();
  const [sorting, setSorting] = useState<SortingState>(() =>
    initialMoversSorting(defaultSort, defaultSortDesc),
  );
  const [search, setSearch] = useState("");
  const [activeView, setActiveView] = useState("Overview");

  const filtered = useMemo(() => {
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) => r.symbol.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const columns = useMemo<ColumnDef<MoverRow>[]>(
    () => [
      {
        accessorKey: "symbol",
        header: "Symbol",
        size: 80,
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
          <span className={MOVERS_NAME_TEXT_CLASS} title={getValue<string>()}>
            {getValue<string>()}
          </span>
        ),
      },
      {
        accessorKey: "price",
        header: "Price",
        size: 90,
        cell: ({ getValue }) => (
          <span className="text-[0.875rem] tabular-nums text-right block text-foreground">
            ${getValue<number>().toFixed(2)}
          </span>
        ),
      },
      {
        accessorKey: "change",
        header: "Change",
        size: 90,
        cell: ({ getValue }) => {
          const v = getValue<number>();
          const pos = v >= 0;
          return (
            <span
              className="text-[0.875rem] font-medium tabular-nums text-right block"
              style={{ color: pos ? "hsl(var(--green))" : "hsl(var(--red))" }}
            >
              {pos ? "+" : ""}{v.toFixed(2)}
            </span>
          );
        },
      },
      {
        accessorKey: "changePercent",
        header: "% Change",
        size: 90,
        cell: ({ getValue }) => {
          const v = getValue<number>();
          const pos = v >= 0;
          const color =
            colorMode === "green"
              ? "hsl(var(--green))"
              : colorMode === "red"
              ? "hsl(var(--red))"
              : pos
              ? "hsl(var(--green))"
              : "hsl(var(--red))";
          return (
            <span className="text-[0.875rem] font-medium tabular-nums text-right block" style={{ color }}>
              {pos ? "+" : ""}{v.toFixed(2)}%
            </span>
          );
        },
      },
      {
        accessorKey: "volume",
        header: "Volume",
        size: 110,
        sortingFn: (rowA, rowB, columnId) =>
          compareMoverVolume(rowA.getValue(columnId), rowB.getValue(columnId)),
        cell: ({ getValue }) => {
          const v = getValue<number>();
          return (
            <span className="text-[0.875rem] tabular-nums text-right block text-foreground">
              {Number.isFinite(v) && v >= 0 ? v.toLocaleString() : "—"}
            </span>
          );
        },
      },
    ],
    [navigate, colorMode]
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getRowId: (row) => row.symbol,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  });

  const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const handleViewTab = (t: string) => {
    if (t !== "Overview") {
      toast({ title: "Coming Soon", description: `${t} view will be available in a future update.` });
      return;
    }
    setActiveView(t);
  };

  return (
    <div>
      {/* Section Header */}
      <div className="mb-3 flex min-w-0 flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <h2 className="text-[1.125rem] font-bold text-foreground">{sectionTitle}</h2>
          <Info className="h-4 w-4 text-muted-foreground" />
          <span className="text-[0.8125rem] text-muted-foreground">Updated {today}</span>
        </div>
        <div className={MOVERS_TOOLBAR_CLASS}>
          <div className="relative min-w-0 flex-1 sm:flex-none">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Find..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-full max-w-full pl-8 pr-2 text-[0.8125rem] rounded border border-border bg-background sm:w-[120px]"
            />
          </div>
          <Button variant="outline" size="sm" className="text-[0.8125rem] h-8 gap-1">Indicators</Button>
          <Button
            variant="outline"
            size="sm"
            className="text-[0.8125rem] h-8"
            onClick={() => navigate("/screener")}
            style={{ color: "hsl(var(--accent-blue))", borderColor: "hsl(var(--accent-blue))" }}
          >
            Screener →
          </Button>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0"><Download className="h-3.5 w-3.5" /></Button>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0"><MoreVertical className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      {/* View Tab Bar */}
      <div className="flex items-center gap-0 border-b border-border mb-0">
        {VIEW_TABS.map((t) => (
          <button
            key={t}
            onClick={() => handleViewTab(t)}
            className="px-3 py-2 text-[0.875rem] transition-colors relative"
            style={{
              fontWeight: activeView === t ? 600 : 400,
              color: activeView === t ? "hsl(var(--accent-blue))" : "hsl(var(--muted-foreground))",
            }}
          >
            {t}
            {activeView === t && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: "hsl(var(--accent-blue))" }} />
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2 py-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded" />
          ))}
        </div>
      ) : filtered.length === 0 ? (() => {
        const s = resolveMarketSession();
        const showEmpty = s === "closed";
        return (
          <div className="py-12 text-center">
            <p className="text-muted-foreground mb-3">
              {currentMoversEmptyMessage({ hasSearchQuery: Boolean(search), marketClosed: showEmpty })}
            </p>
            {refetch && (
              <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
                <RefreshCw className="h-3.5 w-3.5" /> Try again
              </Button>
            )}
          </div>
        );
      })() : (
        <div
          className={MOVERS_TABLE_SCROLLER_CLASS}
          role="region"
          aria-label={`${sectionTitle} table`}
        >
          <table className={MOVERS_TABLE_CLASS}>
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="bg-muted/30" style={{ borderBottom: "2px solid hsl(var(--border))" }}>
                  {hg.headers.map((header) => {
                    const isRight = ["price", "change", "changePercent", "volume"].includes(header.id);
                    return (
                      <th
                        key={header.id}
                        className={cn(
                          "table-header cursor-pointer select-none px-2 py-2.5 text-muted-foreground md:px-3",
                          header.id === "symbol" && "whitespace-nowrap",
                          isOptionalMoversColumn(header.id) && MOVERS_OPTIONAL_COLUMN_CLASS,
                        )}
                        style={{
                          textAlign: isRight ? "right" : "left",
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
                  className="transition-colors hover:bg-muted/20"
                  style={{ borderBottom: "1px solid hsl(var(--border-subtle))" }}
                >
                  {row.getVisibleCells().map((cell) => {
                    const isRight = ["price", "change", "changePercent", "volume"].includes(cell.column.id);
                    return (
                      <td
                        key={cell.id}
                        className={cn(
                          "px-2 py-2.5 md:px-3",
                          cell.column.id === "symbol" && "whitespace-nowrap",
                          cell.column.id === "name" && "min-w-0",
                          isOptionalMoversColumn(cell.column.id) && MOVERS_OPTIONAL_COLUMN_CLASS,
                        )}
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
      <div className={MOVERS_PAGINATION_CLASS}>
        <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} className="text-[0.8125rem] h-8">← Previous</Button>
        <div className="flex items-center gap-3 text-[0.8125rem] text-muted-foreground">
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
        <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} className="text-[0.8125rem] h-8">Next →</Button>
      </div>
    </div>
  );
}

/** Full page wrapper with tab bar, time tabs, sparklines, ad banner */
export function MarketMoversPage({
  pageTitle,
  sectionTitle,
  rows,
  isLoading,
  refetch,
  defaultSortDesc,
  defaultSort,
  colorMode,
}: TableProps & { pageTitle: string }) {
  const [activeTime, setActiveTime] = useState("Today");

  const handleTimeTab = (t: string) => {
    if (t !== "Today") {
      toast({ title: "Coming Soon", description: `${t} data will be available in a future update.` });
      return;
    }
    setActiveTime(t);
  };

  return (
    <div className={MOVERS_PAGE_SHELL_CLASS}>
      <MarketMoversTabBar />
      <div className={MOVERS_PAGE_INNER_CLASS}>
        <h1 className="text-[1.75rem] font-bold mb-4 text-foreground">{pageTitle}</h1>

        {/* Time Tab Bar */}
        <div className="flex items-center gap-1 mb-6 overflow-x-auto">
          {TIME_TABS.map((t) => (
            <button
              key={t}
              onClick={() => handleTimeTab(t)}
              className="text-[0.875rem] px-3.5 py-1.5 rounded transition-colors whitespace-nowrap"
              style={
                activeTime === t
                  ? { background: "hsl(var(--foreground))", color: "hsl(var(--background))", fontWeight: 600 }
                  : { color: "hsl(var(--muted-foreground))" }
              }
            >
              {t}
            </button>
          ))}
        </div>

        <IndexSparklines />

        {/* Ad Banner below title/tabs */}
        <div className="w-full flex flex-col items-center border-b border-border bg-surface py-1 mb-4">
          <AdBanner slot="top" />
        </div>

        <MoversTable
          sectionTitle={sectionTitle}
          rows={rows}
          isLoading={isLoading}
          refetch={refetch}
          defaultSortDesc={defaultSortDesc}
          defaultSort={defaultSort}
          colorMode={colorMode}
        />

        <div className="w-full flex flex-col items-center border-t border-border bg-surface py-1 mt-8">
          <AdBanner slot="bottom" />
        </div>
      </div>
    </div>
  );
}
