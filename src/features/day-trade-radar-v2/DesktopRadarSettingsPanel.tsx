import { Checkbox } from "@/components/ui/checkbox";
import {
  PANEL_COLUMN_DEFS,
  PENNY_PRICE_BANDS,
  panelMeta,
  type PanelColumnId,
  type PanelFilterDraft,
  type PanelSortId,
  type PanelWorkspaceState,
  type PennyPriceBandId,
  type RadarPanelId,
} from "./multi-radar";

const SORTS: { id: PanelSortId; label: string }[] = [
  { id: "rank", label: "Rank" },
  { id: "volume_speed", label: "Volume speed" },
  { id: "move", label: "Move %" },
  { id: "time", label: "Trigger time" },
];

const CONFIGURABLE_PANELS: RadarPanelId[] = [
  "day_trade",
  "day_trade_qualified",
  "breakouts",
  "penny",
  "carryover",
];

function FilterField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-[11px] text-muted-foreground">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-0.5 h-8 w-full rounded-md border border-border bg-background px-2 text-[12px] text-foreground"
      />
    </label>
  );
}

interface DesktopRadarSettingsPanelProps {
  panels: Record<RadarPanelId, PanelWorkspaceState>;
  onPatchPanel: (id: RadarPanelId, patch: Partial<PanelWorkspaceState>) => void;
  onToggleColumn: (id: RadarPanelId, column: PanelColumnId) => void;
}

export function DesktopRadarSettingsPanel({
  panels,
  onPatchPanel,
  onToggleColumn,
}: DesktopRadarSettingsPanelProps) {
  return (
    <div className="space-y-3" data-testid="desktop-radar-settings">
      <p className="text-[11px] text-muted-foreground px-1">
        Scanner table layout and filters persist per panel. Changes apply across workspace tabs.
      </p>
      {CONFIGURABLE_PANELS.map((panelId) => {
        const state = panels[panelId];
        const meta = panelMeta(panelId);
        return (
          <details
            key={panelId}
            className="rounded-lg border border-border bg-card px-3 py-2"
            data-testid={`desktop-radar-settings-${panelId}`}
          >
            <summary className="cursor-pointer select-none text-[13px] font-semibold">{meta.title}</summary>
            <div className="mt-3 space-y-3 pb-1">
              <label className="block text-[11px] text-muted-foreground">
                Sort
                <select
                  className="mt-0.5 h-8 w-full rounded-md border border-border bg-background px-2 text-[12px]"
                  value={state.sort}
                  onChange={(event) =>
                    onPatchPanel(panelId, { sort: event.target.value as PanelSortId })
                  }
                >
                  {SORTS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {panelId === "penny" ? (
                <label className="block text-[11px] text-muted-foreground">
                  Penny price band
                  <select
                    className="mt-0.5 h-8 w-full rounded-md border border-border bg-background px-2 text-[12px]"
                    value={state.priceBand}
                    onChange={(event) =>
                      onPatchPanel(panelId, { priceBand: event.target.value as PennyPriceBandId })
                    }
                  >
                    {PENNY_PRICE_BANDS.map((band) => (
                      <option key={band.id} value={band.id}>
                        {band.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <FilterField
                  label="Min price"
                  value={state.filters.minPrice}
                  onChange={(minPrice) =>
                    onPatchPanel(panelId, { filters: { ...state.filters, minPrice } })
                  }
                />
                <FilterField
                  label="Max price"
                  value={state.filters.maxPrice}
                  onChange={(maxPrice) =>
                    onPatchPanel(panelId, { filters: { ...state.filters, maxPrice } })
                  }
                />
                <FilterField
                  label="Min volume"
                  value={state.filters.minVolume}
                  onChange={(minVolume) =>
                    onPatchPanel(panelId, { filters: { ...state.filters, minVolume } })
                  }
                />
                <FilterField
                  label="Min move %"
                  value={state.filters.minMovePct}
                  onChange={(minMovePct) =>
                    onPatchPanel(panelId, { filters: { ...state.filters, minMovePct } })
                  }
                />
              </div>
              <div>
                <div className="text-[11px] font-semibold text-muted-foreground mb-1">Columns</div>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {PANEL_COLUMN_DEFS.map((column) => (
                    <label key={column.id} className="flex items-center gap-1.5 text-[11px]">
                      <Checkbox
                        checked={state.columns.includes(column.id)}
                        disabled={column.required}
                        onCheckedChange={() => onToggleColumn(panelId, column.id)}
                      />
                      {column.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </details>
        );
      })}
    </div>
  );
}
