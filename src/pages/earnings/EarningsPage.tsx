import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Search, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { tickerToSlug } from "@/lib/ticker-utils";
import { AdBanner } from "@/components/layout/AdBanner";
import { toast } from "sonner";
import { usePageSeo } from "@/hooks/usePageSeo";
import {
  earningsTimeLabel,
  selectEarningsForView,
  type EarningsTimeFilter,
  type EarningsViewMode,
} from "@/lib/earnings/earnings-calendar-present";
import { HOMEPAGE_CALENDAR_QUERY } from "@/config/homepage-v21";

function getWeekDates(refDate: Date): Date[] {
  const d = new Date(refDate);
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day === 0 ? 7 : day) - 1));
  return Array.from({ length: 5 }, (_, i) => {
    const dd = new Date(monday);
    dd.setDate(monday.getDate() + i);
    return dd;
  });
}

function fmtDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseIsoDate(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtDisplay(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtWeekday(d: Date) {
  return d.toLocaleDateString("en-US", { weekday: "long" });
}

function abbreviateNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

const EarningsPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<EarningsViewMode>("Daily");
  const [searchValue, setSearchValue] = useState("");
  const [timeFilter, setTimeFilter] = useState<EarningsTimeFilter>("All");

  useEffect(() => {
    const fromUrl = searchParams.get(HOMEPAGE_CALENDAR_QUERY.date);
    if (!fromUrl) return;
    const parsed = parseIsoDate(fromUrl);
    if (parsed) setSelectedDate(parsed);
  }, [searchParams]);

  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate.getTime()]);

  const weekStart = fmtDate(weekDates[0]);
  const weekEnd = fmtDate(weekDates[4]);

  const { data: weekEarnings, isLoading } = useQuery({
    queryKey: ["earnings-week", weekStart, weekEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("earnings_calendar")
        .select("*")
        .gte("report_date", weekStart)
        .lte("report_date", weekEnd)
        .order("report_date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const symbols = useMemo(() => (weekEarnings || []).map((e) => e.symbol), [weekEarnings]);
  const { data: stocksMap } = useQuery({
    queryKey: ["earnings-stocks", symbols.join(",")],
    queryFn: async () => {
      if (symbols.length === 0) return {};
      const { data } = await supabase
        .from("stocks")
        .select("symbol, market_cap, revenue")
        .in("symbol", symbols);
      const map: Record<string, { market_cap: number | null; revenue: number | null }> = {};
      (data || []).forEach((s) => {
        map[s.symbol] = { market_cap: s.market_cap, revenue: s.revenue };
      });
      return map;
    },
    enabled: symbols.length > 0,
  });

  const countByDate = useMemo(() => {
    const counts: Record<string, number> = {};
    (weekEarnings || []).forEach((e) => {
      counts[e.report_date] = (counts[e.report_date] || 0) + 1;
    });
    return counts;
  }, [weekEarnings]);

  const selectedDateStr = fmtDate(selectedDate);

  const displayedEarnings = useMemo(() => {
    const rows = selectEarningsForView(weekEarnings || [], {
      viewMode,
      selectedDateIso: selectedDateStr,
      timeFilter,
      searchValue,
    });
    rows.sort((a, b) => {
      if (viewMode === "Weekly" && a.report_date !== b.report_date) {
        return a.report_date.localeCompare(b.report_date);
      }
      const mcA = stocksMap?.[a.symbol]?.market_cap ?? 0;
      const mcB = stocksMap?.[b.symbol]?.market_cap ?? 0;
      return mcB - mcA;
    });
    return rows;
  }, [weekEarnings, viewMode, selectedDateStr, timeFilter, searchValue, stocksMap]);

  const shiftWeek = (dir: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + dir * 7);
    setSelectedDate(d);
  };

  const handleDownload = () => {
    const rows = displayedEarnings;
    if (!rows.length) {
      toast("No data to download");
      return;
    }
    const header = "Date,Symbol,Company Name,EPS Estimate,EPS Actual,Revenue Estimate,Revenue Actual,Time";
    const csvRows = rows.map((e) =>
      [
        e.report_date ?? "",
        e.symbol ?? "",
        `"${(e.company_name ?? "").replace(/"/g, '""')}"`,
        e.estimate_eps ?? "",
        e.actual_eps ?? "",
        "",
        "",
        e.time_of_day ?? "",
      ].join(","),
    );
    const csv = [header, ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `earnings_${viewMode === "Weekly" ? `${weekStart}_${weekEnd}` : selectedDateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Earnings data downloaded successfully.");
  };

  const dayCount = countByDate[selectedDateStr] || 0;
  const weekTotal = (weekEarnings || []).length;

  usePageSeo({
    title: "Earnings Calendar — Upcoming & Recent Reports | Stocksist",
    description:
      "Track upcoming and recent earnings reports, EPS estimates, and actual results for US stocks on Stocksist.",
  });

  return (
    <div className="min-w-0">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <h1 className="text-[1.375rem] font-bold text-foreground">Earnings Calendar</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Look up earnings"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                className="pl-8 h-9 w-44 text-sm"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  Time Of Day {timeFilter !== "All" ? `· ${timeFilter}` : ""}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {(["All", "Before Open", "After Close"] as const).map((t) => (
                  <DropdownMenuItem key={t} onClick={() => setTimeFilter(t)}>
                    {t}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="flex rounded-md border border-border overflow-hidden" role="group" aria-label="View mode">
              {(["Daily", "Weekly"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setViewMode(m)}
                  aria-pressed={viewMode === m}
                  className={cn(
                    "px-3 py-1.5 text-sm font-medium transition-colors",
                    viewMode === m
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-foreground hover:bg-muted",
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-stretch border border-border rounded-[var(--radius)] bg-surface mb-6 overflow-hidden">
          <button
            type="button"
            onClick={() => shiftWeek(-1)}
            className="px-3 flex items-center hover:bg-muted transition-colors border-r border-border"
          >
            <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          <div className="flex flex-1">
            {weekDates.map((d) => {
              const ds = fmtDate(d);
              const isActive = ds === selectedDateStr;
              const count = countByDate[ds] || 0;
              return (
                <button
                  key={ds}
                  type="button"
                  onClick={() => setSelectedDate(d)}
                  className={cn(
                    "flex-1 py-3 px-2 text-center transition-colors border-b-2",
                    isActive
                      ? "bg-accent-blue-light border-b-accent-blue"
                      : "border-b-transparent hover:bg-muted",
                  )}
                >
                  <div className="text-[0.8125rem] font-bold text-foreground">{fmtDisplay(d)}</div>
                  <div className="text-[0.75rem] text-muted-foreground">{fmtWeekday(d)}</div>
                  <div className="text-[0.75rem] text-muted-foreground">{count} Earnings</div>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => shiftWeek(1)}
            className="px-3 flex items-center hover:bg-muted transition-colors border-l border-border"
          >
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-foreground">
            {viewMode === "Daily" ? (
              <>
                {selectedDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {dayCount} Earnings
              </>
            ) : (
              <>
                Week of {fmtDisplay(weekDates[0])} – {fmtDisplay(weekDates[4])} · {weekTotal} Earnings
              </>
            )}
          </h2>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleDownload}>
              <Download className="h-3.5 w-3.5" /> Download
            </Button>
            <button
              type="button"
              onClick={() => navigate("/screener")}
              className="text-sm text-primary hover:underline"
            >
              Screener →
            </button>
          </div>
        </div>

        <div className="overflow-x-auto mb-8">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : displayedEarnings.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {viewMode === "Daily"
                ? "No earnings data for this date."
                : "No earnings data for this week."}
            </p>
          ) : (
            <table className="w-full text-sm border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b border-border">
                  {viewMode === "Weekly" ? (
                    <th className="text-left py-2 px-3 text-[0.8125rem] font-semibold text-muted-foreground">
                      Date
                    </th>
                  ) : null}
                  <th className="text-left py-2 px-3 text-[0.8125rem] font-semibold text-muted-foreground">Symbol</th>
                  <th className="text-left py-2 px-3 text-[0.8125rem] font-semibold text-muted-foreground">
                    Company Name
                  </th>
                  <th className="text-left py-2 px-3 text-[0.8125rem] font-semibold text-muted-foreground">
                    Earnings Time
                  </th>
                  <th className="text-right py-2 px-3 text-[0.8125rem] font-semibold text-muted-foreground">
                    Market Cap
                  </th>
                  <th className="text-right py-2 px-3 text-[0.8125rem] font-semibold text-muted-foreground">
                    Revenue Estimate
                  </th>
                  <th className="text-right py-2 px-3 text-[0.8125rem] font-semibold text-muted-foreground">
                    EPS Estimate
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayedEarnings.map((e) => {
                  const stock = stocksMap?.[e.symbol];
                  const timeLabel = earningsTimeLabel(e.time_of_day);
                  const isAfterClose = e.time_of_day === "after_close";
                  const isBeforeOpen = e.time_of_day === "before_open";
                  return (
                    <tr key={e.id} className="border-b border-border hover:bg-surface transition-colors">
                      {viewMode === "Weekly" ? (
                        <td className="py-2 px-3 text-[0.8125rem] text-muted-foreground whitespace-nowrap">
                          {e.report_date}
                        </td>
                      ) : null}
                      <td className="py-2 px-3">
                        <button
                          type="button"
                          onClick={() => navigate(`/stocks/${tickerToSlug(e.symbol)}`)}
                          className="text-primary font-semibold hover:underline text-[0.875rem]"
                        >
                          {e.symbol}
                        </button>
                      </td>
                      <td className="py-2 px-3 text-[0.875rem] text-foreground">{e.company_name}</td>
                      <td className="py-2 px-3">
                        <span
                          className={cn(
                            "inline-block text-[0.75rem] px-1.5 py-0.5 rounded font-medium",
                            isAfterClose && "bg-green-bg text-green",
                            isBeforeOpen && "bg-accent-blue-light text-accent-blue",
                            !isAfterClose && !isBeforeOpen && "bg-muted text-muted-foreground",
                          )}
                        >
                          {timeLabel}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right text-[0.875rem] tabular-nums">
                        {abbreviateNumber(stock?.market_cap)}
                      </td>
                      <td className="py-2 px-3 text-right text-[0.875rem] tabular-nums text-muted-foreground">
                        {stock?.revenue != null ? abbreviateNumber(stock.revenue) : "—"}
                      </td>
                      <td className="py-2 px-3 text-right text-[0.875rem] tabular-nums">
                        {e.estimate_eps != null ? e.estimate_eps.toFixed(2) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="w-full flex flex-col items-center border-t border-border bg-surface py-1 mt-8">
        <AdBanner slot="bottom" />
      </div>
    </div>
  );
};

export default EarningsPage;