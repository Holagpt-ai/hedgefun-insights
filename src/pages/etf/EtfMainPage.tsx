import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowUpDown, ArrowUpRight, Lock, Search, Download, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdBanner } from "@/components/layout/AdBanner";

/* ── Types ──────────────────────────────────────── */
interface EtfRow {
  symbol: string;
  name: string;
  assetClass: string;
  totalAssets: number;
}

/* ── Seed Data ──────────────────────────────────── */
const SEED: EtfRow[] = [
  { symbol: "VOO", name: "Vanguard S&P 500 ETF", assetClass: "Equity", totalAssets: 856.11e9 },
  { symbol: "IVV", name: "iShares Core S&P 500 ETF", assetClass: "Equity", totalAssets: 730.39e9 },
  { symbol: "SPY", name: "SPDR S&P 500 ETF Trust", assetClass: "Equity", totalAssets: 670.58e9 },
  { symbol: "VTI", name: "Vanguard Total Stock Market ETF", assetClass: "Equity", totalAssets: 575.22e9 },
  { symbol: "QQQ", name: "Invesco QQQ Trust Series I", assetClass: "Equity", totalAssets: 386.79e9 },
  { symbol: "BND", name: "Vanguard Total Bond Market ETF", assetClass: "Fixed Income", totalAssets: 315.40e9 },
  { symbol: "VEA", name: "Vanguard FTSE Developed Markets ETF", assetClass: "Equity", totalAssets: 206.98e9 },
  { symbol: "VUG", name: "Vanguard Growth ETF", assetClass: "Equity", totalAssets: 194.80e9 },
  { symbol: "VTV", name: "Vanguard Value ETF", assetClass: "Equity", totalAssets: 130.50e9 },
  { symbol: "AGG", name: "iShares Core U.S. Aggregate Bond ETF", assetClass: "Fixed Income", totalAssets: 118.60e9 },
  { symbol: "IEMG", name: "iShares Core MSCI Emerging Markets ETF", assetClass: "Equity", totalAssets: 89.31e9 },
  { symbol: "VIG", name: "Vanguard Dividend Appreciation ETF", assetClass: "Equity", totalAssets: 88.90e9 },
  { symbol: "XLK", name: "Technology Select Sector SPDR Fund", assetClass: "Equity", totalAssets: 72.15e9 },
  { symbol: "VXUS", name: "Vanguard Total International Stock ETF", assetClass: "Equity", totalAssets: 72.40e9 },
  { symbol: "IWM", name: "iShares Russell 2000 ETF", assetClass: "Equity", totalAssets: 65.70e9 },
  { symbol: "GLD", name: "SPDR Gold Shares", assetClass: "Commodity", totalAssets: 63.20e9 },
  { symbol: "VNQ", name: "Vanguard Real Estate ETF", assetClass: "Equity", totalAssets: 62.40e9 },
  { symbol: "BNDX", name: "Vanguard Total International Bond ETF", assetClass: "Fixed Income", totalAssets: 62.30e9 },
  { symbol: "SCHD", name: "Schwab U.S. Dividend Equity ETF", assetClass: "Equity", totalAssets: 62.45e9 },
  { symbol: "EFA", name: "iShares MSCI EAFE ETF", assetClass: "Equity", totalAssets: 59.10e9 },
  { symbol: "RSP", name: "Invesco S&P 500 Equal Weight ETF", assetClass: "Equity", totalAssets: 54.30e9 },
  { symbol: "TLT", name: "iShares 20+ Year Treasury Bond ETF", assetClass: "Fixed Income", totalAssets: 52.80e9 },
  { symbol: "VCIT", name: "Vanguard Intermediate-Term Corporate Bond ETF", assetClass: "Fixed Income", totalAssets: 48.70e9 },
  { symbol: "XLF", name: "Financial Select Sector SPDR Fund", assetClass: "Equity", totalAssets: 46.88e9 },
  { symbol: "QUAL", name: "iShares MSCI USA Quality Factor ETF", assetClass: "Equity", totalAssets: 42.80e9 },
  { symbol: "XLV", name: "Health Care Select Sector SPDR Fund", assetClass: "Equity", totalAssets: 40.33e9 },
  { symbol: "XLE", name: "Energy Select Sector SPDR Fund", assetClass: "Equity", totalAssets: 38.22e9 },
  { symbol: "JEPI", name: "JPMorgan Equity Premium Income ETF", assetClass: "Equity", totalAssets: 36.20e9 },
  { symbol: "LQD", name: "iShares iBoxx $ Investment Grade Corporate Bond ETF", assetClass: "Fixed Income", totalAssets: 35.90e9 },
  { symbol: "DIA", name: "SPDR Dow Jones Industrial Average ETF", assetClass: "Equity", totalAssets: 35.14e9 },
  { symbol: "IAU", name: "iShares Gold Trust", assetClass: "Commodity", totalAssets: 30.10e9 },
  { symbol: "SHY", name: "iShares 1-3 Year Treasury Bond ETF", assetClass: "Fixed Income", totalAssets: 28.10e9 },
  { symbol: "IBIT", name: "iShares Bitcoin Trust ETF", assetClass: "Alternatives", totalAssets: 22.40e9 },
  { symbol: "XLI", name: "Industrial Select Sector SPDR Fund", assetClass: "Equity", totalAssets: 20.56e9 },
  { symbol: "GBTC", name: "Grayscale Bitcoin Trust", assetClass: "Alternatives", totalAssets: 17.80e9 },
  { symbol: "HYG", name: "iShares iBoxx $ High Yield Corporate Bond ETF", assetClass: "Fixed Income", totalAssets: 17.45e9 },
  { symbol: "SOXX", name: "iShares Semiconductor ETF", assetClass: "Equity", totalAssets: 14.22e9 },
  { symbol: "SLV", name: "iShares Silver Trust", assetClass: "Commodity", totalAssets: 12.80e9 },
  { symbol: "FBTC", name: "Fidelity Wise Origin Bitcoin Fund", assetClass: "Alternatives", totalAssets: 11.60e9 },
  { symbol: "SCHH", name: "Schwab U.S. REIT ETF", assetClass: "Equity", totalAssets: 7.80e9 },
  { symbol: "ARKK", name: "ARK Innovation ETF", assetClass: "Equity", totalAssets: 6.84e9 },
  { symbol: "XLRE", name: "Real Estate Select Sector SPDR Fund", assetClass: "Equity", totalAssets: 6.22e9 },
  { symbol: "ETHE", name: "Grayscale Ethereum Trust", assetClass: "Alternatives", totalAssets: 5.30e9 },
  { symbol: "PDBC", name: "Invesco Optimum Yield Diversified Commodity Strategy", assetClass: "Commodity", totalAssets: 4.55e9 },
  { symbol: "IYR", name: "iShares U.S. Real Estate ETF", assetClass: "Equity", totalAssets: 4.35e9 },
  { symbol: "USO", name: "United States Oil Fund", assetClass: "Commodity", totalAssets: 2.40e9 },
  { symbol: "BITO", name: "ProShares Bitcoin Strategy ETF", assetClass: "Alternatives", totalAssets: 2.10e9 },
  { symbol: "DBA", name: "Invesco DB Agriculture Fund", assetClass: "Commodity", totalAssets: 0.95e9 },
];

