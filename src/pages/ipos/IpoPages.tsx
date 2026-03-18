import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  followers: number;
  price: number;
  changePct: number;
}

/* ── Seed Data ─────────────────────────────────── */
const SEED_DATA: RecentIpo[] = [
  { date: "2026-03-07", symbol: "RDDT", company: "Reddit Inc.", exchange: "NYSE", followers: 14280, price: 168.42, changePct: 12.5 },
  { date: "2026-03-06", symbol: "IBKR", company: "Interactive Brokers Group", exchange: "NASDAQ", followers: 8920, price: 142.30, changePct: -3.2 },
  { date: "2026-03-05", symbol: "ALAB", company: "Astera Labs Inc.", exchange: "NASDAQ", followers: 11340, price: 72.18, changePct: 42.8 },
  { date: "2026-03-04", symbol: "VRT", company: "Vertiv Holdings Co.", exchange: "NYSE", followers: 6780, price: 88.54, changePct: 8.1 },
  { date: "2026-03-03", symbol: "CART", company: "Maplebear Inc. (Instacart)", exchange: "NASDAQ", followers: 19450, price: 32.90, changePct: -12.4 },
  { date: "2026-02-28", symbol: "BIRK", company: "Birkenstock Holding plc", exchange: "NYSE", followers: 7650, price: 56.72, changePct: -5.8 },
  { date: "2026-02-27", symbol: "ARM", company: "Arm Holdings plc", exchange: "NASDAQ", followers: 22100, price: 164.00, changePct: 24.7 },
  { date: "2026-02-26", symbol: "KVYO", company: "Klaviyo Inc.", exchange: "NYSE", followers: 5430, price: 31.80, changePct: -8.9 },
  { date: "2026-02-25", symbol: "CAVA", company: "CAVA Group Inc.", exchange: "NYSE", followers: 16200, price: 48.72, changePct: 98.3 },
  { date: "2026-02-24", symbol: "LLY", company: "Lilly (Eli) & Co.", exchange: "NYSE", followers: 34500, price: 842.15, changePct: 5.2 },
  { date: "2026-02-21", symbol: "TOST", company: "Toast Inc.", exchange: "NYSE", followers: 4890, price: 27.40, changePct: -15.6 },
  { date: "2026-02-20", symbol: "ONON", company: "On Holding AG", exchange: "NYSE", followers: 9120, price: 34.28, changePct: 17.3 },
  { date: "2026-02-19", symbol: "KOKN", company: "Koken Holdings Inc.", exchange: "NASDAQ", followers: 2340, price: 18.50, changePct: 6.4 },
  { date: "2026-02-18", symbol: "MNDY", company: "monday.com Ltd.", exchange: "NASDAQ", followers: 7890, price: 182.60, changePct: -2.1 },
  { date: "2026-02-14", symbol: "IONQ", company: "IonQ Inc.", exchange: "NYSE", followers: 15600, price: 12.80, changePct: -22.4 },
  { date: "2026-02-13", symbol: "DUOL", company: "Duolingo Inc.", exchange: "NASDAQ", followers: 18200, price: 218.90, changePct: 36.5 },
  { date: "2026-02-12", symbol: "GLNG", company: "Golar LNG Limited", exchange: "NASDAQ", followers: 3210, price: 24.60, changePct: 1.8 },
  { date: "2026-02-11", symbol: "KRYS", company: "Krystal Biotech Inc.", exchange: "NASDAQ", followers: 4100, price: 156.30, changePct: 11.2 },
  { date: "2026-02-10", symbol: "VZIO", company: "VIZIO Holding Corp.", exchange: "NYSE", followers: 6540, price: 11.20, changePct: -7.3 },
  { date: "2026-02-07", symbol: "IREN", company: "Iris Energy Limited", exchange: "NASDAQ", followers: 8900, price: 8.42, changePct: -31.5 },
  { date: "2026-02-06", symbol: "CPNG", company: "Coupang Inc.", exchange: "NYSE", followers: 11200, price: 18.90, changePct: 14.6 },
  { date: "2026-02-05", symbol: "SOUN", company: "SoundHound AI Inc.", exchange: "NASDAQ", followers: 21400, price: 6.82, changePct: -18.9 },
  { date: "2026-02-04", symbol: "ASTS", company: "AST SpaceMobile Inc.", exchange: "NASDAQ", followers: 16800, price: 14.50, changePct: 45.2 },
  { date: "2026-02-03", symbol: "RXRX", company: "Recursion Pharmaceuticals", exchange: "NASDAQ", followers: 5670, price: 8.12, changePct: -9.4 },
  { date: "2026-01-31", symbol: "CLBT", company: "Cellebrite DI Ltd.", exchange: "NASDAQ", followers: 3890, price: 12.40, changePct: 7.8 },
  { date: "2026-01-30", symbol: "NUVB", company: "Nuvation Bio Inc.", exchange: "NYSE", followers: 2780, price: 4.68, changePct: -14.2 },
  { date: "2026-01-29", symbol: "SMR", company: "NuScale Power Corp.", exchange: "NYSE", followers: 19800, price: 10.90, changePct: 28.6 },
  { date: "2026-01-28", symbol: "FLNC", company: "Fluence Energy Inc.", exchange: "NASDAQ", followers: 7230, price: 22.50, changePct: -6.1 },
  { date: "2026-01-27", symbol: "JOBY", company: "Joby Aviation Inc.", exchange: "NYSE", followers: 14300, price: 6.24, changePct: -42.8 },
  { date: "2026-01-24", symbol: "APLS", company: "Apellis Pharmaceuticals", exchange: "NASDAQ", followers: 4560, price: 38.70, changePct: 3.2 },
  { date: "2026-01-23", symbol: "RKLB", company: "Rocket Lab USA Inc.", exchange: "NASDAQ", followers: 25600, price: 18.20, changePct: 62.4 },
  { date: "2026-01-22", symbol: "DNA", company: "Ginkgo Bioworks Holdings", exchange: "NYSE", followers: 8450, price: 1.84, changePct: -78.2 },
  { date: "2026-01-21", symbol: "PSNY", company: "Polestar Automotive", exchange: "NASDAQ", followers: 6120, price: 2.10, changePct: -55.6 },
  { date: "2026-01-17", symbol: "LUNR", company: "Intuitive Machines Inc.", exchange: "NASDAQ", followers: 13400, price: 7.80, changePct: 34.1 },
  { date: "2026-01-16", symbol: "GBTG", company: "Global Business Travel", exchange: "NYSE", followers: 2890, price: 7.42, changePct: -4.8 },
  { date: "2026-01-15", symbol: "VFS", company: "VinFast Auto Ltd.", exchange: "NASDAQ", followers: 9800, price: 4.62, changePct: -68.4 },
  { date: "2026-01-14", symbol: "TALK", company: "Talkspace Inc.", exchange: "NASDAQ", followers: 3450, price: 2.80, changePct: -24.1 },
  { date: "2026-01-13", symbol: "BRZE", company: "Braze Inc.", exchange: "NASDAQ", followers: 5670, price: 52.40, changePct: 8.6 },
  { date: "2026-01-10", symbol: "GTLB", company: "GitLab Inc.", exchange: "NASDAQ", followers: 12800, price: 62.80, changePct: 18.4 },
  { date: "2026-01-09", symbol: "CFLT", company: "Confluent Inc.", exchange: "NASDAQ", followers: 6780, price: 28.90, changePct: -11.2 },
  { date: "2026-01-08", symbol: "FROG", company: "JFrog Ltd.", exchange: "NASDAQ", followers: 4320, price: 34.50, changePct: 5.9 },
  { date: "2025-12-31", symbol: "PCVX", company: "Vaxcyte Inc.", exchange: "NASDAQ", followers: 7890, price: 72.30, changePct: 22.1 },
  { date: "2025-12-30", symbol: "NTRA", company: "Natera Inc.", exchange: "NASDAQ", followers: 11500, price: 88.40, changePct: 31.7 },
  { date: "2025-12-29", symbol: "ANET", company: "Arista Networks Inc.", exchange: "NYSE", followers: 18900, price: 248.60, changePct: 14.3 },
  { date: "2025-12-22", symbol: "CELH", company: "Celsius Holdings Inc.", exchange: "NASDAQ", followers: 22400, price: 52.80, changePct: -8.6 },
  { date: "2025-12-19", symbol: "RELY", company: "Remitly Global Inc.", exchange: "NASDAQ", followers: 3560, price: 22.40, changePct: -16.8 },
  { date: "2025-12-18", symbol: "KTOS", company: "Kratos Defense & Security", exchange: "NASDAQ", followers: 8900, price: 18.60, changePct: 9.4 },
  { date: "2025-12-17", symbol: "LAZR", company: "Luminar Technologies", exchange: "NASDAQ", followers: 14200, price: 3.40, changePct: -72.1 },
  { date: "2025-12-16", symbol: "ARQT", company: "Arcus Biosciences Inc.", exchange: "NYSE", followers: 2340, price: 22.10, changePct: 6.8 },
  { date: "2025-12-15", symbol: "ENVX", company: "Enovis Corporation", exchange: "NYSE", followers: 5670, price: 16.80, changePct: -21.4 },
];

