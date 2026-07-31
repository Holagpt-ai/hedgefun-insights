import { cn } from "@/lib/utils";
import type { SummaryMetric, WatchlistFilter } from "@/lib/watchlist-v2/metrics";

interface Props {
  metrics: SummaryMetric[];
  activeFilter: WatchlistFilter;
  onFilter: (f: WatchlistFilter) => void;
}

export function WatchlistSummaryStrip({ metrics, activeFilter, onFilter }: Props) {
  return (
    <div
      className="flex gap-2 overflow-x-auto overscroll-x-contain pb-1 -mx-1 px-1 min-w-0"
      role="toolbar"
      aria-label="Watchlist intelligence summary"
    >
      {metrics.map((m) => {
        const evaluable = m.value !== null && m.filter != null;
        const active = m.filter != null && activeFilter === m.filter;
        const display = m.value === null ? "—" : String(m.value);
        return (
          <button
            key={m.key}
            type="button"
            disabled={!evaluable}
            aria-pressed={active}
            onClick={() => {
              if (!evaluable || !m.filter) return;
              onFilter(activeFilter === m.filter ? "all" : m.filter);
            }}
            className={cn(
              "shrink-0 min-w-[108px] rounded-md border px-3 py-2 text-left",
              "bg-slate-50 dark:bg-slate-900/80 border-slate-200 dark:border-slate-700",
              "motion-safe:transition-colors motion-safe:duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60",
              active && "border-cyan-500 dark:border-cyan-600 bg-cyan-50/80 dark:bg-cyan-950/30",
              evaluable && "hover:border-slate-400 dark:hover:border-slate-500 cursor-pointer",
              !evaluable && "opacity-70 cursor-default",
            )}
          >
            <div className="text-lg font-semibold tabular-nums tracking-tight text-slate-800 dark:text-slate-100 leading-none">
              {display}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mt-1 whitespace-nowrap">
              {m.label}
            </div>
          </button>
        );
      })}
    </div>
  );
}
