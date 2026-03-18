import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getPaginationRowModel,
  flexRender, createColumnHelper, type SortingState,
} from "@tanstack/react-table";
import { Search, Plus, Lock, MoreHorizontal, ChevronDown, ChevronUp, HelpCircle, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { IpoTabBar } from "@/components/ipos/IpoTabBar";
import { AdBanner } from "@/components/layout/AdBanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator, BreadcrumbPage,
} from "@/components/ui/breadcrumb";

interface ScreenerIpo {
  symbol: string;
  company: string;
  marketCap: string;
  marketCapNum: number;
  industry: string;
  priceRange: string;
  dealSize: string;
  revenue: string;
}

const SEED: ScreenerIpo[] = [
  { symbol: "PAYP", company: "PayPay Corporation", marketCap: "12.37B", marketCapNum: 12370, industry: "Credit Services", priceRange: "$17.00 - $20.00", dealSize: "1.02B", revenue: "2.33B" },
  { symbol: "PHCC", company: "Preston Hollow Community Capital,...", marketCap: "2.26B", marketCapNum: 2260, industry: "Finance Services", priceRange: "$18.00 - $20.00", dealSize: "200.00M", revenue: "150.18M" },
  { symbol: "ZSSY", company: "Diamond Water Origin Supply Chai...", marketCap: "1.37B", marketCapNum: 1370, industry: "Shell Companies", priceRange: "$26.88", dealSize: "25.0M", revenue: "–" },
  { symbol: "EOCO", company: "Elliott Opportunity I Corp.", marketCap: "1.25B", marketCapNum: 1250, industry: "Shell Companies", priceRange: "$10.00", dealSize: "1.00B", revenue: "–" },
  { symbol: "NGIO", company: "NuGenerex Immuno-oncology, Inc.", marketCap: "952.70M", marketCapNum: 952, industry: "Pharmaceutical Preparations", priceRange: "$8.50 - $9.50", dealSize: "50.00M", revenue: "–" },
  { symbol: "TKVA", company: "Salspera Inc.", marketCap: "938.08M", marketCapNum: 938, industry: "Biotechnology", priceRange: "$14.00 - $16.00", dealSize: "85.00M", revenue: "–" },
  { symbol: "TACQ", company: "Tetragon Acquisition Corporation I", marketCap: "625.00M", marketCapNum: 625, industry: "Shell Companies", priceRange: "$10.00", dealSize: "500.00M", revenue: "–" },
  { symbol: "GGI", company: "Guggenheim Special Purpose Acqui...", marketCap: "625.00M", marketCapNum: 625, industry: "Shell Companies", priceRange: "$10.00", dealSize: "500.00M", revenue: "–" },
  { symbol: "RADD", company: "Corner Growth Acquisition Corp. 3", marketCap: "562.50M", marketCapNum: 562, industry: "Shell Companies", priceRange: "$10.00", dealSize: "450.00M", revenue: "–" },
  { symbol: "MWC", company: "Micware Co., Ltd.", marketCap: "479.14M", marketCapNum: 479, industry: "Information Technology Services", priceRange: "$7.00 - $9.00", dealSize: "30.00M", revenue: "148.75M" },
  { symbol: "AXY", company: "Wise Ocean Group Inc", marketCap: "470.00M", marketCapNum: 470, industry: "Software - Application", priceRange: "$5.00", dealSize: "20.00M", revenue: "–" },
  { symbol: "ACAM", company: "Acamar Partners Acquisition Corp. II", marketCap: "437.50M", marketCapNum: 437, industry: "Shell Companies", priceRange: "$10.00", dealSize: "350.00M", revenue: "–" },
  { symbol: "MTNE", company: "CH4 Natural Solutions Corporation", marketCap: "402.00M", marketCapNum: 402, industry: "Shell Companies", priceRange: "$10.00", dealSize: "300.00M", revenue: "–" },
  { symbol: "PPHC", company: "Public Policy Holding Company, Inc.", marketCap: "401.77M", marketCapNum: 401, industry: "Specialty Business Services", priceRange: "$14.08", dealSize: "58.43M", revenue: "166.33M" },
  { symbol: "SBMT", company: "Silver Bow Mining Corp.", marketCap: "375.94M", marketCapNum: 375, industry: "Other Precious Metals & Mining", priceRange: "$12.00 - $15.00", dealSize: "50.00M", revenue: "–" },
  { symbol: "DGC", company: "Delphi Growth Capital Corp.", marketCap: "375.00M", marketCapNum: 375, industry: "Shell Companies", priceRange: "$10.00", dealSize: "300.00M", revenue: "–" },
  { symbol: "ASPX", company: "Aspirational Consumer Lifestyle Cor...", marketCap: "375.00M", marketCapNum: 375, industry: "Shell Companies", priceRange: "$10.00", dealSize: "300.00M", revenue: "–" },
  { symbol: "BTVC", company: "Tribe Capital Growth Corp. II", marketCap: "375.00M", marketCapNum: 375, industry: "Shell Companies", priceRange: "$10.00", dealSize: "300.00M", revenue: "–" },
  { symbol: "PRDT", company: "Peridot Acquisition Corp. III", marketCap: "375.00M", marketCapNum: 375, industry: "Shell Companies", priceRange: "$10.00", dealSize: "300.00M", revenue: "–" },
  { symbol: "SVNI", company: "Seven Islands, Inc.", marketCap: "375.00M", marketCapNum: 375, industry: "Shell Companies", priceRange: "$10.00", dealSize: "300.00M", revenue: "–" },
];

const VIEW_TABS = ["General", "Filters", "Company", "Income", "Balance Sheet", "Cash Flow"] as const;

