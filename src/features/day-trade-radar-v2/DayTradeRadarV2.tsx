import { useEffect, useMemo, useRef, useState } from "react";
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
import { RadarDetailPanel } from "./RadarDetailPanel";
import { MultiRadarWorkspace } from "./MultiRadarWorkspace";
import { RadarRepeatMoversSection } from "./RadarRepeatMoversSection";
import { REPEAT_MOVERS_IDLE } from "@/lib/radar/repeat-movers-load-state";
import { isRadarRowAccessible } from "./radar-metrics";
import type { RadarRankedRow } from "./types";
import type { ScreenerResultRow } from "@/lib/screeners/contract";

export function DayTradeRadarV2({
  rows,
  status,
  isPro,
  syncedAt,
  providerAsOfMax,
  marketFeed = null,
  freeRowLimit,
  source = null,
  session = null,
  closedSnapshot = false,
  repeatMoversLoadState = REPEAT_MOVERS_IDLE,
  onRepeatMoversRetry,
}: DayTradeRadarV2Props) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [desktopDetailOpen, setDesktopDetailOpen] = useState(false);
  const [pinnedSymbol, setPinnedSymbol] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
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

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const {
    ranked,
    selection,
    activeRow,
    selectRow,
  } = useRadarSelection({
    rows: selectionRows,
    status: resolved.status,
    isPro,
    freeRowLimit,
    traderLensPresetId: "all_movers",
    traderLensBounds: { min: null, max: null },
  });

  const lensRows = useMemo(
    () => ranked.map((row, index) => ({ ...row, access_rank: index + 1 })),
    [ranked],
  );

  const activeAccessRank =
    activeRow
      ? lensRows.find((r) => r.symbol === activeRow.symbol)?.access_rank ?? activeRow.rank
      : 0;

  const chartEnabled =
    !!activeRow &&
    isRadarRowAccessible(activeAccessRank, isPro, freeRowLimit) &&
    (selection.inactive || resolved.status === "available" || resolved.status === "stale");

  const chartSymbol =
    chartEnabled && activeRow ? activeRow.symbol : null;

  const freeBlocked =
    !!activeRow &&
    !selection.inactive &&
    !isRadarRowAccessible(activeAccessRank, isPro, freeRowLimit);

  const { status: chartStatus, bars, latestBarIso, errorMessage, interval } = useRadarChartData({
    symbol: freeBlocked ? null : chartSymbol,
    enabled: !!chartSymbol && !freeBlocked,
    providerAsOfMax: resolved.providerAsOfMax,
  });

  const boardVisible =
    resolved.status === "available" || resolved.status === "stale";

  const openDetails = (row: RadarRankedRow) => {
    selectRow(row);
    setPinnedSymbol(row.symbol);
    if (isMobile) setMobileDetailOpen(true);
    else setDesktopDetailOpen(true);
  };

  const selectActive = (row: RadarRankedRow) => {
    selectRow(row);
    setPinnedSymbol(row.symbol);
  };

  const upgradeNeeded =
    !isPro && lensRows.length > freeRowLimit && boardVisible;

  const emptyMessage = useMemo(() => {
    if (resolved.status === "loading") return null;
    if (resolved.status === "unavailable") {
      return "Screener data is temporarily unavailable. No unverified rows are being shown.";
    }
    if (resolved.status === "empty" || (boardVisible && ranked.length === 0)) {
      return "No qualifying movers yet.";
    }
    return null;
  }, [resolved.status, boardVisible, ranked.length]);

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
        marketFeed={marketFeed}
        engineSource={resolved.source}
        session={source === "radar-v2" ? session : null}
      />

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

      {boardVisible && ranked.length > 0 && (
        <MultiRadarWorkspace
          rows={lensRows}
          selectedSymbol={pinnedSymbol}
          isPro={isPro}
          freeRowLimit={freeRowLimit}
          nowMs={nowMs}
          onSelect={selectActive}
          onOpenDetails={openDetails}
          closedSnapshot={closedSnapshot}
        />
      )}

      {boardVisible && ranked.length > 0 && (
        <RadarRepeatMoversSection
          loadState={repeatMoversLoadState}
          onRetry={onRepeatMoversRetry}
          onOpenDetails={(symbol) => {
            const match = lensRows.find((r) => r.symbol === symbol);
            if (match) openDetails(match);
          }}
        />
      )}

      {boardVisible && (
        <>
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

          {isMobile && mobileDetailOpen && activeRow && !freeBlocked && (
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
        </>
      )}

      {upgradeNeeded && (
        <div className="text-center pt-1">
          <button
            type="button"
            onClick={() => navigate("/pro")}
            className="text-[12px] font-semibold text-accent-blue hover:underline"
          >
            Unlock all {lensRows.length} results with Pro access →
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
