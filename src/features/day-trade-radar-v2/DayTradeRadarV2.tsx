import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import type { DayTradeRadarV2Props } from "./types";
import { useRadarSelection } from "./useRadarSelection";
import { useRadarChartData } from "./useRadarChartData";
import { RadarStatusRail } from "./RadarStatusRail";
import { RadarGrid } from "./RadarGrid";
import { RadarMobileCard } from "./RadarMobileCard";
import { RadarDetailPanel } from "./RadarDetailPanel";
import { isRadarRowAccessible } from "./radar-metrics";

export function DayTradeRadarV2({
  rows,
  status,
  isPro,
  syncedAt,
  providerAsOfMax,
  freeRowLimit,
}: DayTradeRadarV2Props) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  const {
    ranked,
    selection,
    activeRow,
    selectRow,
    followLeader,
    returnToLeader,
    followingLeader,
  } = useRadarSelection({ rows, status, isPro, freeRowLimit });

  const chartEnabled =
    !!activeRow &&
    isRadarRowAccessible(activeRow.rank, isPro, freeRowLimit) &&
    // Inactive retained snapshots may still show chart from last verified symbol.
    (selection.inactive || status === "available" || status === "stale");

  const chartSymbol =
    chartEnabled && activeRow
      ? // Free gate: never chart a symbol the user cannot access from the board,
        // unless it's an inactive retained selection that was previously accessible.
        activeRow.symbol
      : null;

  // Harden Free: if somehow an inaccessible live row is active, block chart.
  const freeBlocked =
    !!activeRow &&
    !selection.inactive &&
    !isRadarRowAccessible(activeRow.rank, isPro, freeRowLimit);

  const { status: chartStatus, bars, latestBarIso, errorMessage } = useRadarChartData({
    symbol: freeBlocked ? null : chartSymbol,
    enabled: !!chartSymbol && !freeBlocked,
    providerAsOfMax,
  });

  const showReturnToLeader =
    selection.mode === "manual" && ranked.length > 0;

  const boardVisible =
    status === "available" || status === "stale";

  const handleSelect = (row: typeof ranked[number]) => {
    selectRow(row);
    if (isMobile) setMobileDetailOpen(true);
  };

  const upgradeNeeded =
    !isPro && ranked.length > freeRowLimit && boardVisible;

  const emptyMessage = useMemo(() => {
    if (status === "loading") return null;
    if (status === "unavailable") {
      return "Screener data is temporarily unavailable. No unverified rows are being shown.";
    }
    if (status === "empty" || (boardVisible && ranked.length === 0)) {
      return "No qualifying movers yet.";
    }
    return null;
  }, [status, boardVisible, ranked.length]);

  return (
    <div className="space-y-3">
      <RadarStatusRail
        status={status}
        qualifyingCount={boardVisible ? ranked.length : 0}
        syncedAt={syncedAt}
        providerAsOfMax={providerAsOfMax}
        followingLeader={followingLeader}
        onFollowLeader={followLeader}
        showReturnToLeader={showReturnToLeader}
        onReturnToLeader={returnToLeader}
      />

      {status === "loading" && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-8 rounded bg-muted/50 animate-pulse" />
          ))}
        </div>
      )}

      {emptyMessage && (
        <div className="rounded-lg border border-border bg-card p-10 text-center">
          <div className="text-sm font-semibold text-foreground">{emptyMessage}</div>
        </div>
      )}

      {boardVisible && ranked.length > 0 && (
        <>
          {/* Desktop command center */}
          <div className="hidden md:grid md:grid-cols-[minmax(0,1fr)_minmax(380px,420px)] gap-4 items-start">
            <RadarGrid
              rows={ranked}
              selectedSymbol={selection.selectedSymbol}
              isPro={isPro}
              freeRowLimit={freeRowLimit}
              onSelect={handleSelect}
            />
            <RadarDetailPanel
              row={freeBlocked ? null : activeRow}
              inactive={selection.inactive}
              chartStatus={freeBlocked ? "idle" : chartStatus}
              chartBars={freeBlocked ? [] : bars}
              latestBarIso={freeBlocked ? null : latestBarIso}
              chartError={freeBlocked ? null : errorMessage}
            />
          </div>

          {/* Mobile ranked cards */}
          <div className="md:hidden space-y-2">
            {ranked.map((row) => (
              <RadarMobileCard
                key={`${row.tab_id}-${row.symbol}`}
                row={row}
                selected={selection.selectedSymbol === row.symbol}
                isPro={isPro}
                freeRowLimit={freeRowLimit}
                onSelect={handleSelect}
              />
            ))}
            {mobileDetailOpen && activeRow && !freeBlocked && (
              <RadarDetailPanel
                row={activeRow}
                inactive={selection.inactive}
                chartStatus={chartStatus}
                chartBars={bars}
                latestBarIso={latestBarIso}
                chartError={errorMessage}
                mobile
                onCloseMobile={() => setMobileDetailOpen(false)}
              />
            )}
          </div>
        </>
      )}

      {upgradeNeeded && (
        <div className="text-center pt-1">
          <button
            type="button"
            onClick={() => navigate("/pro")}
            className="text-[12px] font-semibold text-accent-blue hover:underline"
          >
            Unlock all {ranked.length} results with Pro access →
          </button>
          <p className="text-xs text-muted-foreground text-center mt-2">
            Or go Unlimited for full access.
          </p>
        </div>
      )}
    </div>
  );
}

export default DayTradeRadarV2;
