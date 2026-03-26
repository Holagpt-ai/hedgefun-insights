import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { Search, MoreVertical, Download, RefreshCw } from "lucide-react";
import { MarketMoversTabBar } from "@/components/markets/MarketMoversTabBar";
import { IndexSparklines } from "@/components/markets/IndexSparklines";

import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";
import { AdBanner } from "@/components/layout/AdBanner";

const EDGE = `https://zcjptaolpumhtlwhlemq.supabase.co/functions/v1/market-data`;

interface PremarketRow {
  rank: number;
  symbol: string;
  name: string;
  changePercent: number;
  price: number;
  volume: number;
  marketCap: number;
}

function mapApiToRows(tickers: any[]): PremarketRow[] {
  return tickers.map((t: any, i: number) => ({
    rank: i + 1,
    symbol: t.ticker || t.symbol || "",
    name: t.name || t.ticker || "",
    changePercent: t.todaysChangePerc ?? 0,
    price: t?.lastTrade?.p || t?.lastQuote?.P || t?.day?.c || t?.prevDay?.c || 0,
    volume: t.day?.v ?? 0,
    marketCap: 0,
  }));
}

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
const SUB_TABS = ["Movers", "Gainers", "Losers"];

function PremarketTable({
  title,
  data,
  type,
  isLoading,
  refetch,
}: {
  title: string;
  data: PremarketRow[];
  type: "gainers" | "losers";
  isLoading: boolean;
  refetch?: () => void;
}) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "changePercent", desc: type === "gainers" },
  ]);

  const filtered = useMemo(() => {
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter((r) => r.symbol.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
  }, [data, search]);

  const columns = useMemo<ColumnDef<PremarketRow>[]>(
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
              onClick={() => { trackEvent("stock_search", { ticker: s }); navigate(`/stocks/${s.toLowerCase()}`); }}
              className="ticker-symbol text-[0.875rem] hover:underline"
              style={{ color: "hsl(var(--accent-blue))" }}
            >{s}</button>
          );
        },
      },
      {
        accessorKey: "name",
        header: "Company Name",
        cell: ({ getValue }) => (
          <span className="text-[0.875rem]" style={{ color: "hsl(var(--text-primary))" }}>{getValue<string>()}</span>
        ),
      },
      {
        accessorKey: "changePercent",
        header: "% Change",
        size: 100,
        cell: ({ getValue }) => {
          const v = getValue<number>();
          const positive = v >= 0;
          return (
            <span className="text-[0.875rem] font-medium tabular-nums text-right block" style={{ color: positive ? "hsl(var(--green))" : "hsl(var(--red))" }}>
              {v.toFixed(2)}%
            </span>
          );
        },
      },
      {
        accessorKey: "price",
        header: "Premkt. Price",
        size: 100,
        cell: ({ getValue }) => (
          <span className="text-[0.875rem] tabular-nums text-right block" style={{ color: "hsl(var(--text-primary))" }}>
            {getValue<number>().toFixed(2)}
          </span>
        ),
      },
      {
        accessorKey: "volume",
        header: "Pre. Volume",
        size: 120,
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
        cell: ({ getValue }) => {
          const v = getValue<number>();
          return (
            <span className="text-[0.875rem] tabular-nums text-right block" style={{ color: "hsl(var(--text-primary))" }}>
              {v ? abbr(v) : "—"}
            </span>
          );
        },
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
  });

  const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[1.125rem] font-bold" style={{ color: "hsl(var(--text-primary))" }}>{title}</h2>
          <span className="text-[0.8125rem]" style={{ color: "hsl(var(--text-muted))" }}>Updated {today}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "hsl(var(--text-muted))" }} />
            <input type="text" placeholder="Find..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 w-[120px] pl-8 pr-2 text-[0.8125rem] rounded border border-border bg-background" />
          </div>
          <Button variant="outline" size="sm" className="text-[0.8125rem] h-8 gap-1">Indicators</Button>
          <Button variant="outline" size="sm" className="text-[0.8125rem] h-8" style={{ color: "hsl(var(--accent-blue))", borderColor: "hsl(var(--accent-blue))" }}>Screener →</Button>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0"><Download className="h-3.5 w-3.5" /></Button>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0"><MoreVertical className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      <div className="flex items-center gap-0 border-b border-border mb-0">
        {VIEW_TABS.map((t, i) => (
          <button key={t} className="px-3 py-2 text-[0.875rem] transition-colors relative" style={{ fontWeight: i === 0 ? 600 : 400, color: i === 0 ? "hsl(var(--accent-blue))" : "hsl(var(--text-secondary))" }}>
            {t}
            {i === 0 && <span className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: "hsl(var(--accent-blue))" }} />}
          </button>
        ))}
        <button className="px-3 py-2 text-[0.8125rem] border border-border rounded ml-2" style={{ color: "hsl(var(--text-secondary))" }}>+ Add View</button>
        <button className="px-3 py-2 text-[0.8125rem]" style={{ color: "hsl(var(--text-secondary))" }}>Edit View</button>
      </div>

      {isLoading ? (
        <div className="space-y-2 py-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-[0.9375rem] mb-3" style={{ color: "hsl(var(--text-muted))" }}>
            Market data is refreshing...
          </p>
          {refetch && (
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Try again
            </Button>
          )}
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
                      <th key={header.id} className="table-header px-3 py-2.5 cursor-pointer select-none" style={{ textAlign: isRight || isRank ? "right" : "left", width: header.getSize() !== 150 ? header.getSize() : undefined }} onClick={header.column.getToggleSortingHandler()}>
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
                <tr key={row.id} className="transition-colors" style={{ borderBottom: "1px solid hsl(var(--border-subtle))" }} onMouseEnter={(e) => (e.currentTarget.style.background = "hsl(var(--surface))")} onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                  {row.getVisibleCells().map((cell) => {
                    const isRight = ["changePercent", "price", "volume", "marketCap", "rank"].includes(cell.column.id);
                    return (
                      <td key={cell.id} className="px-3 py-2.5" style={{ textAlign: isRight ? "right" : "left" }}>
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
    </div>
  );
}

export default function PremarketPage() {
  const { data: gainersData, isLoading: gainersLoading, refetch: refetchGainers } = useQuery({
    queryKey: ["premarket-gainers"],
    queryFn: async () => {
      const res = await fetch(`${EDGE}?type=gainers`);
      const json = await res.json();
      const tickers = Array.isArray(json) ? json : (json.tickers ?? []);
      return mapApiToRows(tickers);
    },
    staleTime: 60_000,
    retry: 3,
    retryDelay: 2000,
  });

  const { data: losersData, isLoading: losersLoading, refetch: refetchLosers } = useQuery({
    queryKey: ["premarket-losers"],
    queryFn: async () => {
      const res = await fetch(`${EDGE}?type=losers`);
      const json = await res.json();
      const tickers = Array.isArray(json) ? json : (json.tickers ?? []);
      return mapApiToRows(tickers);
    },
    staleTime: 60_000,
    retry: 3,
    retryDelay: 2000,
  });

  return (
    <div className="w-full">
      <MarketMoversTabBar />

      <div className="max-w-7xl mx-auto px-4 py-6">
        <h1 className="text-[1.75rem] font-bold mb-4" style={{ color: "hsl(var(--text-primary))" }}>
          Market Movers
        </h1>

        <div className="flex items-center gap-0 mb-6">
          {SUB_TABS.map((t, i) => (
            <button
              key={t}
              className="px-3 py-2 text-[0.875rem] transition-colors relative"
              style={{
                fontWeight: i === 0 ? 700 : 400,
                color: i === 0 ? "hsl(var(--text-primary))" : "hsl(var(--accent-blue))",
              }}
            >
              {t}
              {i === 0 && <span className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: "hsl(var(--text-primary))" }} />}
            </button>
          ))}
        </div>

        <IndexSparklines />
        <div className="w-full flex flex-col items-center border-b border-border bg-surface py-1">
          <AdBanner slot="top" />
        </div>

        <PremarketTable title="Premarket Gainers" data={gainersData ?? []} type="gainers" isLoading={gainersLoading} refetch={refetchGainers} />

        <div className="my-6 border-t border-border" />

        <PremarketTable title="Premarket Losers" data={losersData ?? []} type="losers" isLoading={losersLoading} refetch={refetchLosers} />

        <p className="text-[0.75rem] mt-4" style={{ color: "hsl(var(--text-muted))" }}>
          Data reflects latest available market activity. Dedicated premarket data requires an upgraded data plan.
        </p>
      </div>
        <div className="w-full flex flex-col items-center border-t border-border bg-surface py-1 mt-8">
          <AdBanner slot="bottom" />
        </div>
    </div>
  );
}
