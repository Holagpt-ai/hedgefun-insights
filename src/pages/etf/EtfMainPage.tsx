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
import { ArrowUpDown, Lock, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdBanner } from "@/components/layout/AdBanner";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";

/* ── Types ──────────────────────────────────────── */
interface EtfRow {
  symbol: string;
  name: string;
  assetClass: string;
  totalAssets: number;
  ytdReturn: number;
  expenseRatio: number;
  peRatio: number | null;
}

/* ── Seed Data ──────────────────────────────────── */
const SEED: EtfRow[] = [
  { symbol: "VOO", name: "Vanguard S&P 500 ETF", assetClass: "Stocks", totalAssets: 856.11e9, ytdReturn: 12.4, expenseRatio: 0.03, peRatio: 23.1 },
  { symbol: "VTI", name: "Vanguard Total Stock Market ETF", assetClass: "Stocks", totalAssets: 575.22e9, ytdReturn: 11.8, expenseRatio: 0.03, peRatio: 22.5 },
  { symbol: "SPY", name: "SPDR S&P 500 ETF Trust", assetClass: "Stocks", totalAssets: 670.58e9, ytdReturn: 12.3, expenseRatio: 0.09, peRatio: 23.0 },
  { symbol: "IVV", name: "iShares Core S&P 500 ETF", assetClass: "Stocks", totalAssets: 730.39e9, ytdReturn: 12.4, expenseRatio: 0.03, peRatio: 23.1 },
  { symbol: "QQQ", name: "Invesco QQQ Trust Series I", assetClass: "Stocks", totalAssets: 386.79e9, ytdReturn: 15.2, expenseRatio: 0.20, peRatio: 30.8 },
  { symbol: "SCHD", name: "Schwab U.S. Dividend Equity ETF", assetClass: "Stocks", totalAssets: 62.45e9, ytdReturn: 4.1, expenseRatio: 0.06, peRatio: 15.3 },
  { symbol: "JEPI", name: "JPMorgan Equity Premium Income ETF", assetClass: "Stocks", totalAssets: 36.20e9, ytdReturn: 3.8, expenseRatio: 0.35, peRatio: 17.2 },
  { symbol: "VEA", name: "Vanguard FTSE Developed Markets ETF", assetClass: "Stocks", totalAssets: 206.98e9, ytdReturn: 6.7, expenseRatio: 0.05, peRatio: 14.9 },
  { symbol: "IEMG", name: "iShares Core MSCI Emerging Markets ETF", assetClass: "Stocks", totalAssets: 89.31e9, ytdReturn: 2.1, expenseRatio: 0.09, peRatio: 12.4 },
  { symbol: "XLK", name: "Technology Select Sector SPDR Fund", assetClass: "Stocks", totalAssets: 72.15e9, ytdReturn: 18.6, expenseRatio: 0.09, peRatio: 32.1 },
  { symbol: "XLF", name: "Financial Select Sector SPDR Fund", assetClass: "Stocks", totalAssets: 46.88e9, ytdReturn: 8.9, expenseRatio: 0.09, peRatio: 15.7 },
  { symbol: "XLE", name: "Energy Select Sector SPDR Fund", assetClass: "Stocks", totalAssets: 38.22e9, ytdReturn: -3.5, expenseRatio: 0.09, peRatio: 11.2 },
  { symbol: "ARKK", name: "ARK Innovation ETF", assetClass: "Stocks", totalAssets: 6.84e9, ytdReturn: -8.3, expenseRatio: 0.75, peRatio: null },
  { symbol: "VUG", name: "Vanguard Growth ETF", assetClass: "Stocks", totalAssets: 194.80e9, ytdReturn: 16.1, expenseRatio: 0.04, peRatio: 35.4 },
  { symbol: "VTV", name: "Vanguard Value ETF", assetClass: "Stocks", totalAssets: 130.50e9, ytdReturn: 5.2, expenseRatio: 0.04, peRatio: 16.8 },
  { symbol: "IWM", name: "iShares Russell 2000 ETF", assetClass: "Stocks", totalAssets: 65.70e9, ytdReturn: 1.9, expenseRatio: 0.19, peRatio: 24.6 },
  { symbol: "DIA", name: "SPDR Dow Jones Industrial Average ETF", assetClass: "Stocks", totalAssets: 35.14e9, ytdReturn: 7.1, expenseRatio: 0.16, peRatio: 19.4 },
  { symbol: "SOXX", name: "iShares Semiconductor ETF", assetClass: "Stocks", totalAssets: 14.22e9, ytdReturn: 22.4, expenseRatio: 0.35, peRatio: 28.9 },
  { symbol: "XLV", name: "Health Care Select Sector SPDR Fund", assetClass: "Stocks", totalAssets: 40.33e9, ytdReturn: 2.8, expenseRatio: 0.09, peRatio: 18.5 },
  { symbol: "XLI", name: "Industrial Select Sector SPDR Fund", assetClass: "Stocks", totalAssets: 20.56e9, ytdReturn: 6.3, expenseRatio: 0.09, peRatio: 20.1 },
  { symbol: "BND", name: "Vanguard Total Bond Market ETF", assetClass: "Bonds", totalAssets: 315.40e9, ytdReturn: 1.2, expenseRatio: 0.03, peRatio: null },
  { symbol: "AGG", name: "iShares Core U.S. Aggregate Bond ETF", assetClass: "Bonds", totalAssets: 118.60e9, ytdReturn: 1.1, expenseRatio: 0.03, peRatio: null },
  { symbol: "TLT", name: "iShares 20+ Year Treasury Bond ETF", assetClass: "Bonds", totalAssets: 52.80e9, ytdReturn: -2.4, expenseRatio: 0.15, peRatio: null },
  { symbol: "LQD", name: "iShares iBoxx $ Investment Grade Corporate Bond ETF", assetClass: "Bonds", totalAssets: 35.90e9, ytdReturn: 2.3, expenseRatio: 0.14, peRatio: null },
  { symbol: "HYG", name: "iShares iBoxx $ High Yield Corporate Bond ETF", assetClass: "Bonds", totalAssets: 17.45e9, ytdReturn: 3.1, expenseRatio: 0.49, peRatio: null },
  { symbol: "BNDX", name: "Vanguard Total International Bond ETF", assetClass: "Bonds", totalAssets: 62.30e9, ytdReturn: 0.8, expenseRatio: 0.07, peRatio: null },
  { symbol: "SHY", name: "iShares 1-3 Year Treasury Bond ETF", assetClass: "Bonds", totalAssets: 28.10e9, ytdReturn: 1.9, expenseRatio: 0.15, peRatio: null },
  { symbol: "VCIT", name: "Vanguard Intermediate-Term Corporate Bond ETF", assetClass: "Bonds", totalAssets: 48.70e9, ytdReturn: 2.0, expenseRatio: 0.04, peRatio: null },
  { symbol: "VNQ", name: "Vanguard Real Estate ETF", assetClass: "Real Estate", totalAssets: 62.40e9, ytdReturn: -1.2, expenseRatio: 0.12, peRatio: 34.7 },
  { symbol: "SCHH", name: "Schwab U.S. REIT ETF", assetClass: "Real Estate", totalAssets: 7.80e9, ytdReturn: -1.5, expenseRatio: 0.07, peRatio: 33.2 },
  { symbol: "IYR", name: "iShares U.S. Real Estate ETF", assetClass: "Real Estate", totalAssets: 4.35e9, ytdReturn: -0.9, expenseRatio: 0.39, peRatio: 35.1 },
  { symbol: "XLRE", name: "Real Estate Select Sector SPDR Fund", assetClass: "Real Estate", totalAssets: 6.22e9, ytdReturn: -1.0, expenseRatio: 0.09, peRatio: 36.8 },
  { symbol: "GLD", name: "SPDR Gold Shares", assetClass: "Commodities", totalAssets: 63.20e9, ytdReturn: 8.5, expenseRatio: 0.40, peRatio: null },
  { symbol: "SLV", name: "iShares Silver Trust", assetClass: "Commodities", totalAssets: 12.80e9, ytdReturn: 5.2, expenseRatio: 0.50, peRatio: null },
  { symbol: "IAU", name: "iShares Gold Trust", assetClass: "Commodities", totalAssets: 30.10e9, ytdReturn: 8.4, expenseRatio: 0.25, peRatio: null },
  { symbol: "USO", name: "United States Oil Fund", assetClass: "Commodities", totalAssets: 2.40e9, ytdReturn: -6.8, expenseRatio: 0.60, peRatio: null },
  { symbol: "DBA", name: "Invesco DB Agriculture Fund", assetClass: "Commodities", totalAssets: 0.95e9, ytdReturn: 3.1, expenseRatio: 0.93, peRatio: null },
  { symbol: "PDBC", name: "Invesco Optimum Yield Diversified Commodity Strategy", assetClass: "Commodities", totalAssets: 4.55e9, ytdReturn: -1.9, expenseRatio: 0.59, peRatio: null },
  { symbol: "BITO", name: "ProShares Bitcoin Strategy ETF", assetClass: "Crypto", totalAssets: 2.10e9, ytdReturn: 42.6, expenseRatio: 0.95, peRatio: null },
  { symbol: "ETHE", name: "Grayscale Ethereum Trust", assetClass: "Crypto", totalAssets: 5.30e9, ytdReturn: 28.3, expenseRatio: 2.50, peRatio: null },
  { symbol: "GBTC", name: "Grayscale Bitcoin Trust", assetClass: "Crypto", totalAssets: 17.80e9, ytdReturn: 38.1, expenseRatio: 1.50, peRatio: null },
  { symbol: "IBIT", name: "iShares Bitcoin Trust ETF", assetClass: "Crypto", totalAssets: 22.40e9, ytdReturn: 44.2, expenseRatio: 0.25, peRatio: null },
  { symbol: "FBTC", name: "Fidelity Wise Origin Bitcoin Fund", assetClass: "Crypto", totalAssets: 11.60e9, ytdReturn: 43.8, expenseRatio: 0.25, peRatio: null },
  { symbol: "VIG", name: "Vanguard Dividend Appreciation ETF", assetClass: "Stocks", totalAssets: 88.90e9, ytdReturn: 6.8, expenseRatio: 0.06, peRatio: 21.3 },
  { symbol: "VXUS", name: "Vanguard Total International Stock ETF", assetClass: "Stocks", totalAssets: 72.40e9, ytdReturn: 5.4, expenseRatio: 0.07, peRatio: 14.1 },
  { symbol: "RSP", name: "Invesco S&P 500 Equal Weight ETF", assetClass: "Stocks", totalAssets: 54.30e9, ytdReturn: 5.9, expenseRatio: 0.20, peRatio: 18.6 },
  { symbol: "EFA", name: "iShares MSCI EAFE ETF", assetClass: "Stocks", totalAssets: 59.10e9, ytdReturn: 6.2, expenseRatio: 0.32, peRatio: 14.7 },
  { symbol: "QUAL", name: "iShares MSCI USA Quality Factor ETF", assetClass: "Stocks", totalAssets: 42.80e9, ytdReturn: 13.1, expenseRatio: 0.15, peRatio: 25.4 },
];

