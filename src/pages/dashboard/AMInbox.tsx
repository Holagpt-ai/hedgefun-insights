import { hasProAccess } from "@/lib/entitlement";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { MarketCountdownClock } from "@/components/dashboard/MarketCountdownClock";
import { AIBriefCard } from "@/components/dashboard/AIBriefCard";
import { EarningsCardsGrid } from "@/components/dashboard/EarningsCardsGrid";
import { NewsSection } from "@/components/dashboard/NewsSection";
import DashboardIndexCards from "@/components/dashboard/DashboardIndexCards";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AM_INBOX_CONFIG,
  CATALYST_PILLS,
  AM_OVERNIGHT_MOVERS,
  AM_RISK_FLAGS,
  AM_OPENING_BELL_CHECKLIST,
  type CatalystPill,
  type StaticInboxItem,
} from "@/config/inbox.config";
import { estDate } from "@/lib/price-utils";

function priorityBorder(p?: "High" | "Medium" | "Low"): string {
  if (p === "High") return "border-l-4 border-l-red-500";
  if (p === "Medium") return "border-l-4 border-l-amber-500";
  if (p === "Low") return "border-l-4 border-l-muted";
  return "border-l-4 border-l-muted";
}

function priorityBadge(p?: "High" | "Medium" | "Low"): string {
  if (p === "High") return "bg-red-950 text-red-400";
  if (p === "Medium") return "bg-amber-950 text-amber-400";
  return "bg-muted text-muted-foreground";
}

function SampleChip({ label = "Sample workflow" }: { label?: string }) {
  return (
    <span className="inline-flex self-start items-center rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      {label}
    </span>
  );
}

function SectionHeader({
  title,
  subtitle,
  cta,
  onCta,
}: {
  title: string;
  subtitle?: string;
  cta?: string;
  onCta?: () => void;
}) {
  return (
    <div className="flex items-end justify-between gap-3 flex-wrap">
      <div>
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {cta && onCta && (
        <button
          onClick={onCta}
          className="inline-flex items-center gap-1 text-xs font-medium text-accent-blue hover:underline"
        >
          {cta}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function CatalystCard({ pill, locked }: { pill: CatalystPill; locked?: boolean }) {
  return (
    <div
      className={`rounded-xl border bg-card p-3 flex flex-col gap-1.5 ${priorityBorder(pill.priority)} ${
        locked ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-medium leading-snug">{pill.label}</div>
        {pill.priority && (
          <span
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${priorityBadge(
              pill.priority,
            )}`}
          >
            {pill.priority}
          </span>
        )}
      </div>
      {pill.note && (
        <div className="text-xs text-muted-foreground">{locked ? "PRO — unlock to preview" : pill.note}</div>
      )}
    </div>
  );
}

function StaticItemCard({ item }: { item: StaticInboxItem }) {
  return (
    <div className={`rounded-xl border bg-card p-3 flex flex-col gap-1 ${priorityBorder(item.priority)}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-semibold">{item.label}</div>
        {item.badge && (
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${priorityBadge(item.priority)}`}>
            {item.badge}
          </span>
        )}
      </div>
      <div className="text-xs text-muted-foreground">{item.detail}</div>
    </div>
  );
}

