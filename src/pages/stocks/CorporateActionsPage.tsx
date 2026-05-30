import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator, BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";
import { tickerToSlug } from "@/lib/ticker-utils";
import { AdBanner } from "@/components/layout/AdBanner";

type ActionType = "Dividend" | "Split" | "Merger" | "Spinoff";

interface CorporateAction {
  date: string;
  symbol: string;
  name: string;
  type: ActionType;
  details: string;
}

const BADGE_STYLES: Record<ActionType, string> = {
  Dividend: "bg-green-bg text-green",
  Split: "bg-accent-blue-light text-accent-blue",
  Merger: "bg-[#fef3c7] text-[#d97706]",
  Spinoff: "bg-[#fdf4ff] text-[#9333ea]",
};

const FALLBACK_ACTIONS: CorporateAction[] = [
  { date: "2026-03-10", symbol: "AAPL", name: "Apple Inc.", type: "Dividend", details: "$0.25 per share, ex-date Mar 10" },
  { date: "2026-03-10", symbol: "MSFT", name: "Microsoft Corporation", type: "Dividend", details: "$0.75 per share, ex-date Mar 10" },
  { date: "2026-03-09", symbol: "GOOGL", name: "Alphabet Inc.", type: "Dividend", details: "$0.20 per share, ex-date Mar 9" },
];

function mapDividends(raw: any[]): CorporateAction[] {
  return raw.map((d) => ({
    date: d.ex_dividend_date ?? d.pay_date ?? "",
    symbol: d.ticker ?? "",
    name: d.ticker ?? "",
    type: "Dividend" as ActionType,
    details: `$${Number(d.cash_amount ?? 0).toFixed(4)} per share${d.frequency ? `, ${d.frequency === 1 ? "annual" : d.frequency === 2 ? "semi-annual" : d.frequency === 4 ? "quarterly" : d.frequency === 12 ? "monthly" : ""} payout` : ""}`,
  }));
}

function mapSplits(raw: any[]): CorporateAction[] {
  return raw.map((s) => ({
    date: s.execution_date ?? "",
    symbol: s.ticker ?? "",
    name: s.ticker ?? "",
    type: "Split" as ActionType,
    details: `${s.split_to ?? 1}-for-${s.split_from ?? 1} stock split`,
  }));
}

const PAGE_SIZE = 25;

export default function CorporateActionsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(0);

  const { data: dividends, isLoading: loadingDiv } = useQuery({
    queryKey: ["corporate-actions-dividends"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("get-corporate-actions", {
        body: { type: "dividends" },
      });
      if (error || !Array.isArray(data)) return [];
      return mapDividends(data);
    },
    staleTime: 0,
    retry: 2,
  });

  const { data: splits, isLoading: loadingSplits } = useQuery({
    queryKey: ["corporate-actions-splits"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("get-corporate-actions", {
        body: { type: "splits" },
      });
      if (error || !Array.isArray(data)) return [];
      return mapSplits(data);
    },
    staleTime: 0,
    retry: 2,
  });

  const isLoading = loadingDiv || loadingSplits;

  const actions: CorporateAction[] = useMemo(() => {
    const divs = dividends ?? [];
    const spls = splits ?? [];
    const combined = [...divs, ...spls];
    if (combined.length === 0) return FALLBACK_ACTIONS;
    return combined.sort((a, b) => b.date.localeCompare(a.date));
  }, [dividends, splits]);

  const totalPages = Math.ceil(actions.length / PAGE_SIZE);
  const pageData = actions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const stats = useMemo(() => [
    { label: "Dividends", count: actions.filter((a) => a.type === "Dividend").length },
    { label: "Stock Splits", count: actions.filter((a) => a.type === "Split").length },
    { label: "Mergers & Acquisitions", count: actions.filter((a) => a.type === "Merger").length },
    { label: "Spinoffs", count: actions.filter((a) => a.type === "Spinoff").length },
  ], [actions]);

  return (
    <div className="min-w-0">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <Breadcrumb className="mb-4">
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink href="/" className="text-[0.8125rem]">Home</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage className="text-[0.8125rem]">Actions</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <h1 className="text-[1.375rem] font-bold text-foreground mb-6">Corporate Actions</h1>

        <div className="flex flex-col md:flex-row gap-8">
          {/* Main table */}
          <div className="flex-1 min-w-0">
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 10 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded" />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse min-w-[600px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 text-[0.8125rem] font-semibold text-muted-foreground">Date</th>
                      <th className="text-left py-2 px-3 text-[0.8125rem] font-semibold text-muted-foreground">Symbol</th>
                      <th className="text-left py-2 px-3 text-[0.8125rem] font-semibold text-muted-foreground">Company Name</th>
                      <th className="text-left py-2 px-3 text-[0.8125rem] font-semibold text-muted-foreground">Action Type</th>
                      <th className="text-left py-2 px-3 text-[0.8125rem] font-semibold text-muted-foreground">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageData.map((a, i) => (
                      <tr key={`${a.symbol}-${a.date}-${i}`} className="border-b border-border-subtle hover:bg-surface transition-colors">
                        <td className="py-2 px-3 text-[0.875rem] text-muted-foreground tabular-nums whitespace-nowrap">{a.date}</td>
                        <td className="py-2 px-3">
                          <button onClick={() => navigate(`/stocks/${tickerToSlug(a.symbol)}`)} className="text-primary font-semibold hover:underline text-[0.875rem]">{a.symbol}</button>
                        </td>
                        <td className="py-2 px-3 text-[0.875rem] text-foreground">{a.name}</td>
                        <td className="py-2 px-3">
                          <span className={cn("inline-block text-[0.75rem] px-1.5 py-0.5 rounded font-medium", BADGE_STYLES[a.type])}>{a.type}</span>
                        </td>
                        <td className="py-2 px-3 text-[0.875rem] text-muted-foreground">{a.details}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {!isLoading && totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 py-4">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>← Previous</Button>
                <span className="text-sm text-muted-foreground">Page {page + 1} of {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next →</Button>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="w-full md:w-[280px] md:flex-shrink-0 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {stats.map((s) => (
                <div key={s.label} className="border border-border rounded-[var(--radius)] p-3 text-center">
                  <div className="text-xl font-bold text-foreground tabular-nums">{s.count}</div>
                  <div className="text-[0.75rem] text-muted-foreground leading-tight">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="border border-border rounded-[var(--radius)] overflow-hidden" style={{ minHeight: 250 }}>
              <AdBanner />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
