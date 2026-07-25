import { Link } from "react-router-dom";
import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { hasProAccess } from "@/lib/entitlement";
import { AIBriefCard } from "@/components/dashboard/AIBriefCard";
import { useActionCenter } from "@/hooks/useActionCenter";
import { useCatalystEnrichmentForSymbols } from "@/hooks/useCatalystEnrichmentForSymbols";
import { SummaryCards } from "@/components/action-center/SummaryCards";
import { ActionFeed } from "@/components/action-center/ActionFeed";
import { TodaysFocus } from "@/components/action-center/TodaysFocus";
import { VolumeLeaders } from "@/components/action-center/VolumeLeaders";
import { CatalystWatch } from "@/components/action-center/CatalystWatch";
import { WatchlistSnapshot } from "@/components/action-center/WatchlistSnapshot";

const WORKFLOW_LINKS = [
  { title: "Pre-Market", desc: "Start the session with your pre-market setup.", route: "/dashboard/pre-market" },
  { title: "Screeners", desc: "Run day-trade and swing screeners.", route: "/dashboard/screeners" },
  { title: "Catalyst", desc: "Scan upcoming catalysts across your names.", route: "/dashboard/catalyst" },
  { title: "Watchlist", desc: "Check the names you are actively tracking.", route: "/dashboard/watchlist" },
  { title: "AI Analyst", desc: "Turn signals into a market read.", route: "/dashboard/ai" },
  { title: "Journal", desc: "Log what worked and what to improve.", route: "/dashboard/journal" },
  { title: "After-Hours", desc: "Review the close and prepare tomorrow's plan.", route: "/dashboard/after-hours" },
];

function SectionError({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
      {label} unavailable right now.
    </div>
  );
}

export default function ActionCenter() {
  const { profile } = useAuth();
  const isPro = hasProAccess(profile?.plan);
  const ac = useActionCenter();

  const leaderSymbols = useMemo(
    () => ac.leaders.map((l) => l.symbol.toUpperCase()),
    [ac.leaders],
  );
  const enrichmentQ = useCatalystEnrichmentForSymbols(leaderSymbols);

  const briefLabel = ac.briefType === "am" ? "Pre-Market" : "After-Hours";

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Action Center</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your live command hub for market signals, catalysts and trading workflow.
        </p>
        <div className="mt-1 text-[11px] text-muted-foreground">
          Real account data · Market feeds may be delayed
        </div>
      </div>

      {/* SECTION 1 — Current Market Brief */}
      <section aria-label="Current Market Brief">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-lg font-semibold">Current Market Brief</h2>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-0.5 rounded-full bg-muted">
            {briefLabel}
          </span>
        </div>
        <AIBriefCard
          isPro={isPro}
          briefType={ac.briefType}
          config={{
            aiCardTitle: ac.briefType === "am" ? "✦ AI Pre-Market Brief" : "✦ AI After-Hours Brief",
            aiCardPlaceholderText: "Your market brief will appear here when available.",
            aiCardTimestampLabel: "Generated at",
            aiCardGateHeading: `${briefLabel} Brief — PRO Feature`,
            aiCardGateBody: "A shared AI market brief grounded in SPY, QQQ, DIA, and IWM.",
            upgradeCta: "Request Pro Access",
          }}
        />
      </section>

      {/* SECTION 2 — Live Summary */}
      <section aria-label="Live Summary">
        <h2 className="text-lg font-semibold mb-3">Live Summary</h2>
        <SummaryCards counts={ac.summary} />
      </section>

      {/* SECTION 3 — Action Feed */}
      <section aria-label="Action Feed">
        <h2 className="text-lg font-semibold mb-3">Action Feed</h2>
        {(ac.errors.alerts || ac.errors.catalyst || ac.errors.trades) && (
          <SectionError label="Some feed sources are" />
        )}
        <ActionFeed items={ac.feed} />
      </section>

      {/* SECTION 4 — Today's Focus */}
      <section aria-label="Today's Focus">
        <h2 className="text-lg font-semibold mb-3">Today's Focus</h2>
        <TodaysFocus tasks={ac.tasks} />
      </section>

      {/* SECTION 5 — Volume Leaders */}
      <section aria-label="Volume Leaders">
        <h2 className="text-lg font-semibold mb-3">Volume Leaders</h2>
        {ac.errors.leaders && <SectionError label="Volume leaders are" />}
        <VolumeLeaders rows={ac.leaders} />
      </section>

      {/* SECTION 6 — Catalyst Watch */}
      <section aria-label="Catalyst Watch">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h2 className="text-lg font-semibold">Catalyst Watch</h2>
          <Link to="/dashboard/catalyst" className="text-xs font-medium text-accent-blue hover:underline inline-flex items-center gap-1">
            View Catalyst <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {ac.errors.catalyst && <SectionError label="Catalyst feed is" />}
        <CatalystWatch
          events={ac.catalystWatch}
          savedEventIds={ac.savedEventIds}
          reviewedEventIds={ac.reviewedEventIds}
        />
      </section>

      {/* SECTION 7 — Watchlist Snapshot */}
      <section aria-label="Watchlist Snapshot">
        <h2 className="text-lg font-semibold mb-3">Watchlist Snapshot</h2>
        {ac.errors.analyses && <SectionError label="Watchlist analyses are" />}
        <WatchlistSnapshot snapshot={ac.snapshot} />
      </section>

      {/* SECTION 8 — Continue Workflow */}
      <section aria-label="Continue Workflow">
        <h2 className="text-lg font-semibold mb-3">Continue Workflow</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {WORKFLOW_LINKS.map((w) => (
            <Link
              key={w.route}
              to={w.route}
              className="text-left rounded-xl border bg-card p-4 hover:border-accent-blue hover:bg-accent-blue-light/30 transition-colors flex flex-col gap-1"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">{w.title}</span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <span className="text-xs text-muted-foreground">{w.desc}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
