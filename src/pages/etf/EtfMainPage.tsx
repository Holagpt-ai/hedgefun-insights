import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { Skeleton } from "@/components/ui/skeleton";
import { AdBanner } from "@/components/layout/AdBanner";

interface EtfRow {
  symbol: string;
  name: string;
  assetClass: string;
  totalAssets: number;
}

const VIEW_TABS = ["Overview", "Performance", "Price", "Profile", "Dividends", "Technicals"] as const;

const columnHelper = createColumnHelper<EtfRow>();

function abbreviateAssets(n: number | null): string {
  if (n == null) return "—";
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

  const { data: dbData, isLoading } = useQuery({
    queryKey: ["etfs-main"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etfs")
        .select("symbol, name, asset_class, total_assets")
        .order("total_assets", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        symbol: r.symbol,
        name: r.name,
        assetClass: r.asset_class ?? "Equity",
        totalAssets: r.total_assets ?? 0,
      })) as EtfRow[];
    },
  });

  const allData = dbData ?? [];

  const filteredData = useMemo(() => {
    if (!search.trim()) return allData;
    const q = search.toLowerCase();
    return allData.filter((e) => e.symbol.toLowerCase().includes(q) || e.name.toLowerCase().includes(q));
  }, [search, allData]);

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
      <div className="flex items-start justify-between mb-5">
        <h1 className="text-[1.75rem] font-bold text-foreground leading-tight">All ETF Symbols</h1>
        <button onClick={() => navigate("/pro")} className="flex items-center gap-1.5 text-[0.875rem] text-muted-foreground mt-1">
          Full Width <Lock className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex gap-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <span className="text-[1rem] font-bold text-foreground whitespace-nowrap">
              {filteredData.length} ETFs
            </span>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Find..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 w-[140px] text-sm" />
            </div>
            <Button variant="outline" size="sm" className="text-xs">Indicators ▾</Button>
            <Button size="sm" className="text-xs bg-accent-blue hover:bg-accent-blue-hover text-primary-foreground" onClick={() => navigate("/etf/screener")}>Screener →</Button>
            <Button variant="outline" size="icon" className="h-8 w-8"><Download className="h-3.5 w-3.5" /></Button>
            <Button variant="outline" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
          </div>

          <div className="flex gap-0 border-b border-border mb-0">
            {VIEW_TABS.map((vt) => (
              <button key={vt} onClick={() => setViewTab(vt)} className={cn("px-4 py-2 text-sm font-medium transition-colors relative", viewTab === vt ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
                {vt}
                {viewTab === vt && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />}
              </button>
            ))}
            <button className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">+ Add View</button>
            <button className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">✎ Edit View</button>
          </div>

          <div className="border border-t-0 border-border rounded-b-lg overflow-hidden">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : (
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
            )}
          </div>

          <div className="flex items-center justify-between mt-3 mb-8">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Show</span>
              <select value={pageSize} onChange={(e) => handlePageSizeChange(e.target.value)} className="border border-border rounded px-2 py-1 text-sm bg-background text-foreground">
                {[25, 50, 100].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <span>per page</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="text-xs" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>← Previous</Button>
              <span className="text-sm text-muted-foreground">Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}</span>
              <Button variant="outline" size="sm" className="text-xs" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>Next →</Button>
            </div>
          </div>
        </div>

        <aside className="hidden lg:block w-[280px] shrink-0 space-y-4">
          <button onClick={() => navigate("/pro")} className="w-full border border-border rounded-md p-4 text-left hover:border-accent-blue transition-colors group relative">
            <ArrowUpRight className="absolute top-3 right-3 h-4 w-4 text-muted-foreground group-hover:text-accent-blue transition-colors" />
            <h3 className="text-[0.9375rem] font-bold text-foreground mb-1">HedgeFun Pro</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">Upgrade now for unlimited access to all data and tools.</p>
          </button>
          <button onClick={() => navigate("/newsletter")} className="w-full border border-border rounded-md p-4 text-left hover:border-accent-blue transition-colors group relative">
            <ArrowUpRight className="absolute top-3 right-3 h-4 w-4 text-muted-foreground group-hover:text-accent-blue transition-colors" />
            <h3 className="text-[0.9375rem] font-bold text-foreground mb-1">Market Newsletter</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">Get a daily email with the top market news in bullet point format.</p>
          </button>
          <button onClick={() => navigate("/etf/screener")} className="w-full border border-border rounded-md p-4 text-left hover:border-accent-blue transition-colors group relative">
            <ArrowUpRight className="absolute top-3 right-3 h-4 w-4 text-muted-foreground group-hover:text-accent-blue transition-colors" />
            <h3 className="text-[0.9375rem] font-bold text-foreground mb-1">ETF Screener</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">Filter, sort and analyze all ETFs to find your next investment.</p>
          </button>
          <button onClick={() => navigate("/etf/compare")} className="w-full border border-border rounded-md p-4 text-left hover:border-accent-blue transition-colors group relative">
            <ArrowUpRight className="absolute top-3 right-3 h-4 w-4 text-muted-foreground group-hover:text-accent-blue transition-colors" />
            <h3 className="text-[0.9375rem] font-bold text-foreground mb-1">ETF Comparison Tool</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">Compare two or more ETFs side-by-side.</p>
          </button>
          <AdBanner />
        </aside>
      </div>
    </div>
  );
}
