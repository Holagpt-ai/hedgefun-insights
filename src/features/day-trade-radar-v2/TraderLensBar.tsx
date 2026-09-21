import { Columns3, SlidersHorizontal } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  CORE_MOMENTUM_MOVE_UNAVAILABLE_COPY,
  TRADER_LENS_PRESETS,
  type TraderLensPresetId,
} from "@/config/scanner-presets.config";
import {
  OPTIONAL_RADAR_COLUMN_IDS,
  RADAR_COLUMN_DEFINITIONS,
  REQUIRED_RADAR_COLUMN_IDS,
  futureRadarColumnLabels,
  type RadarColumnId,
} from "./radar-grid-columns";
import { traderLensShowingCopy } from "./trader-lens";
import {
  ScreenerFiltersActions,
  ScreenerFiltersFields,
} from "@/components/screener/ScreenerFiltersControl";
import {
  EMPTY_SCREENER_FILTER_DRAFT,
  type ScreenerFilterDraft,
} from "@/lib/screeners/screener-filters";

const DORMANT_FILTERS = [
  "Float",
  "Short Float",
  "Catalyst",
  "HOD Distance",
] as const;

interface TraderLensBarProps {
  presetId: TraderLensPresetId;
  minInput: string;
  maxInput: string;
  visibleCount: number;
  radarCount: number;
  visibleColumns: RadarColumnId[];
  sessionMoveUnavailable?: boolean;
  onPresetChange: (id: TraderLensPresetId) => void;
  onMinChange: (value: string) => void;
  onMaxChange: (value: string) => void;
  onReset: () => void;
  onToggleColumn: (id: RadarColumnId) => void;
  onResetColumns: () => void;
  filterDraft?: ScreenerFilterDraft;
  filterActiveCount?: number;
  onFilterChange?: (key: keyof ScreenerFilterDraft, value: string) => void;
  onClearFilters?: () => void;
}

function PriceInputs({
  minInput,
  maxInput,
  onMinChange,
  onMaxChange,
}: {
  minInput: string;
  maxInput: string;
  onMinChange: (value: string) => void;
  onMaxChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
        Price Min
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={minInput}
          onChange={(event) => onMinChange(event.target.value)}
          placeholder="—"
          className="h-8 w-[88px] rounded-md border border-border bg-background px-2 text-[12px] tabular-nums text-foreground"
          aria-label="Price min"
        />
      </label>
      <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
        Price Max
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={maxInput}
          onChange={(event) => onMaxChange(event.target.value)}
          placeholder="—"
          className="h-8 w-[88px] rounded-md border border-border bg-background px-2 text-[12px] tabular-nums text-foreground"
          aria-label="Price max"
        />
      </label>
    </div>
  );
}

export function TraderLensBar({
  presetId,
  minInput,
  maxInput,
  visibleCount,
  radarCount,
  visibleColumns,
  sessionMoveUnavailable = false,
  onPresetChange,
  onMinChange,
  onMaxChange,
  onReset,
  onToggleColumn,
  onResetColumns,
  filterDraft = EMPTY_SCREENER_FILTER_DRAFT,
  filterActiveCount = 0,
  onFilterChange = () => {},
  onClearFilters = () => {},
}: TraderLensBarProps) {
  const futureColumns = futureRadarColumnLabels();
  const defaultToggles = RADAR_COLUMN_DEFINITIONS.filter(
    (column) => column.defaultVisible && !column.required && !column.optional,
  );
  const showInlinePrice = presetId === "custom";

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-1.5 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="trader-lens-preset">
          Trader Lens preset
        </label>
        <select
          id="trader-lens-preset"
          value={presetId}
          onChange={(event) => onPresetChange(event.target.value as TraderLensPresetId)}
          className="h-8 rounded-md border border-border bg-background px-2 text-[12px] font-semibold text-foreground"
        >
          {TRADER_LENS_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>

        {showInlinePrice && (
          <PriceInputs
            minInput={minInput}
            maxInput={maxInput}
            onMinChange={onMinChange}
            onMaxChange={onMaxChange}
          />
        )}

        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] font-semibold text-foreground hover:bg-muted"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filters{filterActiveCount > 0 ? ` (${filterActiveCount})` : ""}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] p-3 space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Price
            </div>
            <PriceInputs
              minInput={minInput}
              maxInput={maxInput}
              onMinChange={onMinChange}
              onMaxChange={onMaxChange}
            />
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground pt-1">
              Filters
            </div>
            <ScreenerFiltersFields
              draft={filterDraft}
              onChange={onFilterChange}
              includePrice={false}
            />
            <ScreenerFiltersActions activeCount={filterActiveCount} onClear={onClearFilters} />
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground pt-1">
              Coming later
            </div>
            <div className="space-y-1">
              {DORMANT_FILTERS.map((label) => (
                <div key={label} className="flex items-center gap-2 text-[12px] text-muted-foreground">
                  <Checkbox disabled checked={false} aria-label={`${label} unavailable`} />
                  {label}
                  <span className="text-[10px] uppercase tracking-wide">Unavailable</span>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] font-semibold text-foreground hover:bg-muted"
            >
              <Columns3 className="h-3.5 w-3.5" />
              Columns
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-3 space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Visible columns
            </div>
            <div className="space-y-1.5">
              {defaultToggles.map((column) => (
                <label key={column.id} className="flex items-center gap-2 text-[12px]">
                  <Checkbox
                    checked={visibleColumns.includes(column.id)}
                    onCheckedChange={() => onToggleColumn(column.id)}
                    aria-label={`Toggle ${column.label}`}
                  />
                  {column.label}
                </label>
              ))}
            </div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground pt-1">
              Optional metrics
            </div>
            <div className="space-y-1.5">
              {OPTIONAL_RADAR_COLUMN_IDS.map((id) => {
                const column = RADAR_COLUMN_DEFINITIONS.find((item) => item.id === id);
                if (!column) return null;
                return (
                  <label key={id} className="flex items-center gap-2 text-[12px]">
                    <Checkbox
                      checked={visibleColumns.includes(id)}
                      onCheckedChange={() => onToggleColumn(id)}
                      aria-label={`Toggle ${column.label}`}
                    />
                    {column.label}
                  </label>
                );
              })}
            </div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground pt-1">
              Coming later
            </div>
            <div className="space-y-1">
              {futureColumns.map((column) => (
                <div key={column.id} className="flex items-center gap-2 text-[12px] text-muted-foreground">
                  <Checkbox disabled checked={false} aria-label={`${column.label} unavailable`} />
                  {column.label}
                  <span className="text-[10px] uppercase tracking-wide">Unavailable</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Rank, Symbol, and Actions stay visible. {REQUIRED_RADAR_COLUMN_IDS.length} identity columns cannot be hidden.
            </p>
            <button
              type="button"
              onClick={onResetColumns}
              className="h-8 rounded-md border border-border px-2.5 text-[12px] font-semibold hover:bg-muted"
            >
              Reset columns
            </button>
          </PopoverContent>
        </Popover>

        <button
          type="button"
          onClick={onReset}
          className="h-8 rounded-md border border-border px-2.5 text-[12px] font-semibold text-foreground hover:bg-muted"
        >
          Reset
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground tabular-nums">
        <span>{traderLensShowingCopy(visibleCount, radarCount)}</span>
        {sessionMoveUnavailable && <span>{CORE_MOMENTUM_MOVE_UNAVAILABLE_COPY}</span>}
      </div>
    </div>
  );
}
