import { useEffect, useMemo, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { ActiveSymbolRail } from "./ActiveSymbolRail";
import { HaltsRail } from "./HaltsRail";
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
import type { RadarRankedRow } from "./types";

const PANELS: RadarPanelId[] = ["day_trade", "breakouts", "penny"];

function persist(state: MultiRadarWorkspaceState) {
  try {
    window.localStorage.setItem("stocksist.day-trade-radar.workspace.v1", JSON.stringify(state));
  } catch {
    // Private mode keeps the desk in memory.
  }
}

export function MultiRadarWorkspace({
  rows,
  selectedSymbol,
  isPro,
  freeRowLimit,
  nowMs,
  onSelect,
  onOpenDetails,
  closedSnapshot = false,
}: {
  rows: RadarRankedRow[];
  selectedSymbol: string | null;
  isPro: boolean;
  freeRowLimit: number;
  nowMs: number;
  onSelect: (row: RadarRankedRow) => void;
  onOpenDetails: (row: RadarRankedRow) => void;
  closedSnapshot?: boolean;
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
    return PANELS.map((id) => {
      const state = workspace.panels[id];
      const qualified = qualifyPanelRows(rows, id, state.priceBand);
      const filtered = qualified.filter((row) => rowMatchesPanelFilters(row, state.filters));
      const sorted = sortPanelRows(filtered, id, state.sort);
      return {
        id,
        rows: sorted,
        leader: selectPanelLeader(id, filtered),
        state,
      };
    });
  }, [rows, workspace]);

  const visible = isMobile ? views.filter((view) => view.id === workspace.mobilePanel) : views;

  return (
    <div data-testid="multi-radar-workspace" className="min-w-0 space-y-2 overflow-x-hidden">
      <div className="text-[11px] font-semibold tracking-wide text-muted-foreground">{workspace.desk}</div>
      {closedSnapshot ? (
        <p className="text-[11px] text-muted-foreground" data-testid="closed-radar-snapshot-status">
          {CLOSED_RADAR_SNAPSHOT_STATUS}
        </p>
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
        <div role="tablist" aria-label="Radar panels" className="flex gap-1" data-testid="radar-mobile-tabs">
          {PANELS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={workspace.mobilePanel === id}
              className={`h-8 flex-1 rounded-md border px-2 text-[11px] font-semibold ${
                workspace.mobilePanel === id ? "border-accent-blue bg-accent-blue text-white" : "border-border"
              }`}
              onClick={() => setWorkspace((current) => ({ ...current, mobilePanel: id }))}
            >
              {id === "penny" ? "Penny < $1" : panelMeta(id).title}
            </button>
          ))}
        </div>
      ) : null}
      <div className={isMobile ? "space-y-2" : "flex flex-col gap-3"} data-testid={isMobile ? "radar-mobile-board" : "radar-desktop-stack"}>
        {visible.map((view) => (
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
          />
        ))}
      </div>
    </div>
  );
}
