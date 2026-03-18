import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Lock, ArrowUpRight, ChevronUp, MoreHorizontal, Download } from "lucide-react";
import {
  useReactTable, getCoreRowModel, getSortedRowModel, type SortingState, type ColumnDef, flexRender,
} from "@tanstack/react-table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AdBanner } from "@/components/layout/AdBanner";

import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

interface NewEtf {
  inception: string;
  symbol: string;
  name: string;
  price: number;
  change: number;
}

const SEED: NewEtf[] = [
  { inception: "2026-03-09", symbol: "CRTS", name: "Cornerstone Total Return Strategy ETF", price: 25.38, change: 0.12 },
  { inception: "2026-03-08", symbol: "NFIN", name: "Innovator US Equity 10 Buffer ETF", price: 30.15, change: -0.55 },
  { inception: "2026-03-06", symbol: "TOOV", name: "T. Rowe Price Balanced Multi-Cap ETF", price: 50.94, change: 0.25 },
  { inception: "2026-03-06", symbol: "XTCV", name: "Xtrackers Unlocked ETF", price: 18.04, change: -1.35 },
  { inception: "2026-03-05", symbol: "AIQB", name: "AI Powered Equity Build ETF", price: 23.50, change: 2.15 },
  { inception: "2026-03-05", symbol: "AGSS", name: "Blackrock Nexus US Emerging Markets ETF", price: 25.62, change: 0.54 },
  { inception: "2026-03-04", symbol: "MRCL", name: "Monarch Defensive and Growth Intl ETF", price: 47.42, change: -2.25 },
  { inception: "2026-03-03", symbol: "XFRA", name: "Defiance Actively Long Pure Diversified ETF", price: 30.44, change: 0.68 },
  { inception: "2026-03-03", symbol: "DEPH", name: "Innovator Equity Profit Protection 15 Buff ETF", price: 58.08, change: 1.05 },
  { inception: "2026-03-01", symbol: "DCRN", name: "Innovator Equity Build Distribution 5 Year ETF", price: 56.98, change: -0.33 },
  { inception: "2026-02-28", symbol: "GSIF", name: "GS Dynamic Annuity Income Adviser 770 ETF", price: 24.67, change: 0.90 },
  { inception: "2026-02-25", symbol: "NKBS", name: "NuShares Unique Market and Mega Cap ETF", price: 48.12, change: -1.10 },
  { inception: "2026-02-25", symbol: "TPVY", name: "YieldMax Janus TO 18 Allocation Core ETF", price: 96.98, change: 0.45 },
  { inception: "2026-02-24", symbol: "BCRT", name: "Bessemer Actively Build Value Trust 200 ETF", price: 21.86, change: -0.78 },
  { inception: "2026-02-24", symbol: "MYLS", name: "State Street MyCG Major Market Growth ETF", price: 35.87, change: 1.20 },
  { inception: "2026-02-23", symbol: "MYSN", name: "State Street MyCG Higher Yield Global Growth ETF", price: 24.95, change: -0.55 },
  { inception: "2026-02-23", symbol: "MYTR", name: "State Street MyCG 7-10 Year Municipal Trust ETF", price: 25.05, change: 0.30 },
  { inception: "2026-02-23", symbol: "MYVR", name: "State Street MyCG Inflation Protected ETF", price: 24.30, change: 0.24 },
  { inception: "2026-02-22", symbol: "ROLS", name: "Tortoise NxtGen Infrastructure ETF", price: 25.07, change: -0.88 },
  { inception: "2026-02-21", symbol: "ALGY", name: "FT Advisable 4d Affordable Balanced Fund B ETF", price: 20.24, change: 3.22 },
  { inception: "2026-02-20", symbol: "TSLI", name: "YCShares Tail II ETF", price: 10.75, change: -0.50 },
  { inception: "2026-02-20", symbol: "INEW", name: "Innovator International Developing Markets ETF", price: 49.82, change: -1.06 },
  { inception: "2026-02-19", symbol: "MVRS", name: "Innovator US Equity 5 Cap Leveraged Mod ETF", price: 44.90, change: 0.77 },
  { inception: "2026-02-19", symbol: "MSCI", name: "MS Cloud ETF", price: 24.00, change: 1.45 },
  { inception: "2026-02-18", symbol: "MFPS", name: "Innovator Meeting 100 Managed 1.5x Bull ETF", price: 48.98, change: -2.05 },
  { inception: "2026-02-18", symbol: "EMRC", name: "ABRDN Core Sector Balanced ETF", price: 24.98, change: 0.75 },
  { inception: "2026-02-17", symbol: "FTFG", name: "Grayscale Federal Pullback Other Flow Plus ETF", price: 19.78, change: -0.62 },
  { inception: "2026-02-17", symbol: "AIFB", name: "Innovator Equity Managed S6 Partner ETF", price: 24.96, change: 0.45 },
  { inception: "2026-02-16", symbol: "DFIL", name: "FT Auto US Equity Dual Dividend Bull 80 ETF", price: 30.00, change: -0.22 },
  { inception: "2026-02-15", symbol: "GPLE", name: "Leverage Power 2x Long PCG Dully ETF", price: 14.68, change: -6.45 },
  { inception: "2026-02-14", symbol: "APLX", name: "Applied Financials International SMAU ETF", price: 24.17, change: -0.85 },
  { inception: "2026-02-14", symbol: "GRPN", name: "Monroe Group Diversity Value Allocation ETF", price: 25.87, change: 0.30 },
];

