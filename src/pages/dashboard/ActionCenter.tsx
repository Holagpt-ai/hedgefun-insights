import { AlertTriangle, ArrowRight, Bell, Flag, Sparkles, Target, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { hasProAccess } from "@/lib/entitlement";

type Priority = "High" | "Medium" | "Low";
type Status = "Sample action" | "Preview" | "Monitor";

interface FeedItem {
  symbol: string;
  name: string;
  title: string;
  type: string;
  priority: Priority;
  status: Status;
  note: string;
  label: string;
}

const FEED: FeedItem[] = [
  {
    symbol: "NVDA",
    name: "NVIDIA Corporation",
    title: "Volume-vs-resistance workflow example",
    type: "Volume",
    priority: "High",
    status: "Sample action",
    note: "Illustrates how a volume expansion near a key level would surface here.",
    label: "Sample",
  },
  {
    symbol: "TSLA",
    name: "Tesla, Inc.",
    title: "Watchlist volatility workflow example",
    type: "Volatility",
    priority: "High",
    status: "Preview",
    note: "Shows how expanding IV on a tracked name would be flagged for review.",
    label: "Sample",
  },
  {
    symbol: "PLTR",
    name: "Palantir Technologies",
    title: "Post-earnings momentum workflow example",
    type: "Catalyst",
    priority: "Medium",
    status: "Monitor",
    note: "Demonstrates how post-earnings drift signals would appear on the feed.",
    label: "Sample",
  },
  {
    symbol: "AAPL",
    name: "Apple Inc.",
    title: "Relative-strength risk workflow example",
    type: "Risk",
    priority: "Medium",
    status: "Preview",
    note: "Sample risk flag showing how underperformance vs. an index would surface.",
    label: "Sample",
  },
  {
    symbol: "SMCI",
    name: "Super Micro Computer",
    title: "Base-tightening setup workflow example",
    type: "Setup",
    priority: "Low",
    status: "Monitor",
    note: "Shows how a low-priority breakout watch would be tracked on the feed.",
    label: "Sample",
  },
];

const FOCUS = [
  "Review AM Inbox pre-market setup before the open",
  "Confirm position sizing against your own risk limits",
  "Set alerts on levels you're tracking manually",
  "Log yesterday's closed trades in Stock Journal",
];

const SUMMARY = [
  { label: "High Priority", value: 2, icon: Target, tone: "text-red-600" },
  { label: "Watchlist Alerts", value: 4, icon: Bell, tone: "text-accent-blue" },
  { label: "Catalyst Watch", value: 3, icon: Flag, tone: "text-amber-600" },
  { label: "Risk Flags", value: 1, icon: AlertTriangle, tone: "text-orange-600" },
];

interface CatalystSignal {
  symbol: string;
  title: string;
  priority: Priority;
  note: string;
}

const CATALYST_SIGNALS: CatalystSignal[] = [
  {
    symbol: "NVDA",
    title: "Earnings momentum workflow",
    priority: "High",
    note: "Sample showing how post-print drift would carry into the next session.",
  },
  {
    symbol: "IOVA",
    title: "FDA decision window workflow",
    priority: "High",
    note: "Sample showing how a PDUFA-style catalyst window would surface here.",
  },
  {
    symbol: "MSTR",
    title: "Correlated-asset risk workflow",
    priority: "Medium",
    note: "Sample showing how cross-asset volatility spillover would be tracked.",
  },
  {
    symbol: "QQQ",
    title: "Index rebalance workflow",
    priority: "Low",
    note: "Sample showing how a low-priority macro/context signal would appear.",
  },
];

function priorityBadge(p: Priority) {
  const map: Record<Priority, string> = {
    High: "bg-red-100 text-red-700",
    Medium: "bg-amber-100 text-amber-800",
    Low: "bg-muted text-muted-foreground",
  };
  return map[p];
}

function priorityAccent(p: Priority) {
  const map: Record<Priority, string> = {
    High: "border-l-4 border-l-red-500",
    Medium: "border-l-4 border-l-amber-500",
    Low: "border-l-4 border-l-muted-foreground/30",
  };
  return map[p];
}

function statusBadge(s: Status) {
  const map: Record<Status, string> = {
    "Sample action": "bg-accent-blue-light text-accent-blue",
    Preview: "bg-muted text-foreground",
    Monitor: "bg-muted text-muted-foreground",
  };
  return map[s];
}

function SampleChip({ label = "Sample workflow" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
      <Sparkles className="h-3 w-3" />
      {label}
    </span>
  );
}

interface WorkflowLink {
  title: string;
  desc: string;
  route: string;
}

const WORKFLOW_LINKS: WorkflowLink[] = [
  { title: "AM Inbox", desc: "Start the session with your pre-market setup.", route: "/dashboard/am" },
  { title: "PM Inbox", desc: "Review the close and prepare tomorrow's plan.", route: "/dashboard/pm" },
  { title: "Watchlist", desc: "Check the names you are actively tracking.", route: "/dashboard/watchlist" },
  { title: "AI Analyst", desc: "Turn signals into a market read.", route: "/dashboard/ai" },
  { title: "Journal", desc: "Log what worked and what to improve.", route: "/dashboard/journal" },
  { title: "Catalyst", desc: "Scan upcoming catalysts across your names.", route: "/dashboard/catalyst" },
];

export default function ActionCenter() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isPro = hasProAccess(profile?.plan);

  const accessLabel = isPro
    ? "PRO ACCESS — SAMPLE COMMAND WORKFLOWS"
    : "FREE ACCESS — SAMPLE COMMAND WORKFLOWS";

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-8">
      <div>
        <div className="text-[10px] font-semibold tracking-wider text-muted-foreground mb-1">
          {accessLabel}
        </div>
        <h1 className="text-2xl font-bold text-foreground">Action Center</h1>
        <p className="text-sm text-muted-foreground mt-1">
          A preview of your dashboard command hub — watchlist signals, catalyst context, and trading tasks in one place.
        </p>
      </div>

      {/* Preview disclaimer */}
      <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
        Preview — this page uses static sample workflows. Live signals will appear once market data is connected.
      </div>

      {/* Today's Command Brief (static mock) */}
      <section
        aria-label="Today's Command Brief"
        className="rounded-xl border bg-gradient-to-br from-accent-blue-light/60 to-card p-5"
      >
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-accent-blue text-primary-foreground">
            <Sparkles className="h-3 w-3" />
            Preview brief
          </span>
          <h2 className="text-sm font-semibold text-foreground">Today's Command Brief</h2>
          <span className="text-[10px] text-muted-foreground ml-auto">Sample content</span>
        </div>
        <p className="text-sm text-foreground/90 leading-relaxed">
          Sample brief showing how the Action Center will summarize the day: high-priority names,
          expanding volatility, a risk flag or two, and a setup worth marking for a volume trigger.
          Live briefs will replace this once integrations come online.
        </p>
      </section>

      {/* Summary cards */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-lg font-semibold">Summary</h2>
          <SampleChip label="Preview data" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {SUMMARY.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.label}
                className="rounded-xl border bg-card p-4 flex items-center gap-3"
              >
                <div className={`p-2 rounded-lg bg-muted ${s.tone}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{s.value}</div>
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Priority Feed */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-lg font-semibold">Priority Feed</h2>
          <SampleChip />
        </div>
        <ul className="divide-y rounded-xl border bg-card overflow-hidden">
          {FEED.map((item) => (
            <li
              key={item.symbol}
              className={`flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 ${priorityAccent(item.priority)}`}
            >
              <div className="flex items-center gap-3 sm:w-40 shrink-0">
                <span className="font-bold text-sm">{item.symbol}</span>
                <span className="text-xs text-muted-foreground truncate">{item.name}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{item.title}</div>
                <div className="text-xs text-muted-foreground truncate">{item.note}</div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${priorityBadge(item.priority)}`}>
                  {item.priority}
                </span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusBadge(item.status)}`}>
                  {item.status}
                </span>
                <span className="text-[11px] text-muted-foreground w-16 text-right">{item.label}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Today's Focus */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-lg font-semibold">Today's Focus</h2>
          <SampleChip />
        </div>
        <ul className="rounded-xl border bg-card divide-y">
          {FOCUS.map((f, i) => (
            <li key={i} className="flex items-start gap-3 px-4 py-3">
              <span className="mt-1 h-2 w-2 rounded-full bg-accent-blue shrink-0" />
              <span className="text-sm">{f}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Top Catalyst Signals */}
      <section>
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-semibold">Top Catalyst Signals</h2>
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-accent-blue-light text-accent-blue">
              <Sparkles className="h-3 w-3" />
              Linked to Catalyst
            </span>
            <SampleChip />
          </div>
          <button
            onClick={() => navigate("/dashboard/catalyst")}
            className="text-xs font-medium text-accent-blue hover:underline inline-flex items-center gap-1"
          >
            Open Catalyst <ArrowRight className="h-3 w-3" />
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CATALYST_SIGNALS.map((c) => (
            <div
              key={c.symbol}
              className={`rounded-xl border bg-card p-4 flex flex-col gap-2 ${priorityAccent(c.priority)}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-bold text-sm">{c.symbol}</span>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${priorityBadge(c.priority)}`}
                  >
                    {c.priority}
                  </span>
                </div>
              </div>
              <div className="text-sm font-medium">{c.title}</div>
              <div className="text-xs text-muted-foreground line-clamp-2">{c.note}</div>
              <div className="pt-1">
                <button
                  onClick={() => navigate("/dashboard/catalyst")}
                  className="text-xs font-semibold px-3 py-1.5 rounded-md bg-accent-blue text-primary-foreground hover:bg-accent-blue/90 inline-flex items-center gap-1"
                >
                  View Catalyst Brief <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Continue your workflow */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Continue your workflow</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {WORKFLOW_LINKS.map((w) => (
            <button
              key={w.route}
              onClick={() => navigate(w.route)}
              className="text-left rounded-xl border bg-card p-4 hover:border-accent-blue hover:bg-accent-blue-light/30 transition-colors flex flex-col gap-1"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">{w.title}</span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <span className="text-xs text-muted-foreground">{w.desc}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Free-user upgrade callout */}
      {!isPro && (
        <section
          aria-label="Unlock the full command workflow"
          className="rounded-xl border bg-gradient-to-br from-accent-blue-light/40 to-card p-5 flex flex-col sm:flex-row sm:items-center gap-4"
        >
          <div className="p-3 rounded-lg bg-accent-blue text-primary-foreground shrink-0 w-fit">
            <Lock className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-foreground">
              Unlock the full command workflow
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Pro access will connect deeper recap, journal, and alert workflows as HedgeFun data integrations come online.
            </p>
          </div>
          <button
            onClick={() => navigate("/pro")}
            className="text-xs font-semibold px-3 py-2 rounded-md bg-accent-blue text-primary-foreground hover:bg-accent-blue/90 inline-flex items-center gap-1 shrink-0"
          >
            Request Early Access <ArrowRight className="h-3 w-3" />
          </button>
        </section>
      )}
    </div>
  );
}
