import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { ScreenerFilterDraft } from "@/lib/screeners/screener-filters";

const INPUT_CLASS =
  "h-8 w-[88px] min-w-0 rounded-md border border-border bg-background px-2 text-[12px] tabular-nums text-foreground";

interface FilterNumberInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

function FilterNumberInput({ label, value, onChange }: FilterNumberInputProps) {
  return (
    <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
      <span className="whitespace-nowrap">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="—"
        className={INPUT_CLASS}
        aria-label={label}
      />
    </label>
  );
}

interface ScreenerFiltersFieldsProps {
  draft: ScreenerFilterDraft;
  onChange: (key: keyof ScreenerFilterDraft, value: string) => void;
  includePrice?: boolean;
}

export function ScreenerFiltersFields({
  draft,
  onChange,
  includePrice = true,
}: ScreenerFiltersFieldsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {includePrice && (
        <>
          <FilterNumberInput
            label="Min Price"
            value={draft.minPrice}
            onChange={(value) => onChange("minPrice", value)}
          />
          <FilterNumberInput
            label="Max Price"
            value={draft.maxPrice}
            onChange={(value) => onChange("maxPrice", value)}
          />
        </>
      )}
      <FilterNumberInput
        label="Min Volume"
        value={draft.minVolume}
        onChange={(value) => onChange("minVolume", value)}
      />
      <FilterNumberInput
        label="Min $ Volume"
        value={draft.minDollarVolume}
        onChange={(value) => onChange("minDollarVolume", value)}
      />
      <FilterNumberInput
        label="Min Move %"
        value={draft.minMovePct}
        onChange={(value) => onChange("minMovePct", value)}
      />
      <FilterNumberInput
        label="Min RVOL 20D"
        value={draft.minRvol20d}
        onChange={(value) => onChange("minRvol20d", value)}
      />
    </div>
  );
}

interface ScreenerFiltersActionsProps {
  activeCount: number;
  onClear: () => void;
}

export function ScreenerFiltersActions({ activeCount, onClear }: ScreenerFiltersActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onClear}
        className="h-8 rounded-md border border-border px-2.5 text-[12px] font-semibold text-foreground hover:bg-muted"
      >
        Clear Filters
      </button>
      {activeCount > 0 && (
        <span className="text-[11px] text-muted-foreground tabular-nums" data-testid="active-filter-count">
          {activeCount} active
        </span>
      )}
    </div>
  );
}

interface ScreenerFiltersControlProps {
  draft: ScreenerFilterDraft;
  activeCount: number;
  onChange: (key: keyof ScreenerFilterDraft, value: string) => void;
  onClear: () => void;
  includePrice?: boolean;
}

export function ScreenerFiltersControl({
  draft,
  activeCount,
  onChange,
  onClear,
  includePrice = true,
}: ScreenerFiltersControlProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <div className="hidden md:flex flex-wrap items-center gap-2">
        <ScreenerFiltersFields draft={draft} onChange={onChange} includePrice={includePrice} />
        <ScreenerFiltersActions activeCount={activeCount} onClear={onClear} />
      </div>

      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] font-semibold text-foreground hover:bg-muted"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters{activeCount > 0 ? ` (${activeCount})` : ""}
        </button>
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto p-4">
            <SheetTitle className="text-sm">Filters</SheetTitle>
            <SheetDescription className="text-[12px] text-muted-foreground">
              Visibility only. Discovery Rank stays the same.
            </SheetDescription>
            <div className="mt-3 space-y-3">
              <ScreenerFiltersFields draft={draft} onChange={onChange} includePrice={includePrice} />
              <ScreenerFiltersActions activeCount={activeCount} onClear={onClear} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
