import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { MarketCountdownClock } from "@/components/dashboard/MarketCountdownClock";
import { AIBriefCard } from "@/components/dashboard/AIBriefCard";
import { EarningsCardsGrid } from "@/components/dashboard/EarningsCardsGrid";
import { NewsSection } from "@/components/dashboard/NewsSection";
import DashboardIndexCards from "@/components/dashboard/DashboardIndexCards";
import { AM_INBOX_CONFIG, CATALYST_PILLS } from "@/config/inbox.config";
import { estDate } from "@/lib/price-utils";

export default function AMInbox() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const isPro = profile?.plan === "pro" || profile?.plan === "admin" || profile?.plan === "unlimited";
  const planLabel = isPro ? "PRO PLAN — LIVE DATA" : "FREE PLAN — DELAYED DATA";

  const freePills = CATALYST_PILLS.filter((p) => p.tier === "free");
  const proPills = CATALYST_PILLS.filter((p) => p.tier === "pro");
  const visiblePills = isPro ? CATALYST_PILLS : freePills;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{AM_INBOX_CONFIG.title}</h1>
        <p className="text-sm text-muted-foreground">{AM_INBOX_CONFIG.subtitle}</p>
      </div>

      <MarketCountdownClock />

      <div className="text-xs text-muted-foreground">
        {estDate()} · {planLabel}
      </div>

      <DashboardIndexCards />

      <div className="flex flex-wrap gap-2">
        {visiblePills.map((pill) => (
          <span
            key={pill.label}
            className="text-xs px-3 py-1.5 rounded-full border border-border bg-card text-foreground/80"
          >
            {pill.label}
          </span>
        ))}
        {!isPro && proPills.length > 0 && (
          <span className="text-xs px-3 py-1.5 rounded-full border border-dashed border-border text-muted-foreground">
            + {proPills.length} more catalysts — PRO
          </span>
        )}
      </div>

      <NewsSection isPro={isPro} />

      <EarningsCardsGrid briefType="am" />

      <AIBriefCard isPro={isPro} config={AM_INBOX_CONFIG} briefType="am" />

      <div>
        <button
          onClick={() =>
            navigate(
              "/dashboard/ai?prompt=Give%20me%20a%20deeper%20breakdown%20of%20this%20morning%27s%20AM%20brief%20and%20key%20catalysts%20to%20watch%20today."
            )
          }
          className="text-xs text-accent-blue hover:underline transition-colors duration-200"
        >
          Discuss in AI Analyst →
        </button>
      </div>
    </div>
  );
}
