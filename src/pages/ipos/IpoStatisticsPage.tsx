import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { IpoTabBar } from "@/components/ipos/IpoTabBar";
import { AdBanner } from "@/components/layout/AdBanner";
import { cn } from "@/lib/utils";
import {
  Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator, BreadcrumbPage,
} from "@/components/ui/breadcrumb";

/* ── Historical annual data (reference/static) ─── */
const ANNUAL_DATA = [
  { year: 2000, count: 406 }, { year: 2001, count: 79 }, { year: 2002, count: 66 }, { year: 2003, count: 68 },
  { year: 2004, count: 233 }, { year: 2005, count: 194 }, { year: 2006, count: 198 }, { year: 2007, count: 213 },
  { year: 2008, count: 62 }, { year: 2009, count: 63 }, { year: 2010, count: 154 }, { year: 2011, count: 125 },
  { year: 2012, count: 128 }, { year: 2013, count: 222 }, { year: 2014, count: 275 }, { year: 2015, count: 170 },
  { year: 2016, count: 105 }, { year: 2017, count: 174 }, { year: 2018, count: 192 }, { year: 2019, count: 232 },
  { year: 2020, count: 486 }, { year: 2021, count: 1035 }, { year: 2022, count: 181 }, { year: 2023, count: 154 },
  { year: 2024, count: 223 }, { year: 2025, count: 247 }, { year: 2026, count: 38 },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface YearlyBreakdown { year: number; total: number; months: number[]; best: string; bestCount: number; worst: string; worstCount: number; }

const YEARLY: YearlyBreakdown[] = [
  { year: 2025, total: 247, months: [22, 19, 24, 18, 28, 21, 37, 20, 16, 23, 18, 21], best: "July", bestCount: 37, worst: "November", worstCount: 18 },
  { year: 2024, total: 223, months: [15, 20, 11, 21, 22, 17, 24, 19, 16, 34, 14, 30], best: "October", bestCount: 34, worst: "March", worstCount: 11 },
  { year: 2023, total: 154, months: [11, 8, 19, 14, 15, 16, 18, 12, 10, 13, 11, 7], best: "March", bestCount: 19, worst: "December", worstCount: 7 },
  { year: 2022, total: 181, months: [34, 16, 18, 14, 12, 11, 17, 13, 10, 11, 9, 16], best: "January", bestCount: 34, worst: "November", worstCount: 9 },
  { year: 2021, total: 1035, months: [117, 107, 151, 67, 76, 69, 97, 101, 68, 87, 53, 42], best: "March", bestCount: 151, worst: "August", worstCount: 42 },
  { year: 2020, total: 486, months: [22, 18, 5, 12, 28, 36, 44, 42, 56, 67, 45, 41], best: "October", bestCount: 67, worst: "March", worstCount: 5 },
  { year: 2019, total: 232, months: [10, 15, 32, 22, 32, 28, 32, 17, 24, 27, 15, 10], best: "May and July", bestCount: 32, worst: "January", worstCount: 10 },
];

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/* ── Component ─────────────────────────────────── */
export default function IpoStatisticsPage() {
  const navigate = useNavigate();

  const { data: latestIpos } = useQuery({
    queryKey: ["ipo-latest-sidebar"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ipo_list")
        .select("*")
        .eq("status", "recent")
        .order("ipo_date", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
  });

  const { data: ipoNews } = useQuery({
    queryKey: ["ipo-news-stats-sidebar"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_news")
        .select("*")
        .eq("category", "ipo")
        .order("published_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });

  const totalIpos = ANNUAL_DATA.reduce((s, d) => s + d.count, 0);

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
            <BreadcrumbItem><BreadcrumbPage>Statistics</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <h1 className="text-[1.75rem] font-bold text-foreground mb-2">IPO Statistics</h1>
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed max-w-3xl">
          This page contains statistics and charts for initial public offerings (IPOs) on the US stock market. Annual data is available from 2000–2026 and monthly data since 2019.
        </p>

        <div className="flex flex-col md:flex-row gap-6">
          {/* Main */}
          <div className="flex-1 min-w-0">
            <h2 className="text-[1.125rem] font-bold text-foreground mb-2">Number of IPOs by Year</h2>
            <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
              There have been {totalIpos.toLocaleString()} IPOs between 2000 and 2026. The best was in 2021 with 1,035 IPOs. The worst was in 2008 with only 62. The full year 2021 was an all-time record, beating the previous record of 486 in the year 2020.
            </p>

            <h3 className="text-sm font-semibold text-center text-foreground mb-2">Annual IPOs, 2000–2026</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={ANNUAL_DATA} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border-subtle))" vertical={false} />
                <XAxis dataKey="year" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--surface-card))", border: "1px solid hsl(var(--border))", borderRadius: "var(--radius)", fontSize: 13 }}
                  labelFormatter={(v) => `Year ${v}`}
                  formatter={(v: number) => [v, "IPOs"]}
                />
                <Bar dataKey="count" fill="hsl(var(--accent-blue))" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>

            {YEARLY.map((yd) => {
              const monthlyData = MONTHS.map((m, i) => ({ month: m, count: yd.months[i] ?? 0 }));
              return (
                <div key={yd.year} className="mt-10">
                  <h2 className="text-[1.125rem] font-bold text-foreground mb-1">{yd.year} Initial Public Offerings</h2>
                  <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                    There were {yd.total} IPOs in {yd.year}. The most was in {yd.best} with {yd.bestCount}, the least was in {yd.worst} with {yd.worstCount}.{" "}
                    <button onClick={() => navigate(`/ipos/recent?year=${yd.year}`)} className="text-accent-blue hover:underline font-medium">
                      View all {yd.year} IPOs.
                    </button>
                  </p>

                  <h3 className="text-sm font-semibold text-center text-foreground mb-2">{yd.year} IPOs</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={monthlyData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border-subtle))" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={30} />
                      <Tooltip
                        contentStyle={{ background: "hsl(var(--surface-card))", border: "1px solid hsl(var(--border))", borderRadius: "var(--radius)", fontSize: 13 }}
                        formatter={(v: number) => [v, "IPOs"]}
                      />
                      <Bar dataKey="count" fill="hsl(var(--accent-blue))" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              );
            })}
          </div>

          {/* Sidebar */}
          <aside className="w-full md:w-[300px] shrink-0 space-y-4">
            {/* Latest IPOs */}
            <div className="border border-border rounded-lg p-4">
              <h2 className="text-base font-bold text-foreground mb-3">Latest IPOs</h2>
              {(latestIpos ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No recent IPO data.</p>
              ) : (latestIpos ?? []).map((ipo, i) => (
                <div key={ipo.id} className={cn("py-2.5", i < (latestIpos?.length ?? 0) - 1 && "border-b border-border-subtle")}>
                  <div className="text-xs text-muted-foreground">
                    {new Date(ipo.ipo_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {ipo.symbol && (
                      <button onClick={() => navigate(`/stocks/${ipo.symbol!.toLowerCase()}`)} className="text-sm font-semibold text-accent-blue hover:underline">
                        {ipo.symbol}
                      </button>
                    )}
                    <span className="text-sm text-foreground truncate">{ipo.name}</span>
                  </div>
                </div>
              ))}
              <button
                onClick={() => navigate("/ipos/recent")}
                className="mt-3 w-full text-center text-sm font-medium text-accent-blue border border-accent-blue rounded-lg py-2 hover:bg-accent-blue-light transition-colors"
              >
                All Recent IPOs
              </button>
            </div>

            {/* Ad */}
            <div className="border border-border rounded-lg overflow-hidden" style={{ minHeight: 250 }}>
              <AdBanner />
            </div>

            {/* IPO News */}
            <div className="border border-border rounded-lg p-4">
              <h2 className="text-base font-bold text-foreground mb-3">IPO News</h2>
              {(ipoNews ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No IPO news available.</p>
              ) : (ipoNews ?? []).map((news, i) => (
                <div key={news.id} className={cn("py-2.5", i < (ipoNews?.length ?? 0) - 1 && "border-b border-border-subtle")}>
                  <div className="text-xs text-muted-foreground mb-0.5">
                    {news.published_at ? timeAgo(news.published_at) : ""}
                  </div>
                  <a
                    href={news.url ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-accent-blue hover:underline text-left leading-snug"
                  >
                    {news.headline}
                  </a>
                </div>
              ))}
              <button onClick={() => navigate("/ipos/news")} className="mt-3 text-sm font-medium text-accent-blue hover:underline">
                More IPO News →
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
