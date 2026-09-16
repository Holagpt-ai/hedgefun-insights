import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { useRadarV22Board } from "@/hooks/useRadarV22Board";
import { easternDate } from "@/lib/radar-v22";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { resolveDayTradeRadarSource } from "./radar-source-precedence";
import type { DayTradeRadarV2Props } from "./types";
import { useRadarSelection } from "./useRadarSelection";
import { useRadarChartData } from "./useRadarChartData";
import { RadarStatusRail } from "./RadarStatusRail";
import { RadarGrid } from "./RadarGrid";
import { RadarMobileCard } from "./RadarMobileCard";
import { RadarDetailPanel } from "./RadarDetailPanel";
import { RadarLeaderStrip } from "./RadarLeaderStrip";
import { TraderLensBar } from "./TraderLensBar";
import { applyTraderLensFilter } from "./trader-lens";
import { useTraderLens } from "./useTraderLens";
import { useRadarColumnVisibility } from "./useRadarColumnVisibility";
import { isRadarRowAccessible } from "./radar-metrics";
import type { RadarRankedRow } from "./types";
import type { ScreenerResultRow } from "@/lib/screeners/contract";

export function DayTradeRadarV2({
  rows,
  status,
  isPro,
  syncedAt,
  providerAsOfMax,
  freeRowLimit,
  source = null,
  session = null,
}: DayTradeRadarV2Props) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [desktopDetailOpen, setDesktopDetailOpen] = useState(false);
  const v22 = useRadarV22Board();
  const adoptedSessionRef = useRef<string | null>(null);
  const todayEt = easternDate(Date.now());

  const resolved = resolveDayTradeRadarSource({
    source,
    todayEt,
    adoptedSession: adoptedSessionRef.current,
    v21: { rows, status, syncedAt, providerAsOfMax },
    v22,
  });
  adoptedSessionRef.current = resolved.adoptedSession;

  const selectionRows = resolved.rows as ScreenerResultRow[];

  const {
    ranked,
    selection,
    activeRow,
    selectRow,
    followLeader,
    returnToLeader,
    followingLeader,
  } = useRadarSelection({
    rows: selectionRows,
    status: resolved.status,
    isPro,
    freeRowLimit,
  });

  const traderLens = useTraderLens();
  const { visibleColumns, toggleColumn, resetColumns } = useRadarColumnVisibility();
  const lens = useMemo(
    () => applyTraderLensFilter(ranked, traderLens.presetId, traderLens.bounds),
    [ranked, traderLens.presetId, traderLens.bounds],
  );
  const filtered = lens.rows;
  const leaderRow = ranked[0] ?? null;

  const chartEnabled =
    !!activeRow &&
    isRadarRowAccessible(activeRow.rank, isPro, freeRowLimit) &&
    (selection.inactive || resolved.status === "available" || resolved.status === "stale");

  const chartSymbol =
    chartEnabled && activeRow ? activeRow.symbol : null;

  const freeBlocked =
    !!activeRow &&
    !selection.inactive &&
    !isRadarRowAccessible(activeRow.rank, isPro, freeRowLimit);

  const { status: chartStatus, bars, latestBarIso, errorMessage, interval } = useRadarChartData({
    symbol: freeBlocked ? null : chartSymbol,
    enabled: !!chartSymbol && !freeBlocked,
    providerAsOfMax: resolved.providerAsOfMax,
  });

  const showReturnToLeader =
    selection.mode === "manual" && ranked.length > 0;

  const boardVisible =
    resolved.status === "available" || resolved.status === "stale";

  const openDetails = (row: RadarRankedRow) => {
    selectRow(row);
    if (isMobile) setMobileDetailOpen(true);
    else setDesktopDetailOpen(true);
  };

  const handleSelect = (row: RadarRankedRow) => {
    openDetails(row);
  };

  const openLeaderDetails = () => {
    if (!leaderRow) return;
    if (!isRadarRowAccessible(leaderRow.rank, isPro, freeRowLimit)) return;
    openDetails(leaderRow);
  };

  const upgradeNeeded =
    !isPro && ranked.length > freeRowLimit && boardVisible;

  const emptyMessage = useMemo(() => {
    if (resolved.status === "loading") return null;
    if (resolved.status === "unavailable") {
      return "Screener data is temporarily unavailable. No unverified rows are being shown.";
    }
    if (resolved.status === "empty" || (boardVisible && ranked.length === 0)) {
      return "No qualifying movers yet.";
    }
    if (boardVisible && ranked.length > 0 && filtered.length === 0) {
      return "No Radar candidates in this Trader Lens price range.";
    }
    return null;
  }, [resolved.status, boardVisible, ranked.length, filtered.length]);

  const detailPanel = (
    <RadarDetailPanel
      row={freeBlocked ? null : activeRow}
      inactive={selection.inactive}
      chartStatus={freeBlocked ? "idle" : chartStatus}
      chartBars={freeBlocked ? [] : bars}
      latestBarIso={freeBlocked ? null : latestBarIso}
      chartError={freeBlocked ? null : errorMessage}
      chartInterval={freeBlocked ? null : interval}
    />
  );

  return (
    <div className="space-y-2">
      <RadarStatusRail
        status={resolved.status}
        qualifyingCount={boardVisible ? ranked.length : 0}
        syncedAt={resolved.syncedAt}
        providerAsOfMax={resolved.providerAsOfMax}
        engineSource={resolved.source}
        session={source === "radar-v2" ? session : null}
      />

      {boardVisible && ranked.length > 0 && (
        <TraderLensBar
          presetId={traderLens.presetId}
          minInput={traderLens.customMinInput}
          maxInput={traderLens.customMaxInput}
          visibleCount={filtered.length}
          radarCount={ranked.length}
          visibleColumns={visibleColumns}
          sessionMoveUnavailable={lens.sessionMoveUnavailable}
          onPresetChange={traderLens.selectPreset}
          onMinChange={traderLens.setMinInput}
          onMaxChange={traderLens.setMaxInput}
          onReset={traderLens.resetLens}
          onToggleColumn={toggleColumn}
          onResetColumns={resetColumns}
        />
      )}

      {boardVisible && leaderRow && (
        <RadarLeaderStrip
          row={leaderRow}
          followingLeader={followingLeader}
          showReturnToLeader={showReturnToLeader}
          isPro={isPro}
          freeRowLimit={freeRowLimit}
          onFollowLeader={followLeader}
          onReturnToLeader={returnToLeader}
          onOpenDetails={openLeaderDetails}
        />
      )}

      {resolved.status === "loading" && (
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

      {boardVisible && filtered.length > 0 && (
        <>
          <div className="hidden md:block min-w-0">
            <RadarGrid
              rows={filtered}
              selectedSymbol={selection.selectedSymbol}
              isPro={isPro}
              freeRowLimit={freeRowLimit}
              onSelect={handleSelect}
              visibleColumns={visibleColumns}
            />
          </div>

          <Sheet open={!isMobile && desktopDetailOpen} onOpenChange={setDesktopDetailOpen}>
            <SheetContent
              side="right"
              data-testid="radar-detail-drawer"
              className="w-full overflow-y-auto p-0 sm:max-w-[440px]"
            >
              <SheetTitle className="sr-only">Radar detail</SheetTitle>
              <SheetDescription className="sr-only">
                Radar candidate detail, chart, catalyst, and handoffs
              </SheetDescription>
              {detailPanel}
            </SheetContent>
          </Sheet>

          <div className="md:hidden space-y-2" data-testid="radar-mobile-board">
            {filtered.map((row) => (
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
                chartInterval={interval}
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
