import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import { ArrowUpDown, TrendingUp, TrendingDown, ArrowUpRight, Info, Search, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { IpoTabBar } from "@/components/ipos/IpoTabBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AdBanner } from "@/components/layout/AdBanner";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";

/* ── Types ─────────────────────────────────────── */
interface RecentIpo {
  date: string;
  symbol: string;
  company: string;
  exchange: string;
  price: number;
  changePct: number;
}

const YEARS = ["All", "2026", "2025", "2024", "2023", "2022", "2021"];

/* ── Column helper ────────────────────────────── */
const columnHelper = createColumnHelper<RecentIpo>();

/* ── Component ────────────────────────────────── */
export function RecentIposPage() {
  const navigate = useNavigate();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [yearFilter, setYearFilter] = useState("All");

  const EDGE = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/market-data`;

  const { data: dbData, isLoading } = useQuery({
    queryKey: ["ipo-recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ipo_list")
        .select("*")
        .eq("status", "recent")
        .order("ipo_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      if (data && data.length > 0) return data;
      // Fallback to live API
      const res = await fetch(`${EDGE}?type=ipos&ipoStatus=history&limit=30`);
      return await res.json();
    },
    staleTime: 300_000,
    retry: 2,
  });

  const { data: upcomingIpos } = useQuery({
    queryKey: ["ipo-upcoming-sidebar"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ipo_list")
        .select("*")
        .eq("status", "upcoming")
        .order("ipo_date", { ascending: true })
        .limit(5);
      if (error) throw error;
      if (data && data.length > 0) return data;
      // Fallback to live API
      const res = await fetch(`${EDGE}?type=ipos&ipoStatus=pending&limit=5`);
      return await res.json();
    },
    staleTime: 300_000,
    retry: 2,
  });

  const { data: ipoNews } = useQuery({
    queryKey: ["ipo-news-sidebar"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_news")
        .select("*")
        .eq("category", "ipo")
        .order("published_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
  });

  const tableData: RecentIpo[] = useMemo(() => {
    if (!dbData) return [];
    return dbData.map((ipo) => ({
      date: ipo.ipo_date,
      symbol: ipo.symbol ?? "TBD",
      company: ipo.name,
      exchange: ipo.exchange ?? "–",
      price: ipo.offer_price ?? 0,
      changePct: 0,
    }));
  }, [dbData]);

  const filteredData = useMemo(() => {
    if (yearFilter === "All") return tableData;
    return tableData.filter((d) => d.date && d.date.startsWith(yearFilter));
  }, [yearFilter, tableData]);

  const columns = useMemo(() => [
    columnHelper.accessor("date", {
      header: "Date",
      cell: (info) => (
        <span className="text-muted-foreground text-xs tabular-nums whitespace-nowrap">
          {new Date(info.getValue()).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </span>
      ),
    }),
    columnHelper.accessor("symbol", {
      header: "Symbol",
      cell: (info) => {
        const val = info.getValue();
        return val && val !== "TBD" ? (
          <button
            onClick={() => navigate(`/stocks/${val.toLowerCase()}`)}
            className="font-semibold text-accent-blue hover:underline text-sm"
          >
            {val}
          </button>
        ) : (
          <span className="text-muted-foreground text-xs">TBD</span>
        );
      },
    }),
    columnHelper.accessor("company", {
      header: "Company Name",
      cell: (info) => <span className="text-foreground text-sm">{info.getValue()}</span>,
    }),
    columnHelper.accessor("exchange", {
      header: "Exchange",
      cell: (info) => (
        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
          {info.getValue()}
        </span>
      ),
    }),
    columnHelper.accessor("price", {
      header: () => <span className="w-full text-right block">Offer Price</span>,
      cell: (info) => {
        const val = info.getValue();
        return (
          <span className="text-foreground text-sm tabular-nums text-right block">
            {val ? `$${val.toFixed(2)}` : "–"}
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
    initialState: { pagination: { pageSize: 50 } },
  });

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

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
            <BreadcrumbItem><BreadcrumbPage>Recent IPOs</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex flex-col md:flex-row gap-6">
          {/* Main content */}
          <div className="flex-1 min-w-0">
            <h1 className="text-[1.75rem] font-bold text-foreground mb-3">
              Last {tableData.length} IPOs{yearFilter !== "All" ? ` (${filteredData.length} shown)` : ""}
            </h1>

            {/* Year sub-tabs */}
            <div className="flex gap-1.5 mb-4 flex-wrap">
              {YEARS.map((year) => (
                <button
                  key={year}
                  onClick={() => setYearFilter(year)}
                  className={cn(
                    "px-3 py-1 rounded-full text-sm font-medium transition-colors",
                    yearFilter === year
                      ? "bg-accent-blue text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  {year}
                </button>
              ))}
            </div>

            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded" />
                ))}
              </div>
            ) : filteredData.length === 0 ? (
              <p className="text-muted-foreground text-sm py-8 text-center">No recent IPOs found.</p>
            ) : (
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      {table.getHeaderGroups().map((hg) => (
                        <tr key={hg.id} className="border-b border-border bg-surface">
                          {hg.headers.map((header) => (
                            <th
                              key={header.id}
                              className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                            >
                              {flexRender(header.column.columnDef.header, header.getContext())}
                            </th>
                          ))}
                        </tr>
                      ))}
                    </thead>
                    <tbody>
                      {table.getRowModel().rows.map((row) => (
                        <tr
                          key={row.id}
                          className="border-b border-border-subtle hover:bg-surface transition-colors"
                        >
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

            <div className="mt-6">
              <AdBanner />
            </div>
          </div>

          {/* Right sidebar */}
          <aside className="w-full md:w-[300px] shrink-0 space-y-4">
            {/* Upcoming IPOs card */}
            <div className="border border-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-bold text-foreground">Upcoming IPOs</h2>
                <button
                  onClick={() => navigate("/ipos/calendar")}
                  className="text-xs text-accent-blue hover:underline font-medium"
                >
                  View All IPO Calendar →
                </button>
              </div>
              <div className="space-y-0">
                {(upcomingIpos ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">No upcoming IPOs scheduled.</p>
                ) : (upcomingIpos ?? []).map((ipo, i) => (
                  <div
                    key={ipo.id}
                    className={cn(
                      "py-2.5",
                      i < (upcomingIpos?.length ?? 0) - 1 && "border-b border-border-subtle"
                    )}
                  >
                    <div className="text-xs text-muted-foreground mb-0.5">
                      {new Date(ipo.ipo_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground flex-1 truncate">{ipo.name}</span>
                      {ipo.symbol && (
                        <button
                          onClick={() => navigate(`/stocks/${ipo.symbol!.toLowerCase()}`)}
                          className="text-xs font-semibold text-accent-blue hover:underline"
                        >
                          {ipo.symbol}
                        </button>
                      )}
                      {ipo.exchange && (
                        <span className="text-[0.6875rem] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                          {ipo.exchange}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => navigate("/ipos/calendar")}
                className="mt-3 w-full text-center text-sm font-medium text-accent-blue border border-accent-blue rounded-lg py-2 hover:bg-accent-blue-light transition-colors"
              >
                View All IPO Calendar
              </button>
            </div>

            {/* Ad banner */}
            <div className="border border-border rounded-lg overflow-hidden" style={{ minHeight: 250 }}>
              <AdBanner />
            </div>

            {/* IPO News card */}
            <div className="border border-border rounded-lg p-4">
              <h2 className="text-base font-bold text-foreground mb-3">IPO News</h2>
              <div className="space-y-0">
                {(ipoNews ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">No IPO news available.</p>
                ) : (ipoNews ?? []).map((news, i) => (
                  <div
                    key={news.id}
                    className={cn(
                      "py-2.5",
                      i < (ipoNews?.length ?? 0) - 1 && "border-b border-border-subtle"
                    )}
                  >
                    <a
                      href={news.url ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-accent-blue hover:underline text-left leading-snug block"
                    >
                      {news.headline}
                    </a>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {news.source ?? "HedgeFun"} · {news.published_at ? timeAgo(news.published_at) : ""}
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => navigate("/ipos/news")}
                className="mt-3 text-sm font-medium text-accent-blue hover:underline"
              >
                More IPO News →
              </button>
            </div>

            {/* Ad banner */}
            <div className="border border-border rounded-lg overflow-hidden" style={{ minHeight: 250 }}>
              <AdBanner />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

/* ── IPO Calendar ──────────────────────────────── */
interface CalendarIpo {
  ipoDate: string;
  symbol: string;
  company: string;
  exchange: string;
  priceRange: string;
  offerPrice: number;
}

const calendarColumnHelper = createColumnHelper<CalendarIpo>();

const CALENDAR_SUB_TABS = ["Upcoming", "Filings", "Withdrawn"] as const;
const VIEW_TABS = ["Overview", "Financials", "Margins", "Profile"] as const;

const IPO_RESOURCES = [
  { title: "Recent IPOs", description: "The 200 most recently launched IPOs", route: "/ipos/recent" },
  { title: "Filings", description: "All companies that have filed for an initial public offering", route: "/ipos/calendar?tab=filings" },
  { title: "Statistics", description: "IPO launches by year and month", route: "/ipos/statistics" },
  { title: "News", description: "News about initial public offerings", route: "/ipos/news" },
];

export function UpcomingIposPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [subTab, setSubTab] = useState<(typeof CALENDAR_SUB_TABS)[number]>("Upcoming");

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "filings") setSubTab("Filings");
    else if (tab === "withdrawn") setSubTab("Withdrawn");
  }, [searchParams]);
  const [viewTab, setViewTab] = useState<(typeof VIEW_TABS)[number]>("Overview");
  const [sorting, setSorting] = useState<SortingState>([{ id: "ipoDate", desc: false }]);
  const [search, setSearch] = useState("");

  const EDGE_CAL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/market-data`;

  const { data: upcomingData, isLoading } = useQuery({
    queryKey: ["ipo-calendar-upcoming"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ipo_list")
        .select("*")
        .eq("status", "upcoming")
        .order("ipo_date", { ascending: true })
        .limit(50);
      if (error) throw error;
      if (data && data.length > 0) return data;
      const res = await fetch(`${EDGE_CAL}?type=ipos&ipoStatus=pending&limit=50`);
      return await res.json();
    },
    staleTime: 300_000,
    retry: 2,
  });

  const calendarRows: CalendarIpo[] = useMemo(() => {
    if (!upcomingData) return [];
    return upcomingData.map((ipo) => ({
      ipoDate: ipo.ipo_date,
      symbol: ipo.symbol ?? "TBD",
      company: ipo.name,
      exchange: ipo.exchange ?? "–",
      priceRange: ipo.price_range ?? "–",
      offerPrice: ipo.offer_price ?? 0,
    }));
  }, [upcomingData]);

  const columns = useMemo(() => [
    calendarColumnHelper.accessor("ipoDate", {
      header: ({ column }) => (
        <button className="flex items-center gap-1" onClick={() => column.toggleSorting()}>
          IPO Date <ArrowUpDown className="h-3 w-3" />
        </button>
      ),
      cell: (info) => (
        <span className="text-foreground text-sm tabular-nums whitespace-nowrap">
          {new Date(info.getValue()).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </span>
      ),
    }),
    calendarColumnHelper.accessor("symbol", {
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
    calendarColumnHelper.accessor("company", {
      header: "Company Name",
      cell: (info) => <span className="text-foreground text-sm">{info.getValue()}</span>,
    }),
    calendarColumnHelper.accessor("exchange", {
      header: "Exchange",
      cell: (info) => <span className="text-foreground text-sm">{info.getValue()}</span>,
    }),
    calendarColumnHelper.accessor("priceRange", {
      header: "Price Range",
      cell: (info) => <span className="text-foreground text-sm tabular-nums">{info.getValue()}</span>,
    }),
  ], [navigate]);

  const table = useReactTable({
    data: calendarRows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

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
            <BreadcrumbItem><BreadcrumbPage>Calendar</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <h1 className="text-[1.75rem] font-bold text-foreground mb-4">IPO Calendar</h1>

        {/* Sub-tabs */}
        <div className="flex gap-1 mb-6">
          {CALENDAR_SUB_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setSubTab(tab)}
              className={cn(
                "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
                subTab === tab
                  ? "bg-accent-blue text-primary-foreground"
                  : "text-text-secondary hover:text-foreground"
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Filings tab */}
        {subTab === "Filings" && (
          <div className="mb-8">
            <h2 className="text-[1.25rem] font-bold text-foreground mb-3">IPO Filings</h2>
            <p className="text-muted-foreground text-sm py-4">Filing data will be available once the IPO sync is populated.</p>
          </div>
        )}

        {/* Withdrawn tab */}
        {subTab === "Withdrawn" && (
          <div className="mb-8">
            <h2 className="text-[1.25rem] font-bold text-foreground mb-3">Withdrawn IPOs</h2>
            <p className="text-muted-foreground text-sm py-4">Withdrawn IPO data will be available once the IPO sync is populated.</p>
          </div>
        )}

        {/* Upcoming tab */}
        {subTab === "Upcoming" && <div className="mb-8">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="text-[1.25rem] font-bold text-foreground">
              Upcoming IPOs · {calendarRows.length} IPO{calendarRows.length !== 1 ? "s" : ""}
            </h2>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Find..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 w-[120px] text-sm"
                />
              </div>
              <Button variant="outline" size="sm" className="text-xs">Indicators ▾</Button>
              <Button size="sm" className="text-xs bg-accent-blue hover:bg-accent-blue-hover text-primary-foreground">Screener →</Button>
              <Button variant="outline" size="sm" className="text-xs">Download ▾</Button>
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
                {viewTab === vt && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />}
              </button>
            ))}
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="space-y-2 mt-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded" />
              ))}
            </div>
          ) : calendarRows.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">No upcoming IPOs scheduled.</p>
          ) : (
            <div className="border border-border rounded-b-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    {table.getHeaderGroups().map((hg) => (
                      <tr key={hg.id} className="border-b border-border bg-surface">
                        {hg.headers.map((header) => (
                          <th key={header.id} className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
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
        </div>}

        {/* Sources */}
        <p className="text-[0.8125rem] text-muted-foreground mb-10 leading-relaxed">
          <strong>Sources:</strong> Most data is sourced from the S-1 filings that companies submit to the U.S. Securities and Exchange Commission (SEC). IPO dates are sourced from SEC filings, press releases, roadshow presentations, NASDAQ, NYSE and others. IPO dates are estimated and may change, and in some cases companies postpone or withdraw their plans.
        </p>

        {/* More IPO Resources */}
        <div className="mb-8">
          <h2 className="text-[1.25rem] font-bold text-foreground mb-4">More IPO Resources</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {IPO_RESOURCES.map((res) => (
              <button
                key={res.title}
                onClick={() => navigate(res.route)}
                className="border border-border rounded-lg p-4 text-left hover:border-accent-blue transition-colors group relative"
              >
                <ArrowUpRight className="absolute top-3 right-3 h-4 w-4 text-muted-foreground group-hover:text-accent-blue transition-colors" />
                <h3 className="text-sm font-bold text-foreground mb-1">{res.title}</h3>
                <p className="text-xs text-muted-foreground leading-snug">{res.description}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
