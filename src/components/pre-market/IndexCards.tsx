import { etTimestampLabel, formatPercent, numberOrDash } from "@/lib/pre-market/builders";
import type { PreMarketIndex } from "@/types/pre-market";

function pulseColor(changePercent: number | null): string {
  if (changePercent === null) return "text-muted-foreground";
  return changePercent >= 0
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-red-600 dark:text-red-400";
}

/**
 * Compact Market Pulse for SPY · QQQ · DIA · IWM.
 * Mobile: symbol + percent. Desktop: also shows last price.
 * Does not add VIX or any feed outside the existing workspace rows.
 */
export function IndexCards({ rows }: { rows: PreMarketIndex[] }) {
  const anyStale = rows.some((r) => r.stale && r.status === "available");

  return (
    <div className="rounded-xl border bg-card px-3 py-2">
      <div className="flex flex-wrap items-baseline gap-y-1">
        {rows.map((r, i) => {
          const unavailable = r.status !== "available" || r.change_percent === null;
          return (
            <span key={r.symbol} className="inline-flex items-baseline">
              {i > 0 && (
                <span className="px-1.5 text-xs text-muted-foreground sm:px-2" aria-hidden>
                  |
                </span>
              )}
              <span className="inline-flex items-baseline gap-1.5 tabular-nums">
                <span className="text-sm font-semibold">{r.symbol}</span>
                <span className={`text-sm font-medium ${pulseColor(unavailable ? null : r.change_percent)}`}>
                  {unavailable ? "—" : formatPercent(r.change_percent)}
                </span>
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  {unavailable
                    ? "Data unavailable"
                    : numberOrDash(r.value, (n) =>
                        n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                      )}
                </span>
              </span>
            </span>
          );
        })}
      </div>
      {anyStale && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          Last available
          {rows
            .filter((r) => r.stale && r.updated_at)
            .map((r) => ` ${r.symbol} ${etTimestampLabel(r.updated_at) ?? ""}`)
            .join(" ·")}
        </p>
      )}
    </div>
  );
}
