import { Radar, Calendar, FlaskConical, Layers, Shield, TrendingUp, AlertTriangle, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Priority = "High" | "Medium" | "Low";
type Status = "Watch" | "Review" | "Act";

interface CatalystEntry {
  symbol: string;
  name: string;
  type: string;
  signal: string;
  note: string;
  priority: Priority;
  status: Status;
  window: string;
  impact: string;
}

const CATALYSTS: CatalystEntry[] = [
  { symbol: "NVDA", name: "NVIDIA Corp.",       type: "Earnings",           signal: "Earnings momentum watch",           note: "Post-report strength remains active while volume confirms institutional interest.", priority: "High",   status: "Act",    window: "This week",     impact: "High" },
  { symbol: "PLTR", name: "Palantir",           type: "Earnings",           signal: "Post-earnings continuation setup",  note: "Momentum remains active after earnings reaction; watch for continuation above prior high.", priority: "High",   status: "Review", window: "Active",        impact: "High" },
  { symbol: "SMCI", name: "Super Micro",        type: "Technical Catalyst", signal: "Breakout confirmation window",      note: "Needs volume confirmation before signal upgrades from watch to act.", priority: "Medium", status: "Watch",  window: "48h",           impact: "Medium" },
  { symbol: "IOVA", name: "Iovance Biotherapeutics", type: "FDA / Biotech", signal: "FDA decision window approaching",   note: "Biotech event risk elevated; size conservatively around binary catalyst.", priority: "High",   status: "Review", window: "2 weeks",       impact: "High" },
  { symbol: "MSTR", name: "MicroStrategy",      type: "Crypto Correlation", signal: "Bitcoin correlation risk",          note: "BTC weakness may pressure related equity momentum.", priority: "Medium", status: "Watch",  window: "Rolling",       impact: "Medium" },
  { symbol: "RIVN", name: "Rivian",             type: "Short Interest",     signal: "High short-interest volatility watch", note: "Volatility can expand quickly if volume confirms.", priority: "Medium", status: "Watch",  window: "This week",     impact: "Medium" },
  { symbol: "QQQ",  name: "Invesco QQQ Trust",  type: "Index / Flow",       signal: "Rebalance flow sensitivity",        note: "Large-cap tech flows may impact watchlist names into close.", priority: "Low",    status: "Watch",  window: "Into close",    impact: "Low" },
];

const SUMMARY = [
  { label: "Earnings Watch",         count: 12, icon: Calendar,     tone: "text-accent-blue" },
  { label: "FDA / Biotech",          count: 4,  icon: FlaskConical, tone: "text-emerald-600" },
  { label: "Index & Rebalance",      count: 3,  icon: Layers,       tone: "text-amber-600" },
  { label: "SEC / Insider Signals",  count: 7,  icon: Shield,       tone: "text-rose-600" },
];

const RISK_WINDOWS = [
  { when: "Tue 8:30 ET",  event: "CPI Print",              impact: "High",   note: "Rate-sensitive names at risk; growth beta elevated." },
  { when: "Wed 2:00 ET",  event: "FOMC Minutes",           impact: "High",   note: "Watch curve reaction; tech and financials most reactive." },
  { when: "Thu AMC",      event: "NVDA Earnings",          impact: "High",   note: "Sets tone for semis and AI-adjacent basket." },
  { when: "Fri 10:00 ET", event: "Michigan Sentiment",     impact: "Medium", note: "Consumer discretionary reactive to inflation expectations." },
];

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

export default function Catalyst() {
  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Radar className="h-6 w-6 text-accent-blue" aria-hidden />
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Catalyst</h1>
        </div>
        <p className="text-sm md:text-base text-muted-foreground max-w-3xl">
          Track market-moving events, risk windows, and tradeable catalysts before they hit your watchlist.
        </p>
      </header>

      {/* Summary cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {SUMMARY.map((s) => (
          <Card key={s.label} className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{s.label}</span>
                <s.icon className={cn("h-4 w-4", s.tone)} aria-hidden />
              </div>
              <div className="mt-2 text-2xl font-semibold">{s.count}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">active signals</div>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* Main grid */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Mission Brief */}
        <Card className="lg:col-span-2 border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-accent-blue" aria-hidden />
              <CardTitle className="text-base font-semibold">Mission Brief</CardTitle>
            </div>
            <Badge variant="outline" className="text-[10px]">Updated hourly</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {CATALYSTS.map((c) => (
              <div
                key={c.symbol}
                className="rounded-lg border border-border p-3 md:p-4 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{c.symbol}</span>
                      <span className="text-xs text-muted-foreground truncate">{c.name}</span>
                      <Badge variant="secondary" className="text-[10px]">{c.type}</Badge>
                    </div>
                    <div className="mt-1 text-sm font-medium">{c.signal}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded border", priorityStyle[c.priority])}>
                      {c.priority}
                    </span>
                    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded", statusStyle[c.status])}>
                      {c.status}
                    </span>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{c.note}</p>
                <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" aria-hidden /> {c.window}</span>
                  <span>· Impact: {c.impact}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Catalyst Radar */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Radar className="h-4 w-4 text-accent-blue" aria-hidden />
              <CardTitle className="text-base font-semibold">Catalyst Radar</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {CATALYSTS.slice(0, 5).map((c) => (
              <div key={c.symbol} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{c.symbol}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{c.type}</div>
                </div>
                <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded border", priorityStyle[c.priority])}>
                  {c.priority}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      {/* Risk windows */}
      <section>
        <Card className="border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />
              <CardTitle className="text-base font-semibold">Upcoming Risk Windows</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {RISK_WINDOWS.map((r) => (
                <div key={r.event} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="text-sm font-semibold">{r.event}</div>
                    <Badge variant="outline" className="text-[10px]">{r.when}</Badge>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">Impact: {r.impact}</div>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{r.note}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