function fmtDate(d: string) {
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function EtfNewLaunchesPage() {
  const navigate = useNavigate();
  const [sorting, setSorting] = useState<SortingState>([{ id: "inception", desc: false }]);
  const [findSearch, setFindSearch] = useState("");
  const [activeTab, setActiveTab] = useState("Overview");

  const filtered = useMemo(() => {
    if (!findSearch) return SEED;
    const q = findSearch.toLowerCase();
    return SEED.filter((e) => e.symbol.toLowerCase().includes(q) || e.name.toLowerCase().includes(q));
  }, [findSearch]);

  const columns = useMemo<ColumnDef<NewEtf>[]>(() => [
    {
      accessorKey: "inception",
      header: "Inception ↑",
      size: 100,
      cell: ({ getValue }) => <span className="text-[0.875rem]">{fmtDate(getValue() as string)}</span>,
    },
    {
      accessorKey: "symbol",
      header: "Symbol",
      size: 70,
      cell: ({ getValue }) => {
        const sym = getValue() as string;
        return (
          <button onClick={() => navigate(`/etf/${sym.toLowerCase()}`)} className="text-primary font-bold text-[0.875rem] hover:underline">
            {sym}
          </button>
        );
      },
    },
    {
      accessorKey: "name",
      header: "Fund Name",
      cell: ({ getValue }) => <span className="text-[0.875rem] truncate block max-w-[300px]">{getValue() as string}</span>,
    },
    {
      accessorKey: "price",
      header: "Stock Price",
      size: 90,
      meta: { align: "right" },
      cell: ({ getValue }) => <span className="text-[0.875rem]">${(getValue() as number).toFixed(2)}</span>,
    },
    {
      accessorKey: "change",
      header: "% Change",
      size: 90,
      meta: { align: "right" },
      cell: ({ getValue }) => {
        const v = getValue() as number;
        return <span className={`text-[0.875rem] font-medium ${v >= 0 ? "text-green" : "text-red"}`}>{v >= 0 ? "+" : ""}{v.toFixed(2)}%</span>;
      },
    },
  ], [navigate]);

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const tabs = ["Overview", "Price", "Profile"];

  return (
    <div className="min-w-0">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-[1.375rem] font-bold text-foreground">New ETFs</h1>
          <Button variant="outline" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => navigate("/pro")}>
            Full Width <Lock className="h-3.5 w-3.5" />
          </Button>
        </div>
        <p className="text-[0.875rem] text-muted-foreground mb-5">100 Newest ETFs</p>

        <div className="flex gap-6">
          {/* Main */}
          <div className="flex-1 min-w-0">
            {/* Controls */}
            <div className="flex items-center justify-end gap-2 mb-3">
              <div className="relative w-[120px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Find..." value={findSearch} onChange={(e) => setFindSearch(e.target.value)} className="pl-8 h-8 text-sm" />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="outline" size="sm">Indicators</Button></DropdownMenuTrigger>
                <DropdownMenuContent><DropdownMenuItem>Market Cap</DropdownMenuItem><DropdownMenuItem>Volume</DropdownMenuItem></DropdownMenuContent>
              </DropdownMenu>
              <Button variant="outline" size="sm" className="text-primary border-primary" onClick={() => navigate("/etf/screener")}>Screener →</Button>
              <Button variant="outline" size="icon" className="h-8 w-8"><Download className="h-3.5 w-3.5" /></Button>
              <Button variant="outline" size="icon" className="h-8 w-8"><MoreHorizontal className="h-3.5 w-3.5" /></Button>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 border-b border-border mb-0">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-2 text-[0.8125rem] font-medium border-b-2 transition-colors ${activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                  {tab}
                </button>
              ))}
              <button className="px-3 py-2 text-[0.8125rem] text-muted-foreground border border-border rounded-md ml-2 hover:bg-muted">+ Add View</button>
              <button className="px-3 py-2 text-[0.8125rem] text-muted-foreground hover:text-foreground">Edit View</button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  {table.getHeaderGroups().map((hg) => (
                    <tr key={hg.id} className="border-b-2 border-border bg-muted/30">
                      {hg.headers.map((h) => (
                        <th
                          key={h.id}
                          className={`py-2 px-2.5 text-[0.8125rem] font-semibold text-muted-foreground cursor-pointer select-none ${(h.column.columnDef.meta as any)?.align === "right" ? "text-right" : "text-left"}`}
                          style={{ width: h.column.getSize() !== 150 ? h.column.getSize() : undefined }}
                          onClick={h.column.getToggleSortingHandler()}
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => (
                    <tr key={row.id} className="border-b border-border hover:bg-muted/50">
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          className={`py-[7px] px-2.5 ${(cell.column.columnDef.meta as any)?.align === "right" ? "text-right" : "text-left"}`}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="flex items-center justify-center gap-1 w-full py-3 text-[0.875rem] text-primary hover:underline mt-2">
              <ChevronUp className="h-4 w-4" /> Back to Top
            </button>
          </div>

          {/* Sidebar */}
          <aside className="hidden lg:flex flex-col gap-4 w-[300px] shrink-0">
            {/* Pro */}
            <div className="border border-border rounded-[var(--radius)] p-4">
              <h3 className="text-[1rem] font-bold text-foreground mb-2">Stock Analysis Pro</h3>
              <p className="text-[0.8125rem] text-muted-foreground mb-3">Upgrade now for unlimited access to all data and tools.</p>
              <Button size="sm" className="w-full">Sign Up Today</Button>
            </div>

            {/* Newsletter */}
            <div className="border border-border rounded-[var(--radius)] p-4">
              <h3 className="text-[1rem] font-bold text-foreground mb-2">Market Newsletter</h3>
              <p className="text-[0.8125rem] text-muted-foreground mb-3">Get a daily email with the top market news in bullet point format.</p>
              <div className="flex gap-2">
                <Input placeholder="Enter your email" className="h-8 text-sm flex-1" />
                <Button size="sm">Subscribe</Button>
              </div>
            </div>

            {/* ETF Screener */}
            <button onClick={() => navigate("/etf/screener")} className="border border-border rounded-[var(--radius)] p-4 text-left hover:border-accent-blue transition-colors relative group">
              <ArrowUpRight className="absolute top-3 right-3 h-4 w-4 text-muted-foreground group-hover:text-primary" />
              <h3 className="text-[1rem] font-bold text-foreground mb-1">ETF Screener</h3>
              <p className="text-[0.8125rem] text-muted-foreground">Filter, sort and analyze all ETFs to find your next investment.</p>
            </button>

            {/* ETF Comparison */}
            <button onClick={() => navigate("/etf/compare")} className="border border-border rounded-[var(--radius)] p-4 text-left hover:border-accent-blue transition-colors relative group">
              <ArrowUpRight className="absolute top-3 right-3 h-4 w-4 text-muted-foreground group-hover:text-primary" />
              <h3 className="text-[1rem] font-bold text-foreground mb-1">ETF Comparison Tool</h3>
              <p className="text-[0.8125rem] text-muted-foreground">Compare two or more ETFs side-by-side.</p>
            </button>

            {/* Ad */}
            <AdBanner />

            {/* Top Monthly Dividends */}
            <div className="border border-border rounded-[var(--radius)] p-4">
              <h3 className="text-[1rem] font-bold text-foreground mb-1">
                <span className="text-amber-500">Top Monthly Dividends</span>
              </h3>
              <p className="text-[0.8125rem] text-muted-foreground mb-3">Monthly Dividend ETF with enhanced dividends.</p>
              <button className="text-[0.8125rem] text-primary hover:underline font-medium">Learn More ›</button>
            </div>
          </aside>
        </div>
      </div>

      
    </div>
  );
}
