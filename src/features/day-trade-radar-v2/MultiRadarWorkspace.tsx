import { useEffect, useMemo, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { ActiveSymbolRail } from "./ActiveSymbolRail";
import { HaltsRail } from "./HaltsRail";
import { authoritativeDayTradeLeader } from "./day-trade-desk";
import { DAY_TRADE_RADAR_MAX_ROWS } from "./day-trade-strategy";
import {
  canonicalizePanelColumns,
  defaultWorkspaceState,
  loadWorkspaceState,
  panelMeta,
  qualifyPanelRows,
  rowMatchesPanelFilters,
  selectPanelLeader,
  sortPanelRows,
  type PanelColumnId,
  type PanelFilterDraft,
  type PanelSortId,
  type PennyPriceBandId,
  type RadarPanelId,
  type MultiRadarWorkspaceState,
} from "./multi-radar";
import { CLOSED_RADAR_SNAPSHOT_STATUS } from "@/lib/screeners/radar-closed-snapshot";
import { RadarPanelBoard } from "./RadarPanelBoard";
import {
  monitoringStates,
  type DayTradeQualificationStateRow,
} from "@/lib/day-trade/qualification-lifecycle-client";
import {
  formatQualifiedMonitoringSubtitle,
  mergeRankedRowWithQualificationState,
  qualifiedPanelMetaLine,
} from "@/lib/day-trade/build-qualified-panel-rows";
import type { RadarRankedRow } from "./types";
import { CarryoverWatchPanel } from "./CarryoverWatchPanel";

const PANELS: RadarPanelId[] = ["day_trade", "day_trade_qualified", "breakouts", "penny", "carryover"];

function persist(state: MultiRadarWorkspaceState) {
  try {
    window.localStorage.setItem("stocksist.day-trade-radar.workspace.v1", JSON.stringify(state));
  } catch {
    // Private mode keeps the desk in memory.
  }
}

export function MultiRadarWorkspace({
  rows,
  dayTradeRows,
  dayTradeEmptyMessage,
  selectedSymbol,
  isPro,
  freeRowLimit,
  nowMs,
  onSelect,
  onOpenDetails,
  closedSnapshot = false,
  qualificationMonitoring = [],
  qualificationLoadError = null,
  onQualificationRetry,
  livePanelsVisible = true,
}: {
  rows: RadarRankedRow[];
  /** Authoritative Day Trade Top-10 (may be []). Never falls back to the Radar universe. */
  dayTradeRows: readonly RadarRankedRow[];
  qualificationMonitoring?: readonly DayTradeQualificationStateRow[];
  qualificationLoadError?: Error | null;
  onQualificationRetry?: () => void;
  dayTradeEmptyMessage?: string;
  selectedSymbol: string | null;
  isPro: boolean;
  freeRowLimit: number;
  nowMs: number;
  onSelect: (row: RadarRankedRow) => void;
  onOpenDetails: (row: RadarRankedRow) => void;
  closedSnapshot?: boolean;
  /** False when today's board is empty or unavailable. Carryover still renders. */
  livePanelsVisible?: boolean;
}) {
  const isMobile = useIsMobile();
  const [workspace, setWorkspace] = useState<MultiRadarWorkspaceState>(defaultWorkspaceState);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setWorkspace(loadWorkspaceState(window.localStorage));
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    persist(workspace);
  }, [workspace, ready]);

  const updatePanel = (id: RadarPanelId, patch: Partial<MultiRadarWorkspaceState["panels"][RadarPanelId]>) => {
    setWorkspace((current) => ({
      ...current,
      panels: { ...current.panels, [id]: { ...current.panels[id], ...patch } },
    }));
  };

  const views = useMemo(() => {
    const rankedBySymbol = new Map(rows.map((row) => [row.symbol, row]));
    const activeDeskSymbols = new Set(
      dayTradeRows.map((row) => row.symbol.trim().toUpperCase()),
    );
    const monitoringExclusive = monitoringStates(qualificationMonitoring, activeDeskSymbols);
    return PANELS.map((id) => {
      const state = workspace.panels[id];
      const qualified =
        id === "day_trade"
          ? dayTradeRows.slice(0, DAY_TRADE_RADAR_MAX_ROWS)
          : id === "day_trade_qualified"
          ? monitoringExclusive.map((item, index) => {
              const merged = mergeRankedRowWithQualificationState(
                rankedBySymbol.get(item.symbol),
                item,
              );
              return {
                ...merged,
                rank: index + 1,
                access_rank: index + 1,
                qualification_monitoring: true,
                qualification_expired_at: item.pillar_expired_at,
              } as RadarRankedRow;
            })
          : qualifyPanelRows(rows, id, state.priceBand, nowMs);
      const filtered = qualified.filter((row) => rowMatchesPanelFilters(row, state.filters));
      const sorted = sortPanelRows(filtered, id, state.sort);
      const leader =
        id === "day_trade"
          ? authoritativeDayTradeLeader(dayTradeRows)
          : id === "day_trade_qualified"
          ? sorted[0] ?? null
          : selectPanelLeader(id, filtered, nowMs);
      const qualifiedSubtitle =
        id === "day_trade_qualified" && monitoringExclusive[0]
          ? formatQualifiedMonitoringSubtitle(monitoringExclusive[0])
          : undefined;
      const qualifiedMeta =
        id === "day_trade_qualified" && monitoringExclusive[0]
          ? qualifiedPanelMetaLine(monitoringExclusive[0])
          : undefined;
      return {
        id,
        rows: sorted,
        leader,
        state,
        emptyMessage:
          id === "day_trade"
            ? dayTradeEmptyMessage
            : id === "day_trade_qualified"
            ? sorted.length === 0
              ? "No previously qualified names in monitoring."
              : undefined
            : undefined,
        subtitleOverride: qualifiedSubtitle,
        metaLine: qualifiedMeta,
      };
    });
  }, [rows, dayTradeRows, qualificationMonitoring, workspace, nowMs, dayTradeEmptyMessage]);

  const panelIds = livePanelsVisible ? PANELS : (["carryover"] as RadarPanelId[]);
  const activeMobile = panelIds.includes(workspace.mobilePanel) ? workspace.mobilePanel : "carryover";
  const visible = (isMobile ? views.filter((view) => view.id === activeMobile) : views)
    .filter((view) => panelIds.includes(view.id));

  return (
    <div data-testid="multi-radar-workspace" className="min-w-0 space-y-2 overflow-x-hidden">
      <div className="text-[11px] font-semibold tracking-wide text-muted-foreground">{workspace.desk}</div>
      {closedSnapshot ? (
        <p className="text-[11px] text-muted-foreground" data-testid="closed-radar-snapshot-status">
          {CLOSED_RADAR_SNAPSHOT_STATUS}
        </p>
      ) : null}
      {qualificationLoadError ? (
        <div
          className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[11px] text-destructive"
          data-testid="day-trade-qualified-load-error"
        >
          Monitoring data could not be loaded.{" "}
          {onQualificationRetry ? (
            <button type="button" className="underline font-semibold" onClick={onQualificationRetry}>
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
      <HaltsRail />
      <ActiveSymbolRail
        symbol={selectedSymbol}
        onDetails={() => {
          const row = rows.find((item) => item.symbol === selectedSymbol);
          if (row) onOpenDetails(row);
        }}
      />
      {isMobile ? (
        <div role="tablist" aria-label="Radar panels" className="flex gap-1 overflow-x-auto pb-1" data-testid="radar-mobile-tabs">
          {panelIds.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeMobile === id}
              className={`min-h-11 h-11 shrink-0 rounded-md border px-3 text-[11px] font-semibold ${
                activeMobile === id ? "border-accent-blue bg-accent-blue text-white" : "border-border"
              }`}
              onClick={() => setWorkspace((current) => ({ ...current, mobilePanel: id }))}
            >
              {id === "penny"
                ? "Penny < $1"
                : id === "day_trade_qualified"
                ? "Qualified"
                : id === "carryover"
                ? "Carryover"
                : panelMeta(id).title}
            </button>
          ))}
        </div>
      ) : null}
      <div className={isMobile ? "space-y-2" : "flex flex-col gap-3"} data-testid={isMobile ? "radar-mobile-board" : "radar-desktop-stack"}>
        {visible.map((view) => view.id === "carryover" ? (
          <CarryoverWatchPanel key={view.id} nowMs={nowMs} />
        ) : (
          <RadarPanelBoard
            key={view.id}
            panel={view.id}
            rows={view.rows}
            leader={view.leader}
            layout={isMobile ? "cards" : "table"}
            columns={view.state.columns}
            sort={view.state.sort}
            filters={view.state.filters}
            priceBand={view.state.priceBand}
            selectedSymbol={selectedSymbol}
            isPro={isPro}
            freeRowLimit={freeRowLimit}
            nowMs={nowMs}
            onSelect={onSelect}
            onOpenDetails={onOpenDetails}
            onSort={(sort: PanelSortId) => updatePanel(view.id, { sort })}
            onFilters={(filters: PanelFilterDraft) => updatePanel(view.id, { filters })}
            onToggleColumn={(column: PanelColumnId) => {
              const next = view.state.columns.includes(column)
                ? view.state.columns.filter((id) => id !== column)
                : [...view.state.columns, column];
              updatePanel(view.id, { columns: canonicalizePanelColumns(next) });
            }}
            onPriceBand={(priceBand: PennyPriceBandId) => updatePanel(view.id, { priceBand })}
            closedSnapshot={closedSnapshot}
            emptyMessage={view.emptyMessage}
            subtitleOverride={"subtitleOverride" in view ? view.subtitleOverride : undefined}
            metaLine={"metaLine" in view ? view.metaLine : undefined}
          />
        ))}
      </div>
    </div>
  );
}