const YEARS = ["All", "2026", "2025", "2024", "2023", "2022", "2021"];

/* ── Upcoming IPOs sidebar seed ─────────────────── */
const UPCOMING_IPOS = [
  { date: "Mar 14, 2026", company: "Nextera Robotics Inc.", symbol: "NXTR", exchange: "NASDAQ" },
  { date: "Mar 17, 2026", company: "Verdant Energy Corp.", symbol: "VRDN", exchange: "NYSE" },
  { date: "Mar 19, 2026", company: "Athena AI Holdings", symbol: "ATAI", exchange: "NASDAQ" },
  { date: "Mar 21, 2026", company: "Pulse Health Systems", symbol: "PLSH", exchange: "NYSE" },
  { date: "Mar 24, 2026", company: "Orbit Space Tech Ltd.", symbol: "ORBT", exchange: "NASDAQ" },
];

const IPO_NEWS = [
  { headline: "Nextera Robotics prices IPO at $22, above expected range", source: "Reuters", time: "2h ago" },
  { headline: "Record Q1 IPO pipeline signals market confidence", source: "Bloomberg", time: "5h ago" },
  { headline: "Verdant Energy postpones listing amid oil volatility", source: "CNBC", time: "8h ago" },
  { headline: "SPAC mergers decline 40% YoY as traditional IPOs surge", source: "WSJ", time: "12h ago" },
  { headline: "Athena AI sets terms for $1.2B IPO next week", source: "MarketWatch", time: "1d ago" },
];

