import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { MarketCountdownClock } from "@/components/dashboard/MarketCountdownClock";
import { AIBriefCard } from "@/components/dashboard/AIBriefCard";
import { EarningsCardsGrid } from "@/components/dashboard/EarningsCardsGrid";
import { NewsSection } from "@/components/dashboard/NewsSection";
import { InboxTabs } from "@/components/dashboard/InboxTabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PM_INBOX_CONFIG, PM_GATE_THRESHOLD_MINS, PM_CATALYST_PILLS } from "@/config/inbox.config";
import { estDate } from "@/lib/price-utils";

function isBeforePMWindow(): boolean {
  const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  return et.getHours() * 60 + et.getMinutes() < PM_GATE_THRESHOLD_MINS;
}

export default function PMInbox() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const isPro = profile?.plan === "pro" || profile?.plan === "admin" || profile?.plan === "unlimited";
  const planLabel = isPro ? "PRO PLAN — LIVE DATA" : "FREE PLAN — DELAYED DATA";

  const timeGated = isBeforePMWindow();
  const [modalOpen, setModalOpen] = useState(timeGated);

  return (
    <div className="flex flex-col gap-6 p-6">
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <div className="text-3xl mb-2">{PM_INBOX_CONFIG.gateModalIcon}</div>
            <DialogTitle>{PM_INBOX_CONFIG.gateModalTitle}</DialogTitle>
            <DialogDescription>{PM_INBOX_CONFIG.gateModalBody}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setModalOpen(false)}>
              {PM_INBOX_CONFIG.gateModalCta}
            </Button>
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

      {timeGated ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-border bg-card p-10 text-center">
          <div className="text-4xl mb-2">{PM_INBOX_CONFIG.lockedCardIcon}</div>
          <h3 className="text-base font-semibold">{PM_INBOX_CONFIG.lockedCardTitle}</h3>
          <p className="text-sm text-muted-foreground">{PM_INBOX_CONFIG.lockedCardBody}</p>
        </div>
      ) : !isPro ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-border bg-card p-10 text-center">
          <div className="text-3xl mb-2">✦</div>
          <h3 className="text-base font-semibold">{PM_INBOX_CONFIG.aiCardGateHeading}</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            {PM_INBOX_CONFIG.aiCardGateBody}
          </p>
          <button
            onClick={() => navigate("/pro")}
            className="mt-2 bg-accent-blue text-white text-[13px] font-semibold px-5 py-2 rounded-md hover:opacity-90 transition-opacity duration-200"
          >
            {PM_INBOX_CONFIG.upgradeCta}
          </button>
        </div>
      ) : (
        <>
          <DashboardIndexCards />
          {(() => {
            const freePills = PM_CATALYST_PILLS.filter((p) => p.tier === "free");
            const proPills = PM_CATALYST_PILLS.filter((p) => p.tier === "pro");
            const visiblePills = isPro ? PM_CATALYST_PILLS : freePills;
            return (
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
            );
          })()}
          <EarningsCardsGrid briefType="pm" />
          <AIBriefCard isPro={isPro} config={PM_INBOX_CONFIG as any} briefType="pm" />
          <div>
            <button
              onClick={() =>
                navigate(
                  "/dashboard/ai?prompt=Give%20me%20a%20deeper%20breakdown%20of%20today%27s%20PM%20brief%20and%20what%20to%20watch%20for%20tomorrow."
                )
              }
              className="text-xs text-accent-blue hover:underline transition-colors duration-200"
            >
              Discuss in AI Analyst →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