const TABS = ["All", "Stocks", "Bonds", "Real Estate", "Commodities", "Crypto"] as const;

const columnHelper = createColumnHelper<EtfRow>();

function abbreviateNumber(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

export default function EtfMainPage() {
  const navigate = useNavigate();
  const [sorting, setSorting] = useState<SortingState>([{ id: "totalAssets", desc: true }]);
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>("All");
  const [pageSize, setPageSize] = useState(25);

  const filteredData = useMemo(() => {
    if (activeTab === "All") return SEED;
    return SEED.filter((e) => e.assetClass === activeTab);
  }, [activeTab]);

  const columns = useMemo(() => [
    columnHelper.accessor("symbol", {
      header: "Symbol",
      cell: (info) => (
        <button
          onClick={() => navigate(`/etf/${info.getValue().toLowerCase()}`)}
          className="font-semibold text-accent-blue hover:underline text-[0.8125rem]"
        >
          {info.getValue()}
        </button>
      ),
    }),
    columnHelper.accessor("name", {
      header: "Name",
      cell: (info) => <span className="text-foreground text-[0.875rem]">{info.getValue()}</span>,
    }),
    columnHelper.accessor("assetClass", {
      header: "Asset Class",
      cell: (info) => (
        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
          {info.getValue()}
        </span>
      ),
    }),
    columnHelper.accessor("totalAssets", {
      header: ({ column }) => (
        <button className="flex items-center gap-1 ml-auto" onClick={() => column.toggleSorting()}>
          Total Assets <ArrowUpDown className="h-3 w-3" />
        </button>
      ),
      cell: (info) => (
        <span className="text-foreground text-[0.875rem] tabular-nums text-right block">
          {abbreviateNumber(info.getValue())}
        </span>
      ),
    }),
    columnHelper.accessor("ytdReturn", {
      header: ({ column }) => (
        <button className="flex items-center gap-1 ml-auto" onClick={() => column.toggleSorting()}>
          YTD Return <ArrowUpDown className="h-3 w-3" />
        </button>
      ),
      cell: (info) => {
        const val = info.getValue();
        const pos = val >= 0;
        return (
          <span className={cn("text-[0.875rem] tabular-nums flex items-center justify-end gap-0.5", pos ? "text-green" : "text-red")}>
            {pos ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {pos ? "+" : ""}{val.toFixed(1)}%
          </span>
        );
      },
    }),
    columnHelper.accessor("expenseRatio", {
      header: ({ column }) => (
        <button className="flex items-center gap-1 ml-auto" onClick={() => column.toggleSorting()}>
          Expense Ratio <ArrowUpDown className="h-3 w-3" />
        </button>
      ),
      cell: (info) => (
        <span className="text-foreground text-[0.875rem] tabular-nums text-right block">
          {info.getValue().toFixed(2)}%
        </span>
      ),
    }),
    columnHelper.accessor("peRatio", {
      header: ({ column }) => (
        <button className="flex items-center gap-1 ml-auto" onClick={() => column.toggleSorting()}>
          P/E Ratio <ArrowUpDown className="h-3 w-3" />
        </button>
      ),
      cell: (info) => {
        const val = info.getValue();
        return (
          <span className="text-foreground text-[0.875rem] tabular-nums text-right block">
            {val != null ? val.toFixed(1) : "—"}
          </span>
        );
      },
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
    <div>
      <div className="p-4">
        <Breadcrumb className="mb-3">
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink href="/">Home</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>ETFs</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex items-center gap-3 mb-4">
          <h1 className="text-[1.375rem] font-bold text-foreground">ETF List</h1>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            {filteredData.length} ETFs
          </span>
        </div>

        {/* Tab bar */}
        <div className="flex items-center justify-between border-b border-border mb-0">
          <div className="flex gap-0">
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); table.setPageIndex(0); }}
                className={cn(
                  "px-4 py-2.5 text-sm font-medium transition-colors relative",
                  activeTab === tab
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab}
                {activeTab === tab && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
                )}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" className="text-xs gap-1.5 mr-2">
            <Lock className="h-3 w-3" /> Full Width
          </Button>
        </div>

        <div className="flex gap-6 mt-0">
          {/* Main content */}
          <div className="flex-1 min-w-0">
            <AdBanner className="mb-4 mt-4" />

            {/* Table */}
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    {table.getHeaderGroups().map((hg) => (
                      <tr key={hg.id} className="border-b border-border bg-surface">
                        {hg.headers.map((header) => (
                          <th key={header.id} className="text-left px-3 py-2 text-[0.8125rem] font-semibold text-muted-foreground uppercase tracking-wider">
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
                          <td key={cell.id} className="px-3 py-2">
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
          <aside className="hidden lg:block w-[280px] shrink-0 mt-4 space-y-4">
            {/* Pro promo card */}
            <div className="border border-border rounded-md p-4">
              <h3 className="text-sm font-bold text-foreground mb-1">HedgeFun Pro</h3>
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                Unlock unlimited screeners, real-time data, advanced charts, and ad-free browsing.
              </p>
              <Button
                size="sm"
                className="w-full text-xs bg-accent-blue hover:bg-accent-blue-hover text-primary-foreground"
                onClick={() => navigate("/pro")}
              >
                Upgrade to Pro →
              </Button>
            </div>

            {/* Newsletter card */}
            <div className="border border-border rounded-md p-4">
              <h3 className="text-sm font-bold text-foreground mb-1">Market Newsletter</h3>
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                Daily market news in bullet point format. Free, no spam.
              </p>
              <Input placeholder="Enter your email" className="h-8 text-xs mb-2" />
              <Button size="sm" className="w-full text-xs bg-accent-blue hover:bg-accent-blue-hover text-primary-foreground">
                Subscribe
              </Button>
            </div>

            {/* ETF Screener link */}
            <button
              onClick={() => navigate("/etf/screener")}
              className="w-full border border-border rounded-md p-4 text-left hover:border-accent-blue transition-colors group"
            >
              <h3 className="text-sm font-bold text-foreground mb-1 group-hover:text-accent-blue transition-colors">
                ETF Screener →
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Screen and filter ETFs by asset class, expense ratio, performance, and more.
              </p>
            </button>

            <AdBanner />
          </aside>
        </div>
      </div>
    </div>
  );
}