/* ── Column helper ────────────────────────────── */
const columnHelper = createColumnHelper<RecentIpo>();

/* ── Component ────────────────────────────────── */
export function RecentIposPage() {
  const navigate = useNavigate();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [yearFilter, setYearFilter] = useState("All");

  const filteredData = useMemo(() => {
    if (yearFilter === "All") return SEED_DATA;
    return SEED_DATA.filter((d) => d.date.startsWith(yearFilter));
  }, [yearFilter]);

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
      cell: (info) => (
        <button
          onClick={() => navigate(`/stocks/${info.getValue().toLowerCase()}`)}
          className="font-semibold text-accent-blue hover:underline text-sm"
        >
          {info.getValue()}
        </button>
      ),
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
    columnHelper.accessor("followers", {
      header: "Followers",
      cell: (info) => (
        <span className="text-muted-foreground text-sm tabular-nums">
          {info.getValue().toLocaleString()}
        </span>
      ),
    }),
    columnHelper.accessor("price", {
      header: () => <span className="w-full text-right block">Price</span>,
      cell: (info) => (
        <span className="text-foreground text-sm tabular-nums text-right block">
          ${info.getValue().toFixed(2)}
        </span>
      ),
    }),
    columnHelper.accessor("changePct", {
      header: ({ column }) => (
        <button
          className="flex items-center gap-1 ml-auto text-right"
          onClick={() => column.toggleSorting()}
        >
          Change % <ArrowUpDown className="h-3 w-3" />
        </button>
      ),
      cell: (info) => {
        const val = info.getValue();
        const positive = val >= 0;
        return (
          <span className={cn("text-sm tabular-nums flex items-center justify-end gap-0.5", positive ? "text-green" : "text-red")}>
            {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {positive ? "+" : ""}{val.toFixed(1)}%
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
            <h1 className="text-[1.75rem] font-bold text-foreground mb-3">Last 200 IPOs</h1>

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

            {/* Table */}
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

            {/* Ad banner below table */}
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
                {UPCOMING_IPOS.map((ipo, i) => (
                  <div
                    key={ipo.symbol}
                    className={cn(
                      "py-2.5",
                      i < UPCOMING_IPOS.length - 1 && "border-b border-border-subtle"
                    )}
                  >
                    <div className="text-xs text-muted-foreground mb-0.5">{ipo.date}</div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground flex-1 truncate">{ipo.company}</span>
                      <button
                        onClick={() => navigate(`/stocks/${ipo.symbol.toLowerCase()}`)}
                        className="text-xs font-semibold text-accent-blue hover:underline"
                      >
                        {ipo.symbol}
                      </button>
                      <span className="text-[0.6875rem] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                        {ipo.exchange}
                      </span>
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
                {IPO_NEWS.map((news, i) => (
                  <div
                    key={i}
                    className={cn(
                      "py-2.5",
                      i < IPO_NEWS.length - 1 && "border-b border-border-subtle"
                    )}
                  >
                    <button className="text-sm text-accent-blue hover:underline text-left leading-snug">
                      {news.headline}
                    </button>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {news.source} · {news.time}
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

/* ── IPO Calendar Types & Data ──────────────────── */
interface CalendarIpo {
  ipoDate: string;
  symbol: string;
  company: string;
  exchange: string;
  priceRange: string;
  sharesOffered: number;
  dealSize: string;
  marketCap: string;
  revenue: string;
}

const THIS_WEEK_IPOS: CalendarIpo[] = [
  { ipoDate: "2026-03-12", symbol: "PAYP", company: "PayPay Corporation", exchange: "NASDAQ", priceRange: "$17.00 - $20.00", sharesOffered: 54987214, dealSize: "1.02B", marketCap: "12.37B", revenue: "2.33B" },
];

const calendarColumnHelper = createColumnHelper<CalendarIpo>();

const CALENDAR_SUB_TABS = ["Upcoming", "Filings", "Withdrawn"] as const;
const VIEW_TABS = ["Overview", "Financials", "Margins", "Profile"] as const;

interface FilingIpo {
  company: string;
  filedDate: string;
  amount: string;
  exchange: string;
}

const FILINGS_SEED: FilingIpo[] = [
  { company: "NovaGen Therapeutics", filedDate: "2026-03-10", amount: "$240M", exchange: "NASDAQ" },
  { company: "Aether Robotics Inc.", filedDate: "2026-03-08", amount: "$580M", exchange: "NYSE" },
  { company: "CloudSail Technologies", filedDate: "2026-03-05", amount: "$120M", exchange: "NASDAQ" },
  { company: "GreenPulse Energy", filedDate: "2026-02-28", amount: "$310M", exchange: "NYSE" },
  { company: "Meridian Data Systems", filedDate: "2026-02-25", amount: "$95M", exchange: "NASDAQ" },
  { company: "Orbis Financial Group", filedDate: "2026-02-20", amount: "$450M", exchange: "NYSE" },
];

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
      cell: (info) => (
        <button onClick={() => navigate(`/stocks/${info.getValue().toLowerCase()}`)} className="font-semibold text-accent-blue hover:underline text-sm">
          {info.getValue()}
        </button>
      ),
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
    calendarColumnHelper.accessor("sharesOffered", {
      header: () => <span className="text-right block">Shares Offered</span>,
      cell: (info) => <span className="text-foreground text-sm tabular-nums text-right block">{info.getValue().toLocaleString()}</span>,
    }),
    calendarColumnHelper.accessor("dealSize", {
      header: () => <span className="text-right block">Deal Size</span>,
      cell: (info) => <span className="text-foreground text-sm tabular-nums text-right block">{info.getValue()}</span>,
    }),
    calendarColumnHelper.accessor("marketCap", {
      header: () => <span className="text-right block">Market Cap</span>,
      cell: (info) => <span className="text-foreground text-sm tabular-nums text-right block">{info.getValue()}</span>,
    }),
    calendarColumnHelper.accessor("revenue", {
      header: () => <span className="text-right block">Revenue</span>,
      cell: (info) => <span className="text-foreground text-sm tabular-nums text-right block">{info.getValue()}</span>,
    }),
  ], [navigate]);

  const table = useReactTable({
    data: THIS_WEEK_IPOS,
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

        {/* This Week */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="text-[1.25rem] font-bold text-foreground">
              This Week · {THIS_WEEK_IPOS.length} IPO{THIS_WEEK_IPOS.length !== 1 ? "s" : ""}
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
        </div>

        {/* Next Week */}
        <div className="mb-8">
          <h2 className="text-[1.25rem] font-bold text-foreground mb-2">Next Week · 0 IPOs</h2>
          <p className="text-muted-foreground text-sm">There are no IPOs scheduled for next week.</p>
        </div>

        {/* After Next Week */}
        <div className="mb-8">
          <h2 className="text-[1.25rem] font-bold text-foreground mb-3">After Next Week</h2>
          <div className="border-l-4 border-accent-blue bg-accent-blue-light rounded-lg px-4 py-3 flex items-start gap-3">
            <Info className="h-5 w-5 text-accent-blue shrink-0 mt-0.5" />
            <p className="text-sm text-foreground leading-relaxed">
              No IPOs have been scheduled after next week. The reason is that IPO dates are rarely set more than 7–10 days in advance.{" "}
              <button onClick={() => navigate("/ipos/calendar?tab=filings")} className="text-accent-blue hover:underline font-medium">
                View unscheduled IPOs.
              </button>
            </p>
          </div>
        </div>

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
