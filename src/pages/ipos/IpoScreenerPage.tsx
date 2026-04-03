import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getPaginationRowModel,
  flexRender, createColumnHelper, type SortingState,
} from "@tanstack/react-table";
import { Search, Plus, Lock, MoreHorizontal, ChevronDown, ChevronUp, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { IpoTabBar } from "@/components/ipos/IpoTabBar";
import { AdBanner } from "@/components/layout/AdBanner";
import { ScreenerTutorialButton } from "@/components/screener/ScreenerTutorialDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator, BreadcrumbPage,
} from "@/components/ui/breadcrumb";

interface ScreenerIpo {
  symbol: string;
  company: string;
  exchange: string;
  priceRange: string;
  offerPrice: number;
  ipoDate: string;
  status: string;
}

const VIEW_TABS = ["General", "Filters", "Company", "Income", "Balance Sheet", "Cash Flow"] as const;

const col = createColumnHelper<ScreenerIpo>();

const comingSoon = (label: string) =>
  toast("Coming Soon", { description: `${label} will be available in a future update.` });

export default function IpoScreenerPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [viewTab, setViewTab] = useState<string>("General");

  const EDGE = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/market-data`;

  const { data: dbData, isLoading } = useQuery({
    queryKey: ["ipo-screener"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ipo_list")
        .select("*")
        .order("ipo_date", { ascending: false })
        .limit(100);
      if (error) throw error;
      if (data && data.length > 0) return data;
      const res = await fetch(`${EDGE}?type=ipos&ipoStatus=history&limit=50`);
      return await res.json();
    },
    staleTime: 300_000,
    retry: 2,
  });

  const tableData: ScreenerIpo[] = useMemo(() => {
    if (!dbData) return [];
    return dbData.map((ipo: any) => ({
      symbol: ipo.symbol ?? "TBD",
      company: ipo.name,
      exchange: ipo.exchange ?? "–",
      priceRange: ipo.price_range ?? "–",
      offerPrice: ipo.offer_price ?? 0,
      ipoDate: ipo.ipo_date,
      status: ipo.status ?? "–",
    }));
  }, [dbData]);

  const columns = useMemo(() => [
    col.accessor("symbol", {
      header: "Symbol",
      cell: (info) => {
        const val = info.getValue();
        return val && val !== "TBD" ? (
          <button onClick={() => navigate(`/stocks/${val.toLowerCase()}`)} className="font-semibold text-accent-blue hover:underline text-sm">
            {val}
          </button>
        ) : (
          <span className="text-muted-foreground text-xs">TBD</span>
        );
      },
    }),
    col.accessor("company", {
      header: "Company Name",
      cell: (info) => <span className="text-foreground text-sm">{info.getValue()}</span>,
    }),
    col.accessor("ipoDate", {
      header: "IPO Date",
      cell: (info) => (
        <span className="text-muted-foreground text-sm tabular-nums">
          {new Date(info.getValue()).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </span>
      ),
    }),
    col.accessor("exchange", {
      header: "Exchange",
      cell: (info) => <span className="text-foreground text-sm">{info.getValue()}</span>,
    }),
    col.accessor("priceRange", {
      header: () => <span className="text-right block">Price Range</span>,
      cell: (info) => <span className="text-foreground text-sm tabular-nums text-right block">{info.getValue()}</span>,
    }),
    col.accessor("offerPrice", {
      header: () => <span className="text-right block">Offer Price</span>,
      cell: (info) => {
        const val = info.getValue();
        return <span className="text-foreground text-sm tabular-nums text-right block">{val ? `$${val.toFixed(2)}` : "–"}</span>;
      },
    }),
  ], [navigate]);

  const table = useReactTable({
    data: tableData,
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

  const handleDownload = () => {
    const rows = tableData;
    if (!rows.length) {
      toast("No data to download");
      return;
    }
    const header = "Date,Symbol,Company Name,Exchange,Offer Price,Price Range,Status";
    const csvRows = rows.map((e) =>
      [
        e.ipoDate ?? "",
        e.symbol ?? "",
        `"${(e.company ?? "").replace(/"/g, '""')}"`,
        e.exchange ?? "",
        e.offerPrice ? `$${e.offerPrice.toFixed(2)}` : "",
        `"${(e.priceRange ?? "").replace(/"/g, '""')}"`,
        e.status ?? "",
      ].join(",")
    );
    const csv = [header, ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ipo_screener.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("IPO data downloaded successfully.");
  };

  const handleTabClick = (vt: string) => {
    if (vt !== "General") {
      comingSoon(vt);
      return;
    }
    setViewTab(vt);
  };

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
            <ScreenerTutorialButton variant="ipo" />
          </div>
          <div className="flex items-center gap-3">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Popular Screens</div>
              <Button variant="outline" size="sm" className="text-xs" onClick={() => comingSoon("Popular Screens")}>Select popular <ChevronDown className="h-3 w-3 ml-1" /></Button>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Saved Screens</div>
              <Button variant="outline" size="sm" className="text-xs" onClick={() => comingSoon("Saved Screens")}>Select saved <ChevronDown className="h-3 w-3 ml-1" /></Button>
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
              <Button size="sm" className="bg-accent-blue hover:bg-accent-blue-hover text-primary-foreground text-xs gap-1" onClick={() => comingSoon("Add Filters")}>
                <Plus className="h-3.5 w-3.5" /> Add Filters
              </Button>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Search filters..." className="pl-8 h-8 w-[200px] text-sm" />
              </div>
            </div>
          )}
        </div>

        {/* Results header */}
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <span className="text-sm font-semibold text-foreground">{tableData.length} IPOs</span>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Find..." className="pl-8 h-8 w-[100px] text-sm" />
            </div>
            <Button variant="outline" size="sm" className="text-xs" onClick={handleDownload}>Download ▾</Button>
            <Button size="sm" className="text-xs bg-accent-blue hover:bg-accent-blue-hover text-primary-foreground gap-1 relative" onClick={() => navigate(user ? "/watchlist" : "/auth")}>
              + Watchlist
              <span className="absolute -top-1.5 -right-1.5 bg-green text-primary-foreground text-[0.625rem] px-1 rounded-full font-bold leading-tight">New</span>
            </Button>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => comingSoon("Indicators")}>Indicators ▾</Button>
            <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => navigate("/pro")}><Lock className="h-3 w-3" /> Full Width</Button>
            <Button variant="outline" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
          </div>
        </div>

        {/* View tabs */}
        <div className="flex gap-0 border-b border-border mb-0">
          {VIEW_TABS.map((vt) => (
            <button
              key={vt}
              onClick={() => handleTabClick(vt)}
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
          <button className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground" onClick={() => comingSoon("Add View")}>+ Add View</button>
          <button className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground" onClick={() => comingSoon("Edit View")}>✎ Edit View</button>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-2 mt-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded" />
            ))}
          </div>
        ) : tableData.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">No IPO data available yet. Check back soon for the latest IPO listings.</p>
        ) : (
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
        )}

        {/* Pagination */}
        {tableData.length > 0 && (
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
        )}

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
