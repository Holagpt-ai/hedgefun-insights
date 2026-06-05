import { useState, useMemo } from "react";
import { X, Search, Lock, Clock, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FILTERS,
  FILTER_GROUPS,
  getFiltersByGroup,
  type FilterDef,
  type FilterGroup,
  type ActiveFilter,
} from "./filters.config";

type Props = {
  open: boolean;
  onClose: () => void;
  activeFilters: ActiveFilter[];
  onApply: (filters: ActiveFilter[]) => void;
  userTier: "free" | "pro" | "unlimited";
};

export const FilterModal = ({ open, onClose, activeFilters, onApply, userTier }: Props) => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<FilterGroup>("Most Popular");
  const [pending, setPending] = useState<Set<string>>(
    () => new Set(activeFilters.map((f) => f.id))
  );

  const isPro = userTier === "pro" || userTier === "unlimited";

  const filteredFilters = useMemo(() => {
    if (!search.trim()) return getFiltersByGroup(selectedGroup);
    const q = search.toLowerCase();
    return FILTERS.filter(
      (f) =>
        f.label.toLowerCase().includes(q) ||
        f.group.toLowerCase().includes(q) ||
        f.description?.toLowerCase().includes(q)
    );
  }, [search, selectedGroup]);

  const toggleFilter = (filter: FilterDef) => {
    if (filter.tier === "coming_soon") return;
    if (filter.tier === "pro" && !isPro) {
      navigate("/pro");
      return;
    }
    setPending((prev) => {
      const next = new Set(prev);
      if (next.has(filter.id)) {
        next.delete(filter.id);
      } else {
        next.add(filter.id);
      }
      return next;
    });
  };

  const handleApply = () => {
    const newFilters: ActiveFilter[] = Array.from(pending).map((id) => {
      const existing = activeFilters.find((f) => f.id === id);
      return existing ?? { id };
    });
    onApply(newFilters);
    onClose();
  };

  const handleReset = () => {
    setPending(new Set());
  };

  const getTierBadge = (filter: FilterDef) => {
    if (filter.tier === "coming_soon") {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-muted text-muted-foreground">
          <Clock className="h-2.5 w-2.5" />
          Soon
        </span>
      );
    }
    if (filter.tier === "pro" && !isPro) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          <Lock className="h-2.5 w-2.5" />
          PRO
        </span>
      );
    }
    return null;
  };

  const groupCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const group of FILTER_GROUPS) {
      counts[group] = getFiltersByGroup(group).filter((f) => pending.has(f.id)).length;
    }
    return counts;
  }, [pending]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-4xl max-h-[90vh] bg-background border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">
              Select Filters
            </h2>
            <span className="text-xs text-muted-foreground">
              ({FILTERS.length} total)
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-border">
          <div className="relative">
            <Search className="h-4 w-4 text-muted-foreground absolute top-2 left-3" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search filters..."
              className="h-8 pl-9 text-sm"
              autoFocus
            />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Group Sidebar — hidden when searching */}
          {!search.trim() && (
            <div className="w-48 border-r border-border overflow-y-auto py-2 hidden sm:block">
              {FILTER_GROUPS.map((group) => (
                <button
                  key={group}
                  onClick={() => setSelectedGroup(group)}
                  className={cn(
                    "w-full text-left px-4 py-2 text-xs font-medium transition-colors flex items-center justify-between gap-2",
                    selectedGroup === group
                      ? "bg-accent-blue text-white"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <span>{group}</span>
                  {groupCounts[group] > 0 && (
                    <span className={cn(
                      "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold",
                      selectedGroup === group
                        ? "bg-white/20 text-white"
                        : "bg-accent-blue text-white"
                    )}>
                      {groupCounts[group]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Filter List */}
          <div className="flex-1 overflow-y-auto p-4">
            {search.trim() && (
              <div className="text-xs text-muted-foreground mb-3">
                {filteredFilters.length} result{filteredFilters.length !== 1 ? "s" : ""} for "{search}"
              </div>
            )}

            {!search.trim() && (
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                {selectedGroup}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {filteredFilters.map((filter) => {
                const isSelected = pending.has(filter.id);
                const isLocked = filter.tier === "coming_soon" || (filter.tier === "pro" && !isPro);

                return (
                  <button
                    key={filter.id}
                    onClick={() => toggleFilter(filter)}
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-lg border text-left transition-all",
                      isSelected
                        ? "border-accent-blue bg-blue-50 dark:bg-blue-950/30"
                        : isLocked
                        ? "border-border bg-muted/30 opacity-70 cursor-not-allowed"
                        : "border-border hover:border-accent-blue hover:bg-muted/50 cursor-pointer"
                    )}
                  >
                    {/* Checkbox */}
                    <div className={cn(
                      "flex-shrink-0 w-4 h-4 mt-0.5 rounded border flex items-center justify-center transition-colors",
                      isSelected
                        ? "bg-accent-blue border-accent-blue"
                        : "border-border bg-background"
                    )}>
                      {isSelected && <Check className="h-3 w-3 text-white" />}
                    </div>

                    {/* Label + badge */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground">
                          {filter.label}
                        </span>
                        {getTierBadge(filter)}
                      </div>
                      {filter.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {filter.description}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {filteredFilters.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-12">
                No filters match "{search}"
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-muted/30">
          <div className="hidden sm:flex items-center gap-4 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Free
            </span>
            <span className="inline-flex items-center gap-1">
              <Lock className="h-3 w-3 text-amber-600" />
              PRO
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Coming Soon
            </span>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="ghost" size="sm" onClick={handleReset}>
              Reset
            </Button>
            <Button size="sm" onClick={handleApply}>
              Apply {pending.size > 0 ? `(${pending.size})` : ""}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
