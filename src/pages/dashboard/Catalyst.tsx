import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Radar, Calendar, FlaskConical, Layers, Shield, TrendingUp, AlertTriangle,
  Clock, Bell, LineChart, FileSearch, Sparkles, ArrowUpRight, Filter,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Priority = "High" | "Medium" | "Low";
type Status = "Watch" | "Review" | "Act";
type Sentiment = "Positive" | "Negative" | "Neutral";

interface CatalystEntry {
  symbol: string;
  name: string;
  type: string;
  headline: string;
  signal: string;
  note: string;
  priority: Priority;
  status: Status;
  sentiment: Sentiment;
  window: string;
  impact: string;
}

const CATALYSTS: CatalystEntry[] = [
  { symbol: "NVDA", name: "NVIDIA Corp.",             type: "Earnings",           headline: "Q4 earnings — Thu AMC", signal: "Post-report momentum watch",          note: "Options market pricing ±7.4% move. Semis basket beta elevated into print.", priority: "High",   status: "Act",    sentiment: "Positive", window: "This week",  impact: "High" },
  { symbol: "PLTR", name: "Palantir",                 type: "Earnings",           headline: "Continuation setup active",      signal: "Post-earnings follow-through",       note: "Institutional accumulation continues; watch for close above prior high on volume.", priority: "High",   status: "Review", sentiment: "Positive", window: "Active",     impact: "High" },
  { symbol: "SMCI", name: "Super Micro",              type: "Technical",          headline: "Breakout confirmation window",   signal: "Needs volume confirmation",          note: "Level to reclaim identified; wait for participation before sizing up.", priority: "Medium", status: "Watch",  sentiment: "Neutral",  window: "48h",        impact: "Medium" },
  { symbol: "IOVA", name: "Iovance Biotherapeutics",  type: "FDA / Biotech",      headline: "PDUFA window approaching",       signal: "Binary event risk elevated",         note: "Size conservatively around catalyst; consider defined-risk structure.", priority: "High",   status: "Review", sentiment: "Neutral",  window: "2 weeks",    impact: "High" },
  { symbol: "MSTR", name: "MicroStrategy",            type: "Crypto Correlation", headline: "BTC beta risk in play",          signal: "Correlation-driven pressure",        note: "Weakness in BTC may pressure related equity; monitor cross-asset flows.", priority: "Medium", status: "Watch",  sentiment: "Negative", window: "Rolling",    impact: "Medium" },
  { symbol: "RIVN", name: "Rivian",                   type: "Short Interest",     headline: "High SI volatility watch",       signal: "Squeeze conditions building",        note: "Elevated short interest; volatility can expand on volume confirmation.", priority: "Medium", status: "Watch",  sentiment: "Neutral",  window: "This week",  impact: "Medium" },
  { symbol: "QQQ",  name: "Invesco QQQ Trust",        type: "Index / Flow",       headline: "Rebalance flow sensitivity",     signal: "Large-cap tech flow risk",           note: "Index rebalance may impact watchlist names into close on Friday.", priority: "Low",    status: "Watch",  sentiment: "Neutral",  window: "Into close", impact: "Low" },
];

const SUMMARY = [
  { label: "Earnings Watch",         count: 12, icon: Calendar,     tone: "text-accent-blue",   bg: "bg-accent-blue-light" },
  { label: "FDA / Biotech",          count: 4,  icon: FlaskConical, tone: "text-emerald-600",   bg: "bg-emerald-50 dark:bg-emerald-950/30" },
  { label: "Index & Rebalance",      count: 3,  icon: Layers,       tone: "text-amber-600",     bg: "bg-amber-50 dark:bg-amber-950/30" },
  { label: "SEC / Insider Signals",  count: 7,  icon: Shield,       tone: "text-rose-600",      bg: "bg-rose-50 dark:bg-rose-950/30" },
];

const RISK_WINDOWS = [
  { when: "Tue 8:30 ET",  event: "CPI Print",              impact: "High",   note: "Rate-sensitive names at risk; growth beta elevated." },
  { when: "Wed 2:00 ET",  event: "FOMC Minutes",           impact: "High",   note: "Watch curve reaction; tech and financials most reactive." },
  { when: "Thu AMC",      event: "NVDA Earnings",          impact: "High",   note: "Sets tone for semis and AI-adjacent basket." },
  { when: "Fri 10:00 ET", event: "Michigan Sentiment",     impact: "Medium", note: "Consumer discretionary reactive to inflation expectations." },
];

const FILTERS = ["All", "Earnings", "FDA / Biotech", "Technical", "Index / Flow"] as const;

const priorityStyle: Record<Priority, string> = {
  High:   "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900",
  Medium: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
  Low:    "bg-muted text-muted-foreground border-border",
};

const statusStyle: Record<Status, string> = {
  Act:    "bg-emerald-600 text-white",
  Review: "bg-accent-blue text-primary-foreground",
  Watch:  "bg-muted text-foreground",
};

const sentimentStyle: Record<Sentiment, string> = {
  Positive: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  Negative: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900",
  Neutral:  "bg-muted text-muted-foreground border-border",
};

