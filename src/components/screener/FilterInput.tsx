import { useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type FilterDef,
  type ActiveFilter,
  getFilterById,
} from "./filters.config";

type Props = {
  filter: ActiveFilter;
  onUpdate: (updated: ActiveFilter) => void;
  onRemove: (id: string) => void;
};

function formatDisplayValue(filter: FilterDef, active: ActiveFilter): string {
  if (filter.type === "select") {
    const opt = filter.options?.find((o) => o.value === active.value);
    return opt ? opt.label : String(active.value ?? "");
  }
  if (filter.type === "boolean") {
    return active.value ? "Yes" : "No";
  }
  if (filter.type === "range") {
    const min =
      active.min != null
        ? `${filter.prefix ?? ""}${active.min}${filter.suffix ?? ""}`
        : null;
    const max =
      active.max != null
        ? `${filter.prefix ?? ""}${active.max}${filter.suffix ?? ""}`
        : null;
    if (min && max) return `${min} – ${max}`;
    if (min) return `≥ ${min}`;
    if (max) return `≤ ${max}`;
  }
  if (filter.type === "date" && active.value) {
    return String(active.value);
  }
  return "";
}

type RangeInputProps = {
  filter: FilterDef;
  active: ActiveFilter;
  onUpdate: (updated: ActiveFilter) => void;
};

const RangeInput = ({ filter, active, onUpdate }: RangeInputProps) => {
  const [minVal, setMinVal] = useState(
    active.min != null ? String(active.min) : ""
  );
  const [maxVal, setMaxVal] = useState(
    active.max != null ? String(active.max) : ""
  );

  const commit = () => {
    onUpdate({
      ...active,
      min: minVal !== "" ? Number(minVal) : undefined,
      max: maxVal !== "" ? Number(maxVal) : undefined,
    });
  };

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        {filter.prefix && (
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
            {filter.prefix}
          </span>
        )}
        <Input
          type="number"
          value={minVal}
          onChange={(e) => setMinVal(e.target.value)}
          onBlur={commit}
          placeholder={`Min${filter.suffix ? ` (${filter.suffix})` : ""}`}
          className={cn("h-7 text-xs", filter.prefix ? "pl-5" : "")}
          min={filter.min}
          max={filter.max}
          step={filter.step}
        />
      </div>
      <span className="text-xs text-muted-foreground">–</span>
      <div className="relative flex-1">
        {filter.prefix && (
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
            {filter.prefix}
          </span>
        )}
        <Input
          type="number"
          value={maxVal}
          onChange={(e) => setMaxVal(e.target.value)}
          onBlur={commit}
          placeholder={`Max${filter.suffix ? ` (${filter.suffix})` : ""}`}
          className={cn("h-7 text-xs", filter.prefix ? "pl-5" : "")}
          min={filter.min}
          max={filter.max}
          step={filter.step}
        />
      </div>
    </div>
  );
};

type SelectInputProps = {
  filter: FilterDef;
  active: ActiveFilter;
  onUpdate: (updated: ActiveFilter) => void;
};

const SelectInput = ({ filter, active, onUpdate }: SelectInputProps) => {
  return (
    <Select
      value={active.value ? String(active.value) : undefined}
      onValueChange={(val) => onUpdate({ ...active, value: val })}
    >
      <SelectTrigger className="h-8 text-xs">
        <SelectValue placeholder="Select..." />
      </SelectTrigger>
      <SelectContent>
        {(filter.options ?? []).map((opt) => (
          <SelectItem key={opt.value} value={opt.value} className="text-xs">
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export const FilterChip = ({ filter, onUpdate, onRemove }: Props) => {
  const [open, setOpen] = useState(false);
  const def = getFilterById(filter.id);
  if (!def) return null;

  const displayValue = formatDisplayValue(def, filter);
  const hasValue = displayValue !== "";

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-xs font-medium transition-all",
          hasValue
            ? "border-accent-blue bg-blue-50 dark:bg-blue-950/30 text-accent-blue"
            : "border-border bg-background text-foreground hover:border-accent-blue"
        )}
      >
        <span>{def.label}</span>
        {hasValue && (
          <span className="text-muted-foreground font-normal">
            : <span className="text-foreground font-medium">{displayValue}</span>
          </span>
        )}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-full mt-1 z-50 w-64 bg-background border border-border rounded-lg shadow-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">
                {def.label}
              </span>
              <button
                type="button"
                onClick={() => {
                  onRemove(filter.id);
                  setOpen(false);
                }}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Remove filter"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {def.description && (
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                {def.description}
              </p>
            )}
            {def.type === "range" && (
              <RangeInput
                filter={def}
                active={filter}
                onUpdate={(u) => {
                  onUpdate(u);
                }}
              />
            )}
            {def.type === "select" && (
              <SelectInput
                filter={def}
                active={filter}
                onUpdate={(u) => {
                  onUpdate(u);
                  setOpen(false);
                }}
              />
            )}
            {def.type === "boolean" && (
              <div className="flex gap-2">
                {(["true", "false"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => {
                      onUpdate({ ...filter, value: v === "true" });
                      setOpen(false);
                    }}
                    className={cn(
                      "flex-1 h-7 rounded border text-xs font-medium transition-colors",
                      String(filter.value) === v
                        ? "border-accent-blue bg-accent-blue text-white"
                        : "border-border hover:border-accent-blue"
                    )}
                  >
                    {v === "true" ? "Yes" : "No"}
                  </button>
                ))}
              </div>
            )}
            {def.type === "date" && (
              <Input
                type="date"
                value={typeof filter.value === "string" ? filter.value : ""}
                onChange={(e) =>
                  onUpdate({ ...filter, value: e.target.value })
                }
                className="h-7 text-xs"
              />
            )}
          </div>
        </>
      )}
    </div>
  );
};

export const InlineFilterBar = ({
  activeFilters,
  onUpdate,
  onRemove,
}: {
  activeFilters: ActiveFilter[];
  onUpdate: (updated: ActiveFilter) => void;
  onRemove: (id: string) => void;
}) => {
  if (activeFilters.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {activeFilters.map((f) => (
        <FilterChip
          key={f.id}
          filter={f}
          onUpdate={onUpdate}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
};