export default function AMInbox() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const isPro = hasProAccess(profile?.plan);
  const planLabel = isPro
    ? "PRO ACCESS — LIVE SECTIONS + SAMPLE WORKFLOWS"
    : "FREE ACCESS — SAMPLE WORKFLOWS";

  const [checked, setChecked] = useState<Record<number, boolean>>({});

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{AM_INBOX_CONFIG.title}</h1>
        <p className="text-sm text-muted-foreground">{AM_INBOX_CONFIG.subtitle}</p>
      </div>

      <MarketCountdownClock />

      <div className="text-xs text-muted-foreground">
        {estDate()} · {planLabel}
      </div>

      <DashboardIndexCards />

      {/* Pre-Market Command Brief */}
      <section className="flex flex-col gap-3">
        <SectionHeader
          title={AM_INBOX_CONFIG.commandBriefHeading}
          subtitle={AM_INBOX_CONFIG.commandBriefSubtitle}
        />
        <AIBriefCard isPro={isPro} config={AM_INBOX_CONFIG} briefType="am" />
      </section>

      {/* Catalyst Watch — Preview Signals */}
      <section className="flex flex-col gap-3">
        <SectionHeader
          title={AM_INBOX_CONFIG.catalystWatchHeading}
          subtitle={AM_INBOX_CONFIG.catalystWatchSubtitle}
          cta="View Catalyst"
          onCta={() => navigate("/dashboard/catalyst")}
        />
        <span className="inline-flex self-start items-center rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Sample workflow
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {CATALYST_PILLS.map((pill) => (
            <CatalystCard key={pill.label} pill={pill} locked={!isPro && pill.tier === "pro"} />
          ))}
        </div>
      </section>

      {/* Before-Open Earnings */}
      <section className="flex flex-col gap-3">
        <SectionHeader title={AM_INBOX_CONFIG.earningsHeading} />
        <EarningsCardsGrid briefType="am" />
      </section>

      {/* Overnight Movers / Watchlist Setup */}
      <section className="flex flex-col gap-3">
        <SectionHeader
          title={AM_INBOX_CONFIG.overnightMoversHeading}
          cta="Open Watchlist"
          onCta={() => navigate("/dashboard/watchlist")}
        />
        {AM_OVERNIGHT_MOVERS.length === 0 ? (
          <div className="rounded-xl border bg-card p-4 text-xs text-muted-foreground">
            {AM_INBOX_CONFIG.overnightMoversEmpty}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {AM_OVERNIGHT_MOVERS.map((item) => (
              <StaticItemCard key={item.label} item={item} />
            ))}
          </div>
        )}
      </section>

      {/* Risk Flags */}
      <section className="flex flex-col gap-3">
        <SectionHeader title={AM_INBOX_CONFIG.riskFlagsHeading} />
        {AM_RISK_FLAGS.length === 0 ? (
          <div className="rounded-xl border bg-card p-4 text-xs text-muted-foreground">
            {AM_INBOX_CONFIG.riskFlagsEmpty}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {AM_RISK_FLAGS.map((item) => (
              <StaticItemCard key={item.label} item={item} />
            ))}
          </div>
        )}
      </section>

      {/* Opening Bell Checklist */}
      <section className="flex flex-col gap-3">
        <SectionHeader
          title={AM_INBOX_CONFIG.checklistHeading}
          subtitle={AM_INBOX_CONFIG.checklistSubtitle}
        />
        <div className="rounded-xl border bg-card p-4 flex flex-col gap-2">
          {AM_OPENING_BELL_CHECKLIST.map((item, i) => (
            <label
              key={i}
              className="flex items-start gap-3 text-sm cursor-pointer group"
            >
              <Checkbox
                checked={!!checked[i]}
                onCheckedChange={(v) => setChecked((s) => ({ ...s, [i]: !!v }))}
                className="mt-0.5"
              />
              <span
                className={`leading-snug ${
                  checked[i] ? "line-through text-muted-foreground" : "text-foreground"
                }`}
              >
                {item}
              </span>
            </label>
          ))}
        </div>
      </section>

      {/* Market Headlines */}
      <section className="flex flex-col gap-3">
        <SectionHeader title={AM_INBOX_CONFIG.newsHeading} />
        <NewsSection isPro={isPro} contained />
      </section>

      {/* Footer CTAs */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          onClick={() =>
            navigate(
              "/dashboard/ai?prompt=Give%20me%20a%20deeper%20breakdown%20of%20this%20morning%27s%20AM%20brief%20and%20key%20catalysts%20to%20watch%20today.",
            )
          }
          className="text-xs text-accent-blue hover:underline transition-colors duration-200"
        >
          Discuss in AI Analyst →
        </button>
        <button
          onClick={() => navigate("/dashboard/action-center")}
          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          Open Action Center →
        </button>
        <button
          onClick={() => navigate("/dashboard/watchlist")}
          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          Open Watchlist →
        </button>
      </div>
    </div>
  );
}
