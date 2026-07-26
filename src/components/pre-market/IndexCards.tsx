import { etTimestampLabel, formatPercent, numberOrDash } from "@/lib/pre-market/builders";
import type { PreMarketIndex } from "@/types/pre-market";

export function IndexCards({ rows }: { rows: PreMarketIndex[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {rows.map((r) => {
        // An index that failed validation is disclosed, never silently dropped.
        if (r.status !== "available" || r.value === null || r.change_percent === null) {
          return (
            <div key={r.symbol} className="rounded-xl border border-dashed bg-card p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold">{r.symbol}</span>
                <span className="text-xs text-muted-foreground">—</span>
              </div>
              <div className="mt-1 text-lg font-bold tabular-nums text-muted-foreground">—</div>
              <div className="mt-1 text-[10px] text-muted-foreground">Data unavailable</div>
            </div>
          );
        }
        const up = r.change_percent >= 0;
        return (
          <div key={r.symbol} className="rounded-xl border bg-card p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold">{r.symbol}</span>
              <span className={`text-xs font-medium ${up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                {formatPercent(r.change_percent)}
              </span>
            </div>
            <div className="mt-1 text-lg font-bold tabular-nums">
              {numberOrDash(r.value, (n) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground">
              {r.stale ? "Last available" : "Updated"} {etTimestampLabel(r.updated_at) ?? "—"}
            </div>
          </div>
        );
      })}
    </div>
  );
}
