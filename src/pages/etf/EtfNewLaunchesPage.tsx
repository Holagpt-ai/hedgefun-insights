import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Search, Lock, ArrowUpRight, ChevronUp, MoreHorizontal, Download } from "lucide-react";
import {
  useReactTable, getCoreRowModel, getSortedRowModel, type SortingState, type ColumnDef, flexRender,
} from "@tanstack/react-table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AdBanner } from "@/components/layout/AdBanner";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";

interface NewEtf {
  inception: string;
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
}

function fmtDate(d: string) {
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function EtfNewLaunchesPage() {
  const navigate = useNavigate();
  const [sorting, setSorting] = useState<SortingState>([{ id: "inception", desc: true }]);
  const [findSearch, setFindSearch] = useState("");
  const [activeTab, setActiveTab] = useState("Overview");

  const { data: dbData, isLoading } = useQuery({
    queryKey: ["etfs-new-launches"],
    queryFn: async () => {
      // Try fetching ETFs with inception dates first
      const { data: withDate, error: err1 } = await supabase
        .from("etfs")
        .select("symbol, name, inception_date, price, change_percent")
        .not("inception_date", "is", null)
        .order("inception_date", { ascending: false })
        .limit(100);
      if (!err1 && withDate && withDate.length > 0) {
        return withDate.map((r: any) => ({
          inception: r.inception_date,
          symbol: r.symbol,
          name: r.name,
          price: r.price,
          change: r.change_percent,
        })) as NewEtf[];
      }
      // Fallback: show all ETFs sorted by name
      const { data, error } = await supabase
        .from("etfs")
        .select("symbol, name, inception_date, price, change_percent")
        .order("symbol", { ascending: true })
        .limit(100);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        inception: r.inception_date ?? "",
        symbol: r.symbol,
        name: r.name,
        price: r.price,
        change: r.change_percent,
      })) as NewEtf[];
    },
  });

  const allData = dbData ?? [];

  const filtered = useMemo(() => {
    if (!findSearch) return allData;
    const q = findSearch.toLowerCase();
    return allData.filter((e) => e.symbol.toLowerCase().includes(q) || e.name.toLowerCase().includes(q));
  }, [findSearch, allData]);

  const columns = useMemo<ColumnDef<NewEtf>[]>(() => [
    {
      accessorKey: "inception", header: "Inception", size: 100,
      cell: ({ getValue }) => <span className="text-[0.875rem]">{getValue() ? fmtDate(getValue() as string) : "—"}</span>,
    },
    {
      accessorKey: "symbol", header: "Symbol", size: 70,
      cell: ({ getValue }) => {
        const sym = getValue() as string;
        return <button onClick={() => navigate(`/etf/${sym.toLowerCase()}`)} className="text-primary font-bold text-[0.875rem] hover:underline">{sym}</button>;
      },
    },
    {
      accessorKey: "name", header: "Fund Name",
      cell: ({ getValue }) => <span className="text-[0.875rem] truncate block max-w-[300px]">{getValue() as string}</span>,
    },
    {
      accessorKey: "price", header: "Stock Price", size: 90, meta: { align: "right" },
      cell: ({ getValue }) => {
        const v = getValue() as number | null;
        return <span className="text-[0.875rem]">{v != null ? `$${Number(v).toFixed(2)}` : "—"}</span>;
      },
    },
    {
      accessorKey: "change", header: "% Change", size: 90, meta: { align: "right" },
      cell: ({ getValue }) => {
        const v = getValue() as number | null;
        if (v == null) return <span className="text-muted-foreground">—</span>;
        return <span className={`text-[0.875rem] font-medium ${v >= 0 ? "text-green" : "text-red"}`}>{v >= 0 ? "+" : ""}{v.toFixed(2)}%</span>;
      },
    },
  ], [navigate]);

  const table = useReactTable({
    data: filtered, columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const tabs = ["Overview", "Price", "Profile"];

  return (
    <div className="min-w-0">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-[1.375rem] font-bold text-foreground">New ETFs</h1>
          <Button variant="outline" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => navigate("/pro")}>Full Width <Lock className="h-3.5 w-3.5" /></Button>
        </div>
        <p className="text-[0.875rem] text-muted-foreground mb-5">{filtered.length} Newest ETFs</p>

        <div className="flex gap-6">
          <div className="flex-1 min-w-0">
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

            <div className="flex items-center gap-1 border-b border-border mb-0">
              {tabs.map((tab) => (
                <button key={tab} onClick={() => setActiveTab(tab)} className={`px-3 py-2 text-[0.8125rem] font-medium border-b-2 transition-colors ${activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{tab}</button>
              ))}
              <button className="px-3 py-2 text-[0.8125rem] text-muted-foreground border border-border rounded-md ml-2 hover:bg-muted">+ Add View</button>
              <button className="px-3 py-2 text-[0.8125rem] text-muted-foreground hover:text-foreground">Edit View</button>
            </div>

            {isLoading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-muted-foreground text-sm py-8 text-center">No new ETF launches found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    {table.getHeaderGroups().map((hg) => (
                      <tr key={hg.id} className="border-b-2 border-border bg-muted/30">
                        {hg.headers.map((h) => (
                          <th key={h.id} className={`py-2 px-2.5 text-[0.8125rem] font-semibold text-muted-foreground cursor-pointer select-none ${(h.column.columnDef.meta as any)?.align === "right" ? "text-right" : "text-left"}`} style={{ width: h.column.getSize() !== 150 ? h.column.getSize() : undefined }} onClick={h.column.getToggleSortingHandler()}>
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
                          <td key={cell.id} className={`py-[7px] px-2.5 ${(cell.column.columnDef.meta as any)?.align === "right" ? "text-right" : "text-left"}`}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="flex items-center justify-center gap-1 w-full py-3 text-[0.875rem] text-primary hover:underline mt-2">
              <ChevronUp className="h-4 w-4" /> Back to Top
            </button>
          </div>

          <aside className="hidden lg:flex flex-col gap-4 w-[300px] shrink-0">
            <div className="border border-border rounded-[var(--radius)] p-4">
              <h3 className="text-[1rem] font-bold text-foreground mb-2">Stock Analysis Pro</h3>
              <p className="text-[0.8125rem] text-muted-foreground mb-3">Upgrade now for unlimited access to all data and tools.</p>
              <Button size="sm" className="w-full" onClick={() => navigate("/pro")}>Sign Up Today</Button>
            </div>
            <div className="border border-border rounded-[var(--radius)] p-4">
              <h3 className="text-[1rem] font-bold text-foreground mb-2">Market Newsletter</h3>
              <p className="text-[0.8125rem] text-muted-foreground mb-3">Get a daily email with the top market news in bullet point format.</p>
              <div className="flex gap-2">
                <Input placeholder="Enter your email" className="h-8 text-sm flex-1" />
                <Button size="sm">Subscribe</Button>
              </div>
            </div>
            <button onClick={() => navigate("/etf/screener")} className="border border-border rounded-[var(--radius)] p-4 text-left hover:border-accent-blue transition-colors relative group">
              <ArrowUpRight className="absolute top-3 right-3 h-4 w-4 text-muted-foreground group-hover:text-primary" />
              <h3 className="text-[1rem] font-bold text-foreground mb-1">ETF Screener</h3>
              <p className="text-[0.8125rem] text-muted-foreground">Filter, sort and analyze all ETFs to find your next investment.</p>
            </button>
            <button onClick={() => navigate("/etf/compare")} className="border border-border rounded-[var(--radius)] p-4 text-left hover:border-accent-blue transition-colors relative group">
              <ArrowUpRight className="absolute top-3 right-3 h-4 w-4 text-muted-foreground group-hover:text-primary" />
              <h3 className="text-[1rem] font-bold text-foreground mb-1">ETF Comparison Tool</h3>
              <p className="text-[0.8125rem] text-muted-foreground">Compare two or more ETFs side-by-side.</p>
            </button>
            <AdBanner />
            <div className="border border-border rounded-[var(--radius)] p-4">
              <h3 className="text-[1rem] font-bold text-foreground mb-1"><span className="text-amber-500">Top Monthly Dividends</span></h3>
              <p className="text-[0.8125rem] text-muted-foreground mb-3">Monthly Dividend ETF with enhanced dividends.</p>
              <button onClick={() => navigate("/etf/screener")} className="text-[0.8125rem] text-primary hover:underline font-medium">Learn More ›</button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
