import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ScreenerTable } from "@/components/dashboard/ScreenerTable";
import { useScreenerData } from "@/hooks/useScreenerData";
import {
  SCREENER_TABS,
  DEFAULT_SCREENER_TAB_ID,
  getScreenerTabById,
} from "@/config/screener-tabs.config";
import { hasProAccess } from "@/lib/entitlement";

const SESSION_SEGMENTS = [
  { id: "pre", label: "Pre-Market", enabled: false },
  { id: "regular", label: "Regular Hours", enabled: false },
  { id: "after", label: "After-Hours", enabled: false },
  { id: "all", label: "All Sessions", enabled: true },
] as const;

export default function Screeners() {
  const { profile } = useAuth();
  const isPro = hasProAccess(profile?.plan);

  const [activeTabId, setActiveTabId] = useState(DEFAULT_SCREENER_TAB_ID);
  const activeTab = getScreenerTabById(activeTabId) ?? SCREENER_TABS[0];
  const { rows, loading, lastUpdated, error } = useScreenerData(activeTabId);

  const hasLive = !!rows && rows.length > 0;

  const accessLabel = hasLive
    ? isPro
      ? "PRO ACCESS — DELAYED MARKET FEED + PREVIEW TOOLS"
      : "FREE ACCESS — LIMITED DELAYED FEED"
    : isPro
      ? "PRO ACCESS — SAMPLE SCREENERS + PREVIEW TOOLS"
      : "FREE ACCESS — SAMPLE SCREENERS";

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="space-y-2">
        <span className="inline-block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border border-border rounded px-2 py-0.5">
          {accessLabel}
        </span>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Screeners</h1>
          <p className="text-sm text-muted-foreground">
            Market opportunity discovery — delayed market data and preview screeners
          </p>
        </div>
      </div>

      {/* Session segmented control (static — preview only) */}
      <div className="inline-flex flex-wrap gap-1 rounded-lg border border-border bg-muted/40 p-1">
        {SESSION_SEGMENTS.map((seg) => {
          const active = seg.id === "all";
          return (
            <div
              key={seg.id}
              aria-disabled={!seg.enabled}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground opacity-60 cursor-not-allowed"
              }`}
            >
              {seg.label}
              {!seg.enabled && (
                <span className="text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                  Preview
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {SCREENER_TABS.map((tab) => {
          const active = tab.id === activeTabId;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={`whitespace-nowrap px-3.5 py-2 text-[13px] font-medium border-b-2 transition-colors duration-200 ${
                active
                  ? "border-accent-blue text-accent-blue"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.featured ? "⚡ " : ""}
              {tab.label}
            </button>
          );
        })}
      </div>

      <p className="text-[13px] text-muted-foreground">{activeTab.description}</p>

      <ScreenerTable
        tab={activeTab}
        isPro={isPro}
        liveRows={rows}
        loading={loading}
        lastUpdated={lastUpdated}
        error={error}
      />
    </div>
  );
}
