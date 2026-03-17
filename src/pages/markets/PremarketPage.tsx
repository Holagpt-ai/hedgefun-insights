import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { Search, MoreVertical, Download } from "lucide-react";
import { MarketMoversTabBar } from "@/components/markets/MarketMoversTabBar";
import { IndexSparklines } from "@/components/markets/IndexSparklines";

import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";

interface PremarketRow {
  rank: number;
  symbol: string;
  name: string;
  changePercent: number;
  price: number;
  volume: number;
  marketCap: number;
}

const GAINERS_SEED: PremarketRow[] = [
  { rank: 1, symbol: "WLDS", name: "Wearable Devices Ltd.", changePercent: 179.41, price: 1.90, volume: 1414, marketCap: 5160000 },
  { rank: 2, symbol: "SCNX", name: "Scienture Holdings, Inc.", changePercent: 55.86, price: 0.61, volume: 56711913, marketCap: 18860000 },
  { rank: 3, symbol: "KALA", name: "KALA BIO, Inc.", changePercent: 53.45, price: 0.45, volume: 108747945, marketCap: 10310000 },
  { rank: 4, symbol: "DOMO", name: "Domo, Inc.", changePercent: 42.92, price: 6.26, volume: 8206987, marketCap: 207740000 },
  { rank: 5, symbol: "WORX", name: "SCWorx Corp.", changePercent: 33.25, price: 0.17, volume: 61188001, marketCap: 2310000 },
  { rank: 6, symbol: "DXST", name: "Decent Holding Inc.", changePercent: 25.41, price: 0.50, volume: 21410979, marketCap: 20060000 },
  { rank: 7, symbol: "CYN", name: "Cyngn Inc.", changePercent: 23.13, price: 1.97, volume: 26859775, marketCap: 15310000 },
  { rank: 8, symbol: "ASNS", name: "Actelis Networks, Inc.", changePercent: 22.79, price: 0.46, volume: 26554577, marketCap: 4860000 },
  { rank: 9, symbol: "SGN", name: "Signing Day Sports, Inc.", changePercent: 21.91, price: 0.78, volume: 46010838, marketCap: 9870000 },
  { rank: 10, symbol: "CVGI", name: "Commercial Vehicle Group, Inc.", changePercent: 21.61, price: 1.97, volume: 1120719, marketCap: 69860000 },
];

const LOSERS_SEED: PremarketRow[] = [
  { rank: 1, symbol: "KITT", name: "Nauticus Robotics, Inc.", changePercent: -26.58, price: 0.75, volume: 4470372, marketCap: 21970000 },
  { rank: 2, symbol: "KOS", name: "Kosmos Energy Ltd.", changePercent: -18.67, price: 1.96, volume: 18293351, marketCap: 966860000 },
  { rank: 3, symbol: "MI", name: "NFT Limited", changePercent: -17.85, price: 0.58, volume: 1347145, marketCap: 2840000 },
  { rank: 4, symbol: "SKYE", name: "Skye Bioscience, Inc.", changePercent: -15.62, price: 0.67, volume: 324189, marketCap: 23120000 },
  { rank: 5, symbol: "FCUV", name: "Focus Universal Inc.", changePercent: -14.79, price: 4.76, volume: 7067, marketCap: 4340000 },
  { rank: 6, symbol: "TBMC", name: "Trailblazer Holdings, Inc.", changePercent: -14.73, price: 10.07, volume: 3174, marketCap: 26360000 },
  { rank: 7, symbol: "EJH", name: "E-Home Household Service Holdings Limited", changePercent: -14.49, price: 0.13, volume: 2532669, marketCap: 9220000 },
  { rank: 8, symbol: "OIO", name: "ESGL Holdings Limited", changePercent: -14.29, price: 3.30, volume: 7240, marketCap: 158540000 },
  { rank: 9, symbol: "INKT", name: "MiNK Therapeutics, Inc.", changePercent: -14.14, price: 11.60, volume: 85634, marketCap: 52480000 },
  { rank: 10, symbol: "ELPW", name: "Elong Power Holding Limited", changePercent: -13.03, price: 0.06, volume: 34059836, marketCap: 5930000 },
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
const SUB_TABS = ["Movers", "Gainers", "Losers"];

function PremarketTable({
  title,
  data,
  type,
}: {
  title: string;
  data: PremarketRow[];
  type: "gainers" | "losers";
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
  });

  const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div>
      {/* Section Header */}
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

      {/* View Tab Bar */}
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

      {/* Table */}
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
    </div>
  );
}

export default function PremarketPage() {
  return (
    <div className="w-full">
      <MarketMoversTabBar />

      <div className="max-w-7xl mx-auto px-4 py-6">
        <h1 className="text-[1.75rem] font-bold mb-4" style={{ color: "hsl(var(--text-primary))" }}>
          Market Movers
        </h1>

        {/* Sub-Tab Bar */}
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

        <PremarketTable title="Premarket Gainers" data={GAINERS_SEED} type="gainers" />

        <div className="my-6 border-t border-border" />

        <PremarketTable title="Premarket Losers" data={LOSERS_SEED} type="losers" />
      </div>

      <Footer />
    </div>
  );
}