const col = createColumnHelper<ScreenerIpo>();

export default function IpoScreenerPage() {
  const navigate = useNavigate();
  const [sorting, setSorting] = useState<SortingState>([{ id: "marketCapNum", desc: true }]);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [viewTab, setViewTab] = useState<string>("General");

  const columns = useMemo(() => [
    col.accessor("symbol", {
      header: "Symbol",
      cell: (info) => (
        <button onClick={() => navigate(`/stocks/${info.getValue().toLowerCase()}`)} className="font-semibold text-accent-blue hover:underline text-sm">
          {info.getValue()}
        </button>
      ),
    }),
    col.accessor("company", {
      header: "Company Name",
      cell: (info) => <span className="text-foreground text-sm">{info.getValue()}</span>,
    }),
    col.accessor("marketCapNum", {
      header: () => <span className="text-right block">Market Cap</span>,
      cell: (info) => <span className="text-foreground text-sm tabular-nums text-right block">{info.row.original.marketCap}</span>,
    }),
    col.accessor("industry", {
      header: "Industry",
      cell: (info) => <span className="text-foreground text-sm">{info.getValue()}</span>,
    }),
    col.accessor("priceRange", {
      header: () => <span className="text-right block">Price Range</span>,
      cell: (info) => <span className="text-foreground text-sm tabular-nums text-right block">{info.getValue()}</span>,
    }),
    col.accessor("dealSize", {
      header: () => <span className="text-right block">Deal Size</span>,
      cell: (info) => <span className="text-foreground text-sm tabular-nums text-right block">{info.getValue()}</span>,
    }),
    col.accessor("revenue", {
      header: () => <span className="text-right block">Revenue</span>,
      cell: (info) => <span className="text-foreground text-sm tabular-nums text-right block">{info.getValue()}</span>,
    }),
  ], [navigate]);

  const table = useReactTable({
    data: SEED,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  });

  const pageIndex = table.getState().pagination.pageIndex;
  const pageCount = table.getPageCount();

  return (
    <div>
      <IpoTabBar />
      <div className="p-4">
        <Breadcrumb className="mb-3">
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink href="/">Home</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink href="/ipos/recent">IPOs</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>Screener</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-[1.75rem] font-bold text-foreground">IPO Screener</h1>
            <button className="flex items-center gap-1 text-sm text-accent-blue hover:underline">
              <HelpCircle className="h-4 w-4" /> Screener Tutorial
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Popular Screens</div>
              <Button variant="outline" size="sm" className="text-xs">Select popular <ChevronDown className="h-3 w-3 ml-1" /></Button>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Saved Screens</div>
              <Button variant="outline" size="sm" className="text-xs">Select saved <ChevronDown className="h-3 w-3 ml-1" /></Button>
            </div>
          </div>
        </div>

        {/* Filters bar */}
        <div className="border border-border rounded-lg mb-4">
          <button
            onClick={() => setFiltersOpen(!filtersOpen)}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-foreground"
          >
            {filtersOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            Filters
          </button>
          {filtersOpen && (
            <div className="px-4 pb-3 flex items-center gap-3">
              <Button size="sm" className="bg-accent-blue hover:bg-accent-blue-hover text-primary-foreground text-xs gap-1">
                <Plus className="h-3.5 w-3.5" /> Add Filters
              </Button>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Search 41 filters..." className="pl-8 h-8 w-[200px] text-sm" />
              </div>
            </div>
          )}
        </div>

        {/* Results header */}
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <span className="text-sm font-semibold text-foreground">{SEED.length} Stocks</span>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Find..." className="pl-8 h-8 w-[100px] text-sm" />
            </div>
            <Button variant="outline" size="sm" className="text-xs">Download ▾</Button>
            <Button size="sm" className="text-xs bg-accent-blue hover:bg-accent-blue-hover text-primary-foreground gap-1 relative">
              + Watchlist
              <span className="absolute -top-1.5 -right-1.5 bg-green text-primary-foreground text-[0.625rem] px-1 rounded-full font-bold leading-tight">New</span>
            </Button>
            <Button variant="outline" size="sm" className="text-xs">Indicators ▾</Button>
            <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => navigate("/pro")}><Lock className="h-3 w-3" /> Full Width</Button>
            <Button variant="outline" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
          </div>
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
              {vt === "Filters" && <span className="ml-1 bg-accent-blue text-primary-foreground text-[0.625rem] px-1.5 rounded-full font-bold">0</span>}
              {viewTab === vt && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />}
            </button>
          ))}
          <button className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">+ Add View</button>
          <button className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">✎ Edit View</button>
        </div>

        {/* Table */}
        <div className="border border-border rounded-b-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="border-b border-border bg-surface">
                    {hg.headers.map((header) => (
                      <th
                        key={header.id}
                        className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer"
                        onClick={header.column.getToggleSortingHandler()}
                      >
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
        <div className="flex items-center justify-between mt-4">
          <Button variant="outline" size="sm" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()} className="text-xs gap-1">
            ← Previous
          </Button>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Page {pageIndex + 1} of {pageCount}</span>
            <Button variant="outline" size="sm" className="text-xs">20 Rows ▾</Button>
          </div>
          <Button variant="outline" size="sm" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()} className="text-xs gap-1">
            Next →
          </Button>
        </div>

        {/* Back to top */}
        <div className="text-center mt-4 mb-6">
          <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="text-sm text-accent-blue hover:underline inline-flex items-center gap-1">
            <ArrowUp className="h-3.5 w-3.5" /> Back to Top
          </button>
        </div>

        <AdBanner />
      </div>
    </div>
  );
}
