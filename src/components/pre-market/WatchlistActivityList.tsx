import { PreMarketSymbolActions } from "./PreMarketSymbolActions";
import { directionLabel, formatPercent, formatPrice, formatVolume, numberOrDash } from "@/lib/pre-market/builders";
import type { PreMarketWatchlistRow } from "@/types/pre-market";

function DirectionBadge({ direction }: { direction: string }) {
  const cls =
    direction === "bullish"
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : direction === "bearish"
        ? "bg-red-500/10 text-red-600 dark:text-red-400"
        : direction === "neutral"
          ? "bg-muted text-muted-foreground"
          : "bg-muted text-muted-foreground";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
      AI Read: {directionLabel(direction)}
    </span>
  );
}

export function WatchlistActivityList({ rows }: { rows: PreMarketWatchlistRow[] }) {
  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => {
        const unavailable = r.direction === "data_unavailable";
        return (
          <div key={r.ticker} className="flex flex-col gap-2 rounded-xl border bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{r.ticker}</span>
                {r.company_name && (
                  <span className="max-w-[220px] truncate text-xs text-muted-foreground">{r.company_name}</span>
                )}
                <DirectionBadge direction={r.direction} />
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs tabular-nums">
                <span>{formatPrice(r.price)}</span>
                <span
                  className={
                    r.change_pct === null
                      ? "text-muted-foreground"
                      : r.change_pct >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"
                  }
                >
                  {formatPercent(r.change_pct)}
                </span>
                <span className="text-muted-foreground">Vol {formatVolume(r.volume)}</span>
                <span className="text-muted-foreground">
                  RVOL {numberOrDash(r.rvol, (n) => n.toFixed(2))}
                </span>
              </div>
            </div>

            {unavailable ? (
              <p className="text-xs text-muted-foreground">
                Data Unavailable{r.failure_reason ? ` — ${r.failure_reason}` : ""}
              </p>
            ) : (
              <>
                {r.explanation && <p className="break-words text-xs text-muted-foreground">{r.explanation}</p>}
                {r.market_signals.length > 0 && (
                  <div className="rounded-lg border border-border/60 bg-background/50 p-2">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Market Signals · deterministic
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {r.market_signals
                        .filter((s) => typeof s.label === "string" && s.label.length > 0)
                        .map((s, i) => (
                          <span
                            key={`${r.ticker}-sig-${i}`}
                            className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {s.label}
                          </span>
                        ))}
                    </div>
                  </div>
                )}
              </>
            )}

            <PreMarketSymbolActions symbol={r.ticker} />
          </div>
        );
      })}
    </div>
  );
}
