import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { V2AddSymbol } from "@/components/watchlist-v2/V2AddSymbol";
import { cn } from "@/lib/utils";
import type {
  WatchlistDensity,
  WatchlistFilter,
  WatchlistSort,
} from "@/lib/watchlist-v2/metrics";
import { Search } from "lucide-react";

const FILTERS: { id: WatchlistFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "movers", label: "Movers" },
  { id: "high_volume", label: "High Volume" },
  { id: "earnings", label: "Earnings" },
  { id: "catalysts", label: "Catalysts" },
  { id: "near_hod", label: "Near HOD" },
  { id: "data_unavailable", label: "Data Unavailable" },
];

const DENSITIES: { id: WatchlistDensity; label: string }[] = [
  { id: "comfortable", label: "Comfort" },
  { id: "compact", label: "Compact" },
  { id: "terminal", label: "Terminal" },
];

interface Props {
  symbolCount: number;
  sessionLabel: string;
  onAdd: (symbol: string) => void;
  isAdding: boolean;
  prefillSymbol: string | null;
  search: string;
  onSearch: (v: string) => void;
  filter: WatchlistFilter;
  onFilter: (f: WatchlistFilter) => void;
  sort: WatchlistSort;
  onSort: (s: WatchlistSort) => void;
  density: WatchlistDensity;
  onDensity: (d: WatchlistDensity) => void;
}

export function WatchlistCommandHeader({
  symbolCount,
  sessionLabel,
  onAdd,
  isAdding,
  prefillSymbol,
  search,
  onSearch,
  filter,
  onFilter,
  sort,
  onSort,
  density,
  onDensity,
}: Props) {
  return (
    <header className="space-y-3 min-w-0">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
              Watchlist
            </h1>
            <span className="text-sm tabular-nums text-slate-500 dark:text-slate-400">
              {symbolCount} symbol{symbolCount === 1 ? "" : "s"}
            </span>
            <span className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-600 rounded px-1.5 py-0.5">
              {sessionLabel}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            15-minute delayed market feed · Scoreless institutional read
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 min-w-0 w-full lg:w-auto">
          <V2AddSymbol
            onAdd={onAdd}
            disabled={isAdding}
            initialSymbol={prefillSymbol}
            compact
          />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-3 min-w-0">
        <div className="relative flex-1 min-w-0 sm:max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Filter by symbol or name…"
            className="h-8 pl-8 text-sm bg-white dark:bg-slate-900"
            aria-label="Search watchlist"
          />
        </div>

        <Select value={sort} onValueChange={(v) => onSort(v as WatchlistSort)}>
          <SelectTrigger className="h-8 w-full sm:w-[160px] text-xs" aria-label="Sort watchlist">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="added">Added order</SelectItem>
            <SelectItem value="volume">Volume</SelectItem>
            <SelectItem value="rvol">RVOL</SelectItem>
            <SelectItem value="change_pct">% move</SelectItem>
            <SelectItem value="earnings">Earnings date</SelectItem>
            <SelectItem value="symbol">Symbol</SelectItem>
          </SelectContent>
        </Select>

        <div
          className="flex rounded-md border border-slate-200 dark:border-slate-600 overflow-hidden h-8 w-full sm:w-auto"
          role="group"
          aria-label="Density"
        >
          {DENSITIES.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => onDensity(d.id)}
              aria-pressed={density === d.id}
              className={cn(
                "flex-1 sm:flex-none px-2.5 text-[11px] uppercase tracking-wide",
                "motion-safe:transition-colors motion-safe:duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-500/60",
                density === d.id
                  ? "bg-slate-800 text-white dark:bg-cyan-900/80 dark:text-cyan-50"
                  : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800",
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onFilter(f.id)}
            aria-pressed={filter === f.id}
            className={cn(
              "h-7 px-2.5 rounded text-[11px] font-medium border",
              "motion-safe:transition-colors motion-safe:duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60",
              filter === f.id
                ? "bg-slate-800 text-white border-slate-800 dark:bg-cyan-900/80 dark:text-cyan-50 dark:border-cyan-700"
                : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500",
            )}
          >
            {f.label}
          </button>
        ))}
        {(filter === "advancing" || filter === "declining") && (
          <span className="h-7 inline-flex items-center px-2.5 rounded text-[11px] font-medium border border-cyan-300 bg-cyan-50 text-cyan-900 dark:border-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-200">
            {filter === "advancing" ? "Advancing" : "Declining"}
          </span>
        )}
      </div>
    </header>
  );
}
