import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ScreenerTable } from "@/components/dashboard/ScreenerTable";
import { useScreenerData } from "@/hooks/useScreenerData";
import {
  SCREENER_TABS,
  DEFAULT_SCREENER_TAB_ID,
  getScreenerTabById,
} from "@/config/screener-tabs.config";

export default function Screeners() {
  const { profile } = useAuth();
  const isPro =
    profile?.plan === "pro" ||
    profile?.plan === "admin" ||
    profile?.plan === "unlimited";

  const [activeTabId, setActiveTabId] = useState(DEFAULT_SCREENER_TAB_ID);
  const activeTab = getScreenerTabById(activeTabId) ?? SCREENER_TABS[0];
  const { rows, loading, lastUpdated } = useScreenerData(activeTabId);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Screeners</h1>
        <p className="text-sm text-muted-foreground">
          Real-time market opportunity discovery
        </p>
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
      />
    </div>
  );
}
