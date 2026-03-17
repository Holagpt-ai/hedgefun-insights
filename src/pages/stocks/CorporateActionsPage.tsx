import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
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

const ACTIONS: CorporateAction[] = [
  { date: "2026-03-10", symbol: "AAPL", name: "Apple Inc.", type: "Dividend", details: "$0.25 per share, ex-date Mar 10" },
  { date: "2026-03-10", symbol: "MSFT", name: "Microsoft Corporation", type: "Dividend", details: "$0.75 per share, ex-date Mar 10" },
  { date: "2026-03-10", symbol: "NVDA", name: "NVIDIA Corporation", type: "Split", details: "10-for-1 stock split effective Mar 10" },
  { date: "2026-03-09", symbol: "GOOGL", name: "Alphabet Inc.", type: "Dividend", details: "$0.20 per share, ex-date Mar 9" },
  { date: "2026-03-09", symbol: "AMZN", name: "Amazon.com, Inc.", type: "Merger", details: "Acquisition of Zoox Inc. completed" },
  { date: "2026-03-09", symbol: "JPM", name: "JPMorgan Chase & Co.", type: "Dividend", details: "$1.15 per share, ex-date Mar 9" },
  { date: "2026-03-08", symbol: "GE", name: "General Electric Co.", type: "Spinoff", details: "GE Vernova spinoff completed" },
  { date: "2026-03-08", symbol: "JNJ", name: "Johnson & Johnson", type: "Dividend", details: "$1.24 per share, ex-date Mar 8" },
  { date: "2026-03-08", symbol: "V", name: "Visa Inc.", type: "Dividend", details: "$0.52 per share, ex-date Mar 8" },
  { date: "2026-03-07", symbol: "TSLA", name: "Tesla, Inc.", type: "Split", details: "3-for-1 stock split effective Mar 7" },
  { date: "2026-03-07", symbol: "WMT", name: "Walmart Inc.", type: "Dividend", details: "$0.2075 per share, ex-date Mar 7" },
  { date: "2026-03-07", symbol: "PG", name: "Procter & Gamble Co.", type: "Dividend", details: "$1.0065 per share, ex-date Mar 7" },
  { date: "2026-03-06", symbol: "MA", name: "Mastercard Inc.", type: "Dividend", details: "$0.66 per share, ex-date Mar 6" },
  { date: "2026-03-06", symbol: "HD", name: "The Home Depot, Inc.", type: "Dividend", details: "$2.25 per share, ex-date Mar 6" },
  { date: "2026-03-06", symbol: "KO", name: "The Coca-Cola Company", type: "Dividend", details: "$0.485 per share, ex-date Mar 6" },
  { date: "2026-03-05", symbol: "PEP", name: "PepsiCo, Inc.", type: "Dividend", details: "$1.355 per share, ex-date Mar 5" },
  { date: "2026-03-05", symbol: "AVGO", name: "Broadcom Inc.", type: "Merger", details: "Acquisition of VMware completed" },
  { date: "2026-03-05", symbol: "MRK", name: "Merck & Co., Inc.", type: "Dividend", details: "$0.77 per share, ex-date Mar 5" },
  { date: "2026-03-04", symbol: "XOM", name: "Exxon Mobil Corporation", type: "Dividend", details: "$0.95 per share, ex-date Mar 4" },
  { date: "2026-03-04", symbol: "CVX", name: "Chevron Corporation", type: "Dividend", details: "$1.63 per share, ex-date Mar 4" },
  { date: "2026-03-04", symbol: "ABT", name: "Abbott Laboratories", type: "Dividend", details: "$0.55 per share, ex-date Mar 4" },
  { date: "2026-03-03", symbol: "MMM", name: "3M Company", type: "Spinoff", details: "Solventum Corporation spinoff completed" },
  { date: "2026-03-03", symbol: "CRM", name: "Salesforce, Inc.", type: "Dividend", details: "$0.40 per share, ex-date Mar 3" },
  { date: "2026-03-03", symbol: "DIS", name: "The Walt Disney Company", type: "Dividend", details: "$0.45 per share, ex-date Mar 3" },
  { date: "2026-03-02", symbol: "INTC", name: "Intel Corporation", type: "Split", details: "2-for-1 stock split effective Mar 2" },
  { date: "2026-03-02", symbol: "BAC", name: "Bank of America Corp.", type: "Dividend", details: "$0.24 per share, ex-date Mar 2" },
  { date: "2026-03-02", symbol: "CSCO", name: "Cisco Systems, Inc.", type: "Dividend", details: "$0.40 per share, ex-date Mar 2" },
  { date: "2026-03-01", symbol: "NFLX", name: "Netflix, Inc.", type: "Merger", details: "Acquisition of Spry Fox completed" },
  { date: "2026-03-01", symbol: "UNH", name: "UnitedHealth Group", type: "Dividend", details: "$1.88 per share, ex-date Mar 1" },
  { date: "2026-03-01", symbol: "LLY", name: "Eli Lilly and Company", type: "Dividend", details: "$1.30 per share, ex-date Mar 1" },
  { date: "2026-02-28", symbol: "AMD", name: "Advanced Micro Devices", type: "Merger", details: "Acquisition of Xilinx integration complete" },
  { date: "2026-02-28", symbol: "T", name: "AT&T Inc.", type: "Dividend", details: "$0.2775 per share, ex-date Feb 28" },
];

const PAGE_SIZE = 25;

const STATS = [
  { label: "Dividends This Week", count: ACTIONS.filter((a) => a.type === "Dividend").length },
  { label: "Stock Splits", count: ACTIONS.filter((a) => a.type === "Split").length },
  { label: "Mergers & Acquisitions", count: ACTIONS.filter((a) => a.type === "Merger").length },
  { label: "Spinoffs", count: ACTIONS.filter((a) => a.type === "Spinoff").length },
];

export default function CorporateActionsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(ACTIONS.length / PAGE_SIZE);
  const pageData = ACTIONS.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

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

            {/* Pagination */}
            <div className="flex items-center justify-center gap-4 py-4">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>← Previous</Button>
              <span className="text-sm text-muted-foreground">Page {page + 1} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next →</Button>
            </div>
          </div>

          {/* Sidebar */}
          <div className="w-full md:w-[280px] md:flex-shrink-0 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {STATS.map((s) => (
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

      <Footer />
    </div>
  );
}
