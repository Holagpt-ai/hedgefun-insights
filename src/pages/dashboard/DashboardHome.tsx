import { hasProAccess } from "@/lib/entitlement";
import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { BRAND } from "@/config/brand";

const NAV_CARDS = [
  { label: "Pre-Market", path: "/dashboard/pre-market", pro: false, icon: "☀️", desc: "Pre-market briefs & movers" },
  { label: "Screeners", path: "/dashboard/screeners", pro: false, icon: "🔍", desc: "Day Trade Radar & more" },
  { label: "Catalyst", path: "/dashboard/catalyst", pro: false, icon: "📡", desc: "Upcoming catalysts across your names" },
  { label: "My Watchlist", path: "/dashboard/watchlist", pro: false, icon: "⭐", desc: "Names you are actively tracking" },
  { label: "AI Analyst", path: "/dashboard/ai", pro: false, icon: "🤖", desc: "Ask anything about any stock" },
  { label: "Action Center", path: "/dashboard/action-center", pro: false, icon: "🎯", desc: "Command hub for daily workflow" },
  { label: "Stock Journal", path: "/dashboard/journal", pro: true, icon: "📓", desc: "Log trades and review performance" },
  { label: "After-Hours", path: "/dashboard/after-hours", pro: true, icon: "🌙", desc: "Post-market recap & tomorrow's setup" },
];

export default function DashboardHome() {
  const { profile, plan } = useAuth() as any;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const isPro = hasProAccess(plan);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(`hf_greeted_${today}`, "1");

    if (searchParams.get("welcome") === "true") {
      toast(`Welcome to ${BRAND.name}! 🎉`);
      navigate("/dashboard", { replace: true });
    }
  }, []);

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
    <div className="p-6 max-w-5xl mx-auto space-y-6">
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
{/* rendered from NAV_CARDS below */}
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

    </div>
  );
}
