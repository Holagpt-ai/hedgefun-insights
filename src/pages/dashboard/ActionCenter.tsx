import { AlertTriangle, ArrowRight, Bell, Flag, Sparkles, Target } from "lucide-react";
import { useNavigate } from "react-router-dom";

type Priority = "High" | "Medium" | "Low";
type Status = "Watch" | "Review" | "Act";

interface FeedItem {
  symbol: string;
  name: string;
  title: string;
  type: string;
  priority: Priority;
  status: Status;
  note: string;
  time: string;
}

const FEED: FeedItem[] = [
  {
    symbol: "NVDA",
    name: "NVIDIA Corporation",
    title: "Unusual volume detected near resistance",
    type: "Volume",
    priority: "High",
    status: "Act",
    note: "Volume 2.4x 20d avg as price tests $1,240 resistance zone.",
    time: "10:42 AM",
  },
  {
    symbol: "TSLA",
    name: "Tesla, Inc.",
    title: "Watchlist volatility expanding",
    type: "Volatility",
    priority: "High",
    status: "Review",
    note: "IV rank climbing above 70; options flow skewing bullish.",
    time: "10:18 AM",
  },
  {
    symbol: "PLTR",
    name: "Palantir Technologies",
    title: "Earnings momentum still active",
    type: "Catalyst",
    priority: "Medium",
    status: "Watch",
    note: "Post-earnings drift day 3; RS line making new highs.",
    time: "09:55 AM",
  },
  {
    symbol: "AAPL",
    name: "Apple Inc.",
    title: "Risk flag: weak relative strength",
    type: "Risk",
    priority: "Medium",
    status: "Review",
    note: "Underperforming QQQ by 2.1% over 5 sessions.",
    time: "09:31 AM",
  },
  {
    symbol: "SMCI",
    name: "Super Micro Computer",
    title: "Breakout candidate if volume confirms",
    type: "Setup",
    priority: "Low",
    status: "Watch",
    note: "Tightening base under $58; needs 1.5x avg volume to trigger.",
    time: "09:12 AM",
  },
];

const FOCUS = [
  "Review AM Inbox pre-market movers before 9:30 ET open",
  "Confirm NVDA position sizing against risk limits",
  "Set alert on SMCI breakout level ($58.20)",
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
    title: "Earnings momentum watch",
    priority: "High",
    note: "Post-print drift extending; confidence stays elevated into next session.",
  },
  {
    symbol: "IOVA",
    title: "FDA decision window",
    priority: "High",
    note: "PDUFA window opens this week; expected move sits well above 20d avg.",
  },
  {
    symbol: "MSTR",
    title: "Bitcoin correlation risk",
    priority: "Medium",
    note: "BTC volatility bleeding into shares; monitor for reflex reversals.",
  },
  {
    symbol: "QQQ",
    title: "Rebalance flow sensitivity",
    priority: "Low",
    note: "Quarter-end index flows in play; low-priority context signal.",
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
    Act: "bg-accent-blue text-primary-foreground",
    Review: "bg-accent-blue-light text-accent-blue",
    Watch: "bg-muted text-foreground",
  };
  return map[s];
}

export default function ActionCenter() {
  const navigate = useNavigate();
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Action Center</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your highest-priority market moves, watchlist signals, and trading tasks in one place.
        </p>
      </div>

      {/* Today's Command Brief (static mock) */}
      <section
        aria-label="Today's Command Brief"
        className="rounded-xl border bg-gradient-to-br from-accent-blue-light/60 to-card p-5"
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-accent-blue text-primary-foreground">
            <Sparkles className="h-3 w-3" />
            Preview brief
          </span>
          <h2 className="text-sm font-semibold text-foreground">Today's Command Brief</h2>
          <span className="text-[10px] text-muted-foreground ml-auto">Mock content</span>
        </div>
        <p className="text-sm text-foreground/90 leading-relaxed">
          Two high-priority names dominate the tape: NVDA is pressing resistance on 2.4x volume,
          while TSLA volatility keeps expanding. Risk posture stays measured — one relative-strength
          flag on AAPL, plus a base-tightening setup in SMCI worth marking for a volume trigger.
        </p>
      </section>

      {/* Summary cards */}
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

      {/* Priority Feed */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Priority Feed</h2>
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
                <span className="text-[11px] text-muted-foreground w-16 text-right">{item.time}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Today's Focus */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Today's Focus</h2>
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
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Top Catalyst Signals</h2>
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-accent-blue-light text-accent-blue">
              <Sparkles className="h-3 w-3" />
              Linked to Catalyst
            </span>
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
    </div>
  );
}
