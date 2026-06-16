import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Sun, Moon, Sparkles, BarChart2, Gamepad2, Activity, Clock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

// ─── CONFIG — edit these arrays to add/remove/reorder without touching JSX ───

const GREETING_KEY_PREFIX = "hf_greeted_";

const QUICK_NAV: {
  label: string;
  description: string;
  icon: React.ReactNode;
  route: string;
  badge?: string;
}[] = [
  { label: "AM Inbox", description: "Pre-market brief, index snapshot, and AI morning report.", icon: <Sun className="w-5 h-5 text-accent-blue" />, route: "/dashboard/am", badge: "PRO" },
  { label: "Screeners", description: "Day Trade Radar and 5 additional real-time screeners.", icon: <BarChart2 className="w-5 h-5 text-accent-blue" />, route: "/dashboard/screeners" },
  { label: "AI Analyst", description: "Ask Claude about setups, tickers, or market conditions.", icon: <Sparkles className="w-5 h-5 text-accent-blue" />, route: "/dashboard/ai", badge: "PRO" },
  { label: "HedgeFun Game", description: "Virtual $5M portfolio competition. Monthly leaderboard.", icon: <Gamepad2 className="w-5 h-5 text-accent-blue" />, route: "/dashboard/game" },
];

const WHATS_NEW: { date: string; label: string; description: string }[] = [
  { date: "Jun 14", label: "AI Analyst Live", description: "Full-screen Claude-powered trading analyst now available for PRO members." },
  { date: "Jun 13", label: "AM & PM Inbox", description: "Daily AI-generated market briefs with index snapshots, now live." },
  { date: "Jun 12", label: "Screeners: 6 Tabs", description: "Day Trade Radar, Gappers, Volume Spikes, and more — fully sortable." },
];

const ACTIVITY_LIMIT = 7;
const TRACKED_ENTRY_TYPES = ["section_view", "ai_turn"];

const SECTION_LABELS: Record<string, string> = {
  ai_analyst: "AI Analyst",
  am_inbox: "AM Inbox",
  pm_inbox: "PM Inbox",
  screeners: "Screeners",
  watchlist: "Watchlist",
  journal: "Stock Journal",
  game: "HedgeFun Game",
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function getGreetingWord(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "Good morning";
  if (h >= 12 && h < 17) return "Good afternoon";
  return "Good evening";
}

function getTodayKey(): string {
  const d = new Date();
  return `${GREETING_KEY_PREFIX}${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface ActivityEntry {
  id: string;
  entry_type: string;
  payload: Record<string, any> | null;
  created_at: string;
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export default function DashboardHome() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [showGreeting, setShowGreeting] = useState(false);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);

  const firstName = profile?.full_name?.split(" ")[0] ?? "there";

  // One greeting per calendar day via localStorage
  useEffect(() => {
    if (loading) return;
    const key = getTodayKey();
    const alreadyGreeted = localStorage.getItem(key) === "true";
    if (!alreadyGreeted) {
      setShowGreeting(true);
      localStorage.setItem(key, "true");
    }
  }, [loading]);

  // ?welcome=true toast — fire once, strip param
  useEffect(() => {
    if (searchParams.get("welcome") === "true") {
      const timer = setTimeout(() => {
        toast("Welcome to HedgeFun PRO 🎉 Your dashboard is ready.");
      }, 100);
      navigate("/dashboard", { replace: true });
      return () => clearTimeout(timer);
    }
  }, [searchParams, navigate]);

  // Recent activity from ai_daily_logs
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data } = await supabase
          .from("ai_daily_logs")
          .select("id, entry_type, payload, created_at")
          .eq("user_id", user.id)
          .in("entry_type", TRACKED_ENTRY_TYPES)
          .order("created_at", { ascending: false })
          .limit(ACTIVITY_LIMIT);
        setActivity((data as ActivityEntry[] | null) ?? []);
      } catch {
        // silent fail — empty state handles it
      } finally {
        setActivityLoading(false);
      }
    })();
  }, [user]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      {/* ── GREETING ── */}
      <div>
        {loading ? (
          <div className="h-8 w-64 bg-surface-card animate-pulse rounded" />
        ) : showGreeting ? (
          <h1 className="text-3xl font-semibold text-text-primary">
            {getGreetingWord()}, {firstName}.
          </h1>
        ) : (
          <h1 className="text-3xl font-semibold text-text-primary">
            Welcome back, {firstName}.
          </h1>
        )}
        <p className="text-text-secondary mt-1">Here's your trading command center.</p>
      </div>

      {/* ── QUICK-NAV CARDS ── */}
      <section>
        <h2 className="text-sm font-medium uppercase tracking-wide text-text-secondary mb-3">
          Quick Access
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {QUICK_NAV.map((item) => (
            <button
              key={item.route}
              onClick={() => navigate(item.route)}
              className="text-left bg-surface-card border border-border rounded-lg p-4 hover:border-accent-blue transition-colors duration-200 group"
            >
              <div className="flex items-center justify-between mb-3">
                {item.icon}
                {item.badge && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-accent-blue/10 text-accent-blue">
                    {item.badge}
                  </span>
                )}
              </div>
              <h3 className="font-medium text-text-primary group-hover:text-accent-blue transition-colors">
                {item.label}
              </h3>
              <p className="text-sm text-text-secondary mt-1">{item.description}</p>
            </button>
          ))}
        </div>
      </section>

      {/* ── BOTTOM GRID: WHAT'S NEW + RECENT ACTIVITY ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* What's New */}
        <section className="bg-surface-card border border-border rounded-lg p-5">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-4 h-4 text-accent-blue" />
            <h2 className="font-medium text-text-primary">What's New</h2>
          </div>
          <ul className="space-y-4">
            {WHATS_NEW.map((item) => (
              <li key={item.label}>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-secondary">{item.date}</span>
                  <span className="text-sm font-medium text-text-primary">{item.label}</span>
                </div>
                <p className="text-sm text-text-secondary mt-0.5">{item.description}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Recent Activity */}
        <section className="bg-surface-card border border-border rounded-lg p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-accent-blue" />
            <h2 className="font-medium text-text-primary">Recent Activity</h2>
          </div>
          {activityLoading ? (
            <ul className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <li key={i}>
                  <div className="h-4 w-full bg-surface-elevated animate-pulse rounded" />
                </li>
              ))}
            </ul>
          ) : activity.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-sm text-text-secondary">
                No activity yet — start by visiting AM Inbox.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {activity.map((entry) => {
                const section = entry.payload?.section ?? entry.entry_type;
                const label = SECTION_LABELS[section] ?? section;
                const isAiTurn = entry.entry_type === "ai_turn";
                return (
                  <li key={entry.id} className="flex items-center gap-3 text-sm">
                    <span className="text-text-secondary">
                      {isAiTurn ? <Sparkles className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                    </span>
                    <span className="text-text-primary flex-1">
                      {isAiTurn ? "AI Analyst conversation" : `Visited ${label}`}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-text-secondary">
                      <Clock className="w-3 h-3" />
                      {relativeTime(entry.created_at)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
