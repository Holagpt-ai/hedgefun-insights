import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ScreenerTable } from "@/components/dashboard/ScreenerTable";
import { useScreenerData } from "@/hooks/useScreenerData";
import {
  SCREENER_TABS,
  DEFAULT_SCREENER_TAB_ID,
  getScreenerTabById,
} from "@/config/screener-tabs.config";
import { hasProAccess } from "@/lib/entitlement";
import { isRadarV2BackedTab } from "@/lib/screeners/radar-v2-adapter";
import { isRadarDebugEnabled } from "@/lib/screeners/radar-v2-diagnostics";
import { DayTradeRadarV2 } from "@/features/day-trade-radar-v2/DayTradeRadarV2";
import { RadarDebugPanel } from "@/features/day-trade-radar-v2/RadarDebugPanel";
import { MarketDataStatus } from "@/components/screener/MarketDataStatus";

const RADAR_BACKED_REFRESH_MS = 60_000;

export default function Screeners() {
  const { profile } = useAuth();
  const isPro = hasProAccess(profile?.plan);
  const [searchParams] = useSearchParams();
  const radarDebug = isRadarDebugEnabled(searchParams);

  const [activeTabId, setActiveTabId] = useState(DEFAULT_SCREENER_TAB_ID);
  const activeTab = getScreenerTabById(activeTabId) ?? SCREENER_TABS[0];
  const isDayTradeRadar = activeTabId === "day_trade_radar";
  const isRadarBacked = isRadarV2BackedTab(activeTabId);

  const {
    status,
    rows,
    syncedAt,
    providerAsOfMax,
    marketFeed,
    source,
    session,
    radarDiagnostic,
    truthState,
    repeatMoversLoadState,
    refetch,
  } = useScreenerData(activeTabId, {
    refreshIntervalMs: isRadarBacked ? RADAR_BACKED_REFRESH_MS : undefined,
    pauseWhenHidden: true,
  });

  const showPageDataStatus =
    !isDayTradeRadar &&
    (status === "available" || status === "stale" || status === "loading");

  return (
    <div className="p-3 md:p-5 space-y-2.5">
      <div className="space-y-1.5">
        <h1 className="text-xl md:text-2xl font-bold text-foreground">Screeners</h1>
      </div>

      <div className="flex gap-1 border-b border-border overflow-x-auto pb-0.5">
        {SCREENER_TABS.map((tab) => {
          const active = tab.id === activeTabId;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={`whitespace-nowrap px-2.5 py-1.5 text-[13px] font-medium border-b-2 transition-colors duration-200 ${
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

      {showPageDataStatus && (
        <MarketDataStatus
          status={status}
          syncedAt={syncedAt}
          providerAsOfMax={providerAsOfMax}
          marketFeed={marketFeed}
        />
      )}

      {status === "stale" && !isDayTradeRadar && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[13px] text-foreground">
          <div className="font-semibold">Stale delayed snapshot</div>
          <p className="mt-0.5 text-muted-foreground">
            These rows are a delayed snapshot, not current market opportunities.
          </p>
        </div>
      )}

      {radarDebug && (
        <RadarDebugPanel diagnostic={radarDiagnostic ?? null} syncedAt={syncedAt} />
      )}

      {isDayTradeRadar ? (
        <DayTradeRadarV2
          rows={rows}
          status={status}
          isPro={isPro}
          syncedAt={syncedAt}
          providerAsOfMax={providerAsOfMax}
          marketFeed={marketFeed}
          freeRowLimit={activeTab.freeRowLimit}
          source={source}
          session={session}
          repeatMoversLoadState={repeatMoversLoadState}
          onRepeatMoversRetry={refetch}
        />
      ) : (
        <ScreenerTable
          tab={activeTab}
          isPro={isPro}
          rows={rows}
          status={status}
          source={source}
          session={session}
          truthState={truthState}
        />
      )}
    </div>
  );
}