const VIEW_TABS = ["Overview", "Performance", "Price", "Profile", "Dividends", "Technicals"] as const;

const columnHelper = createColumnHelper<EtfRow>();

function abbreviateAssets(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  return n.toLocaleString();
}

export default function EtfMainPage() {
  const navigate = useNavigate();
  const [sorting, setSorting] = useState<SortingState>([{ id: "symbol", desc: false }]);
  const [viewTab, setViewTab] = useState<(typeof VIEW_TABS)[number]>("Overview");
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(25);

  const filteredData = useMemo(() => {
    if (!search.trim()) return SEED;
    const q = search.toLowerCase();
    return SEED.filter((e) => e.symbol.toLowerCase().includes(q) || e.name.toLowerCase().includes(q));
  }, [search]);

  const columns = useMemo(() => [
    columnHelper.accessor("symbol", {
      header: ({ column }) => (
        <button className="flex items-center gap-1" onClick={() => column.toggleSorting()}>
          Symbol <ArrowUpDown className="h-3 w-3" />
        </button>
      ),
      cell: (info) => (
        <button
          onClick={() => navigate(`/etf/${info.getValue().toLowerCase()}`)}
          className="font-semibold text-accent-blue hover:underline text-[0.875rem]"
        >
          {info.getValue()}
        </button>
      ),
    }),
    columnHelper.accessor("name", {
      header: "Fund Name",
      cell: (info) => (
        <span className="text-foreground text-[0.875rem] truncate max-w-[320px] block">
          {info.getValue()}
        </span>
      ),
    }),
    columnHelper.accessor("assetClass", {
      header: "Asset Class",
      cell: (info) => <span className="text-foreground text-[0.875rem]">{info.getValue()}</span>,
    }),
    columnHelper.accessor("totalAssets", {
      header: ({ column }) => (
        <button className="flex items-center gap-1 ml-auto" onClick={() => column.toggleSorting()}>
          Assets <ArrowUpDown className="h-3 w-3" />
        </button>
      ),
      cell: (info) => (
        <span className="text-foreground text-[0.875rem] tabular-nums text-right block">
          {abbreviateAssets(info.getValue())}
        </span>
      ),
    }),
  ], [navigate]);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });

  const handlePageSizeChange = (val: string) => {
    const size = parseInt(val, 10);
    setPageSize(size);
    table.setPageSize(size);
  };

  return (
    <div className="p-4">
      {/* Title row */}
      <div className="flex items-start justify-between mb-5">
        <h1 className="text-[1.75rem] font-bold text-foreground leading-tight">All ETF Symbols</h1>
        <button className="flex items-center gap-1.5 text-[0.875rem] text-muted-foreground mt-1">
          Full Width <Lock className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex gap-6">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Controls row */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <span className="text-[1rem] font-bold text-foreground whitespace-nowrap">
              {filteredData.length} ETFs
            </span>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Find..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 w-[140px] text-sm"
              />
            </div>
            <Button variant="outline" size="sm" className="text-xs">Indicators ▾</Button>
            <Button
              size="sm"
              className="text-xs bg-accent-blue hover:bg-accent-blue-hover text-primary-foreground"
              onClick={() => navigate("/etf/screener")}
            >
              Screener →
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8">
              <Download className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>

          {/* View tabs */}
          <div className="flex gap-0 border-b border-border mb-0">
            {VIEW_TABS.map((vt) => (
              <button
                key={vt}
                onClick={() => setViewTab(vt)}
                className={cn(
                  "px-4 py-2 text-sm font-medium transition-colors relative",
                  viewTab === vt ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {vt}
                {viewTab === vt && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />}
              </button>
            ))}
            <button className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">+ Add View</button>
            <button className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">✎ Edit View</button>
          </div>

          {/* Table */}
          <div className="border border-t-0 border-border rounded-b-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  {table.getHeaderGroups().map((hg) => (
                    <tr key={hg.id} className="border-b border-border bg-surface">
                      {hg.headers.map((header) => (
                        <th key={header.id} className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => (
                    <tr key={row.id} className="border-b border-border-subtle hover:bg-surface transition-colors">
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-3 py-[7px]">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-3 mb-8">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Show</span>
              <select
                value={pageSize}
                onChange={(e) => handlePageSizeChange(e.target.value)}
                className="border border-border rounded px-2 py-1 text-sm bg-background text-foreground"
              >
                {[25, 50, 100].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <span>per page</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
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
                className="text-xs"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                Next →
              </Button>
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <aside className="hidden lg:block w-[280px] shrink-0 space-y-4">
          {/* Pro promo card */}
          <button
            onClick={() => navigate("/pro")}
            className="w-full border border-border rounded-md p-4 text-left hover:border-accent-blue transition-colors group relative"
          >
            <ArrowUpRight className="absolute top-3 right-3 h-4 w-4 text-muted-foreground group-hover:text-accent-blue transition-colors" />
            <h3 className="text-[0.9375rem] font-bold text-foreground mb-1">HedgeFun Pro</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Upgrade now for unlimited access to all data and tools.
            </p>
          </button>

          {/* Newsletter card */}
          <button
            onClick={() => navigate("/newsletter")}
            className="w-full border border-border rounded-md p-4 text-left hover:border-accent-blue transition-colors group relative"
          >
            <ArrowUpRight className="absolute top-3 right-3 h-4 w-4 text-muted-foreground group-hover:text-accent-blue transition-colors" />
            <h3 className="text-[0.9375rem] font-bold text-foreground mb-1">Market Newsletter</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Get a daily email with the top market news in bullet point format.
            </p>
          </button>

          {/* ETF Screener card */}
          <button
            onClick={() => navigate("/etf/screener")}
            className="w-full border border-border rounded-md p-4 text-left hover:border-accent-blue transition-colors group relative"
          >
            <ArrowUpRight className="absolute top-3 right-3 h-4 w-4 text-muted-foreground group-hover:text-accent-blue transition-colors" />
            <h3 className="text-[0.9375rem] font-bold text-foreground mb-1">ETF Screener</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Filter, sort and analyze all ETFs to find your next investment.
            </p>
          </button>

          {/* ETF Comparison card */}
          <button
            onClick={() => navigate("/etf/compare")}
            className="w-full border border-border rounded-md p-4 text-left hover:border-accent-blue transition-colors group relative"
          >
            <ArrowUpRight className="absolute top-3 right-3 h-4 w-4 text-muted-foreground group-hover:text-accent-blue transition-colors" />
            <h3 className="text-[0.9375rem] font-bold text-foreground mb-1">ETF Comparison Tool</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Compare two or more ETFs side-by-side.
            </p>
          </button>

          <AdBanner />
        </aside>
      </div>
    </div>
  );
}