export default function Catalyst() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");

  const filtered = filter === "All"
    ? CATALYSTS
    : CATALYSTS.filter((c) => c.type === filter);

  const onReview = (c: CatalystEntry) =>
    toast({ title: `Review · ${c.symbol}`, description: c.signal });
  const onAlert = (c: CatalystEntry) =>
    toast({ title: `Alert set · ${c.symbol}`, description: `We'll notify you on ${c.window.toLowerCase()} activity.` });
  const onChart = (c: CatalystEntry) => navigate(`/stocks/${c.symbol.toLowerCase()}`);

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-accent-blue-light flex items-center justify-center">
              <Radar className="h-4 w-4 text-accent-blue" aria-hidden />
            </div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Catalyst — Mission Brief</h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Institutional-grade catalyst desk. Track market-moving events, risk windows, and tradeable setups before they hit your watchlist.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-border bg-surface-card">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live · Updated hourly
          </span>
        </div>
      </header>

      {/* Summary cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {SUMMARY.map((s) => (
          <Card key={s.label} className="border-border hover:shadow-sm transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{s.label}</span>
                <div className={cn("h-7 w-7 rounded-md flex items-center justify-center", s.bg)}>
                  <s.icon className={cn("h-3.5 w-3.5", s.tone)} aria-hidden />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <div className="text-2xl font-semibold tabular-nums">{s.count}</div>
                <span className="text-[11px] text-muted-foreground">active</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* Main grid */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Mission Brief */}
        <Card className="lg:col-span-2 border-border">
          <CardHeader className="pb-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-accent-blue" aria-hidden />
                <CardTitle className="text-base font-semibold">Mission Brief</CardTitle>
                <Badge variant="outline" className="text-[10px]">{filtered.length}</Badge>
              </div>
              <div className="hidden md:flex items-center gap-1 text-[11px] text-muted-foreground">
                <Filter className="h-3 w-3" aria-hidden /> Filter
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "text-[11px] px-2.5 py-1 rounded-full border transition-colors",
                    filter === f
                      ? "bg-accent-blue text-primary-foreground border-accent-blue"
                      : "bg-surface-card text-muted-foreground border-border hover:bg-muted/50",
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {filtered.map((c) => (
              <div
                key={c.symbol}
                className="rounded-lg border border-border p-3 md:p-4 hover:border-accent-blue/40 hover:shadow-sm transition-all bg-surface-card"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="h-9 w-9 rounded-md bg-accent-blue-light flex items-center justify-center shrink-0">
                      <span className="text-[11px] font-bold text-accent-blue">{c.symbol.slice(0, 3)}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{c.symbol}</span>
                        <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded border", sentimentStyle[c.sentiment])}>
                          {c.sentiment}
                        </span>
                        <Badge variant="secondary" className="text-[10px]">{c.type}</Badge>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground truncate">{c.name} · {c.headline}</div>
                      <div className="mt-1.5 text-sm font-medium">{c.signal}</div>
                      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{c.note}</p>
                      <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                        <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" aria-hidden /> {c.window}</span>
                        <span>· Impact: {c.impact}</span>
                        <span className={cn("ml-auto text-[10px] font-semibold px-2 py-0.5 rounded border", priorityStyle[c.priority])}>
                          {c.priority} priority
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-border flex items-center gap-1.5 flex-wrap">
                  <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded mr-auto", statusStyle[c.status])}>
                    {c.status}
                  </span>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => onReview(c)}>
                    <FileSearch className="h-3 w-3" /> Review
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => onAlert(c)}>
                    <Bell className="h-3 w-3" /> Alert
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => onChart(c)}>
                    <LineChart className="h-3 w-3" /> Chart
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Right column */}
        <div className="space-y-4 md:space-y-6">
          {/* Catalyst Radar */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Radar className="h-4 w-4 text-accent-blue" aria-hidden />
                  <CardTitle className="text-base font-semibold">Catalyst Radar</CardTitle>
                </div>
                <Badge variant="outline" className="text-[10px]">Top 5</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {CATALYSTS.slice(0, 5).map((c, i) => (
                <div key={c.symbol} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-mono text-muted-foreground tabular-nums w-4">{i + 1}</span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">{c.symbol}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{c.type}</div>
                    </div>
                  </div>
                  <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded border shrink-0", priorityStyle[c.priority])}>
                    {c.priority}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* AI Catalyst Summary */}
          <Card className="border-border bg-gradient-to-br from-accent-blue-light/60 to-transparent">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-md bg-accent-blue flex items-center justify-center">
                  <Sparkles className="h-3.5 w-3.5 text-primary-foreground" aria-hidden />
                </div>
                <CardTitle className="text-base font-semibold">AI Catalyst Outlook</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs leading-relaxed text-foreground">
                <span className="font-semibold">Setup:</span> Semis and AI-adjacent names carry event risk into <span className="font-medium">NVDA</span> Thursday AMC. CPI Tuesday sets rate-sensitive tone; a hot print pressures growth beta.
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground">Positioning:</span> Prefer defined-risk exposure around binary events (IOVA PDUFA, NVDA print). Trim size in high short-interest names (RIVN) until volume confirms direction.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="w-full h-8 text-xs gap-1.5"
                onClick={() => navigate("/dashboard/ai")}
              >
                Ask AI Analyst <ArrowUpRight className="h-3 w-3" />
              </Button>
              <p className="text-[10px] text-muted-foreground text-center">
                Educational only · not investment advice
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Risk windows */}
      <section>
        <Card className="border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />
                <CardTitle className="text-base font-semibold">Upcoming Risk Windows</CardTitle>
              </div>
              <Badge variant="outline" className="text-[10px]">This week</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {RISK_WINDOWS.map((r) => (
                <div key={r.event} className="rounded-lg border border-border p-3 bg-surface-card hover:border-amber-300/60 transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold truncate">{r.event}</div>
                    <span className={cn(
                      "text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0",
                      r.impact === "High" ? priorityStyle.High : priorityStyle.Medium,
                    )}>
                      {r.impact}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] font-medium text-accent-blue">{r.when}</div>
                  <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{r.note}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
