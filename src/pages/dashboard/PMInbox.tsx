import { hasProAccess } from "@/lib/entitlement";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Sparkles, Newspaper, BookOpen } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { MarketCountdownClock } from "@/components/dashboard/MarketCountdownClock";
import { AIBriefCard } from "@/components/dashboard/AIBriefCard";
import { EarningsCardsGrid } from "@/components/dashboard/EarningsCardsGrid";
import { NewsSection } from "@/components/dashboard/NewsSection";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  PM_INBOX_CONFIG,
  PM_GATE_THRESHOLD_MINS,
  PM_CATALYST_PILLS,
  PM_TODAYS_KEY_MOVES,
  PM_TOMORROW_SETUP,
  PM_AFTER_HOURS_WATCH,
  type CatalystPill,
  type StaticInboxItem,
} from "@/config/inbox.config";
import { estDate } from "@/lib/price-utils";

function isBeforePMWindow(): boolean {
  const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  return et.getHours() * 60 + et.getMinutes() < PM_GATE_THRESHOLD_MINS;
}

function priorityBorder(p?: "High" | "Medium" | "Low"): string {
  if (p === "High") return "border-l-4 border-l-red-500";
  if (p === "Medium") return "border-l-4 border-l-amber-500";
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

const TICKER_RE = /^[A-Z]{1,6}(?:[.\-][A-Z]{1,3})?$/;

function StaticItemCard({
  item,
  enableSymbolActions = false,
}: {
  item: StaticInboxItem;
  enableSymbolActions?: boolean;
}) {
  const navigate = useNavigate();
  const raw = item.label.trim();
  const symbol = raw.toUpperCase();
  const isTicker =
    enableSymbolActions && raw === symbol && !/\s/.test(raw) && TICKER_RE.test(symbol);

  const encoded = isTicker ? encodeURIComponent(symbol) : "";

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
      {isTicker && (
        <div className="mt-1.5 flex items-center gap-1">
          <button
            type="button"
            onClick={() => navigate(`/dashboard/ai?symbol=${encoded}`)}
            aria-label={`Research ${symbol} in AI Analyst`}
            title={`Research ${symbol} in AI Analyst`}
            className="inline-flex items-center justify-center h-6 w-6 rounded-md border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/60 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-blue transition-colors"
          >
            <Sparkles className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => navigate(`/dashboard/catalyst?symbol=${encoded}`)}
            aria-label={`Open ${symbol} in Catalyst`}
            title={`Open ${symbol} in Catalyst`}
            className="inline-flex items-center justify-center h-6 w-6 rounded-md border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/60 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-blue transition-colors"
          >
            <Newspaper className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => navigate(`/dashboard/journal?symbol=${encoded}`)}
            aria-label={`Log ${symbol} in Journal`}
            title={`Log ${symbol} in Journal`}
            className="inline-flex items-center justify-center h-6 w-6 rounded-md border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/60 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-blue transition-colors"
          >
            <BookOpen className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

export default function PMInbox() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const isPro = hasProAccess(profile?.plan);
  const planLabel = isPro
    ? "PRO ACCESS — MARKET BRIEF + SAMPLE WORKFLOWS"
    : "FREE ACCESS — SAMPLE WORKFLOWS";

  const timeGated = isBeforePMWindow();
  const [modalOpen, setModalOpen] = useState(timeGated);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <div className="text-3xl mb-2">{PM_INBOX_CONFIG.gateModalIcon}</div>
            <DialogTitle>{PM_INBOX_CONFIG.gateModalTitle}</DialogTitle>
            <DialogDescription>{PM_INBOX_CONFIG.gateModalBody}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setModalOpen(false)}>{PM_INBOX_CONFIG.gateModalCta}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">{PM_INBOX_CONFIG.title}</h1>
        <p className="text-sm text-muted-foreground">{PM_INBOX_CONFIG.subtitle}</p>
      </div>

      <MarketCountdownClock />

      <div className="text-xs text-muted-foreground">
        {estDate()} · {planLabel}
      </div>

      {/* Post-Market Recap — always rendered; backend states govern display */}
      <section className="flex flex-col gap-3">
        <SectionHeader
          title={PM_INBOX_CONFIG.recapHeading}
          subtitle={PM_INBOX_CONFIG.recapSubtitle}
        />
        <AIBriefCard isPro={isPro} config={PM_INBOX_CONFIG as any} briefType="pm" />
      </section>



      {timeGated && isPro ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border bg-card p-10 text-center">
          <div className="text-4xl mb-2">{PM_INBOX_CONFIG.lockedCardIcon}</div>
          <h3 className="text-base font-semibold">{PM_INBOX_CONFIG.lockedCardTitle}</h3>
          <p className="text-sm text-muted-foreground">{PM_INBOX_CONFIG.lockedCardBody}</p>
        </div>
      ) : timeGated && !isPro ? (
        <>
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border bg-card p-10 text-center">
            <div className="text-4xl mb-2">{PM_INBOX_CONFIG.lockedCardIcon}</div>
            <h3 className="text-base font-semibold">{PM_INBOX_CONFIG.lockedCardTitle}</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              {PM_INBOX_CONFIG.lockedCardBody}
            </p>
            <p className="text-xs text-muted-foreground mt-2 max-w-md">
              Full PM Inbox — post-market recap, catalyst outcomes, and after-hours watch — is a Pro feature.
            </p>
            <button
              onClick={() => navigate("/pro")}
              className="mt-3 bg-accent-blue text-primary-foreground text-[13px] font-semibold px-5 py-2 rounded-md hover:opacity-90 transition-opacity duration-200"
            >
              Request Pro Access
            </button>
          </div>

          {/* Free preview teaser for pre-window non-Pro */}
          <section className="flex flex-col gap-3">
            <SectionHeader
              title="PM Inbox Preview"
              subtitle="See how HedgeFun turns today's market action into tomorrow's trading plan."
            />
            <SampleChip label="Preview data" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PM_TOMORROW_SETUP.slice(0, 4).map((item) => (
                <StaticItemCard key={item.label} item={item} />
              ))}
            </div>
          </section>
        </>
      ) : !timeGated && !isPro ? (
        <>
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border bg-card p-10 text-center">
            <div className="text-3xl mb-2">✦</div>
            <h3 className="text-base font-semibold">PM Inbox Preview</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              See how HedgeFun turns today's market action into tomorrow's trading plan. Full post-market recap,
              catalyst outcomes, and after-hours watch are available with Pro access.
            </p>
            <button
              onClick={() => navigate("/pro")}
              className="mt-2 bg-accent-blue text-primary-foreground text-[13px] font-semibold px-5 py-2 rounded-md hover:opacity-90 transition-opacity duration-200"
            >
              {PM_INBOX_CONFIG.upgradeCta}
            </button>
          </div>

          {/* Free preview teaser section */}
          <section className="flex flex-col gap-3">
            <SectionHeader
              title={PM_INBOX_CONFIG.tomorrowSetupHeading}
              subtitle="A taste of what a full Pro PM Inbox surfaces."
            />
            <SampleChip label="Preview data" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PM_TOMORROW_SETUP.slice(0, 4).map((item) => (
                <StaticItemCard key={item.label} item={item} />
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <SectionHeader title={PM_INBOX_CONFIG.afterHoursHeading} />
            <SampleChip label="Preview data" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {PM_AFTER_HOURS_WATCH.slice(0, 3).map((item) => (
                <StaticItemCard key={item.label} item={item} />
              ))}
            </div>
          </section>
        </>
      ) : (
        <>
          {/* Catalyst Outcomes */}

          <section className="flex flex-col gap-3">
            <SectionHeader
              title={PM_INBOX_CONFIG.catalystOutcomesHeading}
              subtitle={PM_INBOX_CONFIG.catalystOutcomesSubtitle}
              cta="View Catalyst"
              onCta={() => navigate("/dashboard/catalyst")}
            />
            <SampleChip />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {PM_CATALYST_PILLS.map((pill) => (
                <CatalystCard key={pill.label} pill={pill} locked={!isPro && pill.tier === "pro"} />
              ))}
            </div>
          </section>

          {/* After-Close Earnings */}
          <section className="flex flex-col gap-3">
            <SectionHeader title={PM_INBOX_CONFIG.earningsHeading} />
            <EarningsCardsGrid briefType="pm" />
          </section>

          {/* Today's Key Moves */}
          <section className="flex flex-col gap-3">
            <SectionHeader title={PM_INBOX_CONFIG.keyMovesHeading} />
            <SampleChip />
            {PM_TODAYS_KEY_MOVES.length === 0 ? (
              <div className="rounded-xl border bg-card p-4 text-xs text-muted-foreground">
                {PM_INBOX_CONFIG.keyMovesEmpty}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {PM_TODAYS_KEY_MOVES.map((item) => (
                  <StaticItemCard key={item.label} item={item} enableSymbolActions />
                ))}
              </div>
            )}
          </section>

          {/* Tomorrow's Setup */}
          <section className="flex flex-col gap-3">
            <SectionHeader
              title={PM_INBOX_CONFIG.tomorrowSetupHeading}
              cta="Open Watchlist"
              onCta={() => navigate("/dashboard/watchlist")}
            />
            <SampleChip />
            {PM_TOMORROW_SETUP.length === 0 ? (
              <div className="rounded-xl border bg-card p-4 text-xs text-muted-foreground">
                {PM_INBOX_CONFIG.tomorrowSetupEmpty}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {PM_TOMORROW_SETUP.map((item) => (
                  <StaticItemCard key={item.label} item={item} />
                ))}
              </div>
            )}
          </section>

          {/* After-Hours Watch */}
          <section className="flex flex-col gap-3">
            <SectionHeader title={PM_INBOX_CONFIG.afterHoursHeading} />
            <SampleChip />
            {PM_AFTER_HOURS_WATCH.length === 0 ? (
              <div className="rounded-xl border bg-card p-4 text-xs text-muted-foreground">
                {PM_INBOX_CONFIG.afterHoursEmpty}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {PM_AFTER_HOURS_WATCH.map((item) => (
                  <StaticItemCard key={item.label} item={item} enableSymbolActions />
                ))}
              </div>
            )}
          </section>

          {/* Journal handoff */}
          <section className="rounded-xl border bg-card p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Log today's trades</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Capture what worked, what failed, and what to watch tomorrow.
              </p>
            </div>
            <button
              onClick={() => navigate("/dashboard/journal")}
              className="self-start sm:self-auto inline-flex items-center gap-1 bg-accent-blue text-primary-foreground text-[13px] font-semibold px-4 py-2 rounded-md hover:opacity-90 transition-opacity"
            >
              Open Journal
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </section>

          {/* Market Headlines */}
          <section className="flex flex-col gap-3">
            <SectionHeader title={PM_INBOX_CONFIG.newsHeading} />
            <NewsSection isPro={isPro} contained />
          </section>

          {/* Footer CTAs */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <button
              onClick={() =>
                navigate(
                  "/dashboard/ai?prompt=Give%20me%20a%20deeper%20breakdown%20of%20today%27s%20PM%20brief%20and%20what%20to%20watch%20for%20tomorrow.",
                )
              }
              className="text-xs text-accent-blue hover:underline transition-colors duration-200"
            >
              Discuss in AI Analyst →
            </button>
            <button
              onClick={() => navigate("/dashboard/journal")}
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              Open Journal →
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
            <button
              onClick={() => navigate("/dashboard/screeners")}
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              Open Screeners →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
