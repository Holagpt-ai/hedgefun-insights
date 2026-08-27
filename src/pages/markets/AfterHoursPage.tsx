import { useState } from "react";
import { MoversTable } from "@/components/markets/MarketMoversLayout";
import { MarketMoversTabBar } from "@/components/markets/MarketMoversTabBar";
import { IndexSparklines } from "@/components/markets/IndexSparklines";
import { AdBanner } from "@/components/layout/AdBanner";
import { toast } from "@/hooks/use-toast";
import { usePageSeo } from "@/hooks/usePageSeo";
import { useAfterHoursFeed } from "@/hooks/useAfterHoursFeed";
import { parseTimestampMs } from "@/lib/screeners/contract";
import { mapAfterHoursFeed } from "@/lib/markets/movers-integrity";

const TIME_TABS = ["Today"];

function formatTs(iso: string | null): string | null {
  if (!iso) return null;
  const ms = parseTimestampMs(iso);
  if (ms === null) return null;
  return new Date(ms).toLocaleString();
}

export default function AfterHoursPage() {
  const [activeTime, setActiveTime] = useState("Today");
  const view = useAfterHoursFeed();

  const handleTimeTab = (t: string) => {
    if (t !== "Today") {
      toast({ title: "Coming Soon", description: `${t} data will be available in a future update.` });
      return;
    }
    setActiveTime(t);
  };

  usePageSeo({
    title: "After-Hours Stock Movers | HedgeFun",
    description: "Track after-hours stock price movements classified from the full-market provider snapshot on HedgeFun.",
  });

  const providerLabel = formatTs(view.providerAsOfMax);
  const isLoading = view.status === "loading";
  const statusLabel =
    view.status === "available"
      ? "Available"
      : view.status === "empty"
        ? "Empty — no verified after-hours movers for this session"
        : view.status === "stale"
          ? "Stale — last validated generation is being shown"
          : view.status === "unavailable"
            ? "Unavailable — no unverified movers are being shown"
            : "Loading";

  return (
    <div className="w-full">
      <MarketMoversTabBar />
      <div className="max-w-7xl mx-auto px-4 py-6">
        <h1 className="text-[1.75rem] font-bold mb-4 text-foreground">After-Hours Movers</h1>

        <div className="flex items-center gap-1 mb-6 overflow-x-auto">
          {TIME_TABS.map((t) => (
            <button
              key={t}
              onClick={() => handleTimeTab(t)}
              className="text-[0.875rem] px-3.5 py-1.5 rounded transition-colors whitespace-nowrap"
              style={
                activeTime === t
                  ? { background: "hsl(var(--foreground))", color: "hsl(var(--background))", fontWeight: 600 }
                  : { color: "hsl(var(--muted-foreground))" }
              }
            >
              {t}
            </button>
          ))}
        </div>

        <IndexSparklines />

        <div className="w-full flex flex-col items-center border-b border-border bg-surface py-1 mb-4">
          <AdBanner slot="top" />
        </div>

        <div className="mb-4 text-[13px] text-muted-foreground space-y-0.5">
          <div>Status: {statusLabel}</div>
          {view.sessionDate && <div>Session date: {view.sessionDate}</div>}
          {providerLabel && <div>Provider data as of {providerLabel}</div>}
        </div>

        <MoversTable
          sectionTitle="After-Hours Gainers"
          rows={mapAfterHoursFeed(view.gainers, { sort: "percent_desc" })}
          isLoading={isLoading}
          defaultSortDesc={true}
          colorMode="green"
        />

        <div className="my-6 border-t border-border" />

        <MoversTable
          sectionTitle="After-Hours Losers"
          rows={mapAfterHoursFeed(view.losers, { sort: "percent_asc" })}
          isLoading={isLoading}
          defaultSortDesc={false}
          colorMode="red"
        />

        <p className="text-xs text-muted-foreground mt-4">
          Results are classified from the full-market U.S. equities snapshot. After-hours last is
          the newest independently paired last-trade or minute close versus that session’s regular
          close. This page never fabricates movers and does not use provider day-change percentages.
        </p>

        <div className="w-full flex flex-col items-center border-t border-border bg-surface py-1 mt-8">
          <AdBanner slot="bottom" />
        </div>
      </div>
    </div>
  );
}
