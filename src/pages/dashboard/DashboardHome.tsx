import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { BRAND } from "@/config/brand";

const NAV_CARDS = [
  { label: "AM Inbox", path: "/dashboard/am-inbox", pro: true, icon: "☀️", desc: "Pre-market briefs & movers" },
  { label: "Screeners", path: "/dashboard/screeners", pro: false, icon: "🔍", desc: "Day Trade Radar & more" },
  { label: "AI Analyst", path: "/dashboard/ai", pro: true, icon: "🤖", desc: "Ask anything about any stock" },
  { label: "HedgeFun Game", path: "/dashboard/game", pro: false, icon: "🎮", desc: "Virtual $5M stock competition" },
];

const WHATS_NEW = [
  { date: "Jun 16 2026", text: "AI Analyst persistent memory" },
  { date: "Jun 10 2026", text: "PM Inbox launched" },
  { date: "Jun 2 2026", text: "Day Trade Radar screener live" },
];

type ActivityRow = { created_at: string; type: string };

export default function DashboardHome() {
  const { user, profile, plan } = useAuth() as any;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activity, setActivity] = useState<ActivityRow[]>([]);

  const isPro = plan === "pro" || plan === "admin" || plan === "unlimited";

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(`hf_greeted_${today}`, "1");

    if (searchParams.get("welcome") === "true") {
      toast("Welcome to HedgeFun! 🎉");
      navigate("/dashboard", { replace: true });
    }
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("ai_daily_logs")
        .select("created_at,type")
        .eq("user_id", user.id)
        .in("type", ["section_view", "ai_turn"])
        .order("created_at", { ascending: false })
        .limit(7);
      if (data) setActivity(data as unknown as ActivityRow[]);
    })();
  }, [user]);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  const name = profile?.full_name?.split(" ")[0] || "Trader";
  const todayStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-10">
      {/* Greeting */}
      <section>
        <h1 className="text-3xl font-bold tracking-tight">
          {greeting()}, {name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground flex items-center gap-2">
          <span>{todayStr}</span>
          {isPro && (
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              PRO
            </span>
          )}
        </p>
      </section>

      {/* Quick Access */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Quick Access</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {NAV_CARDS.map((card) => (
            <button
              key={card.path}
              onClick={() => navigate(card.path)}
              className="text-left rounded-xl border bg-card p-4 hover:shadow-md hover:-translate-y-0.5 transition-all"
            >
              <div className="text-2xl mb-2">{card.icon}</div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{card.label}</span>
                {card.pro && !isPro && (
                  <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                    PRO
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-1">{card.desc}</div>
            </button>
          ))}
        </div>
      </section>

      {/* What's New */}
      <section>
        <h2 className="text-lg font-semibold mb-3">What's New</h2>
        <ul className="divide-y rounded-xl border bg-card">
          {WHATS_NEW.map((item, i) => (
            <li key={i} className="flex items-center gap-4 px-4 py-3">
              <span className="text-xs text-muted-foreground w-24 shrink-0">{item.date}</span>
              <span className="text-sm">{item.text}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Recent Activity */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Recent Activity</h2>
        {activity.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent activity yet.</p>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {activity.map((a, i) => (
              <li key={i} className="flex items-center gap-4 px-4 py-3">
                <span className="text-xs text-muted-foreground w-24 shrink-0">
                  {new Date(a.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
                <span className="text-sm capitalize">{a.type.replace("_", " ")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
