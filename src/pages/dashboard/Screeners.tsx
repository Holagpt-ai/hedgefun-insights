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
import { parseTimestampMs } from "@/lib/screeners/contract";

function formatPipelineAge(iso: string | null): string | null {
  if (!iso) return null;
  const then = parseTimestampMs(iso);
  if (then === null) return null;
  const diffMs = Date.now() - then;
  if (diffMs < 0) return "just now";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatProviderAsOf(iso: string | null): string | null {
  if (!iso) return null;
  const ms = parseTimestampMs(iso);
  if (ms === null) return null;
  return new Date(ms).toLocaleString();
}

export default function Screeners() {
  const { profile } = useAuth();
  const isPro = hasProAccess(profile?.plan);

  const [activeTabId, setActiveTabId] = useState(DEFAULT_SCREENER_TAB_ID);
  const activeTab = getScreenerTabById(activeTabId) ?? SCREENER_TABS[0];
  const { status, rows, syncedAt, providerAsOfMax } = useScreenerData(activeTabId);

  const accessLabel = isPro
    ? "PRO ACCESS — 15-MINUTE DELAYED MARKET FEED"
    : "FREE ACCESS — LIMITED 15-MINUTE DELAYED MARKET FEED";

  const providerLabel = formatProviderAsOf(providerAsOfMax);
  const pipelineAge = formatPipelineAge(syncedAt);
  const showFreshness =
    status === "available" || status === "stale" || status === "empty";

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="space-y-2">
        <span className="inline-block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border border-border rounded px-2 py-0.5">
          {accessLabel}
        </span>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Screeners</h1>
          <p className="text-sm text-muted-foreground">
            Volume-first opportunity discovery from a 15-minute delayed market feed.
          </p>
        </div>
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

      {status === "stale" && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[13px] text-foreground">
          <div className="font-semibold">Stale delayed snapshot</div>
          <p className="mt-0.5 text-muted-foreground">
            These rows are a delayed snapshot, not current market opportunities.
            {providerLabel ? ` Provider data as of ${providerLabel}.` : ""}
            {pipelineAge ? ` Pipeline refreshed ${pipelineAge}.` : ""}
          </p>
        </div>
      )}

      {showFreshness && status !== "stale" && (providerLabel || pipelineAge) && (
        <div className="text-[12px] text-muted-foreground space-y-0.5">
          {providerLabel && <div>Provider data as of {providerLabel}</div>}
          {pipelineAge && <div>Pipeline refreshed {pipelineAge}</div>}
        </div>
      )}

      <ScreenerTable
        tab={activeTab}
        isPro={isPro}
        rows={rows}
        status={status}
      />
    </div>
  );
}
