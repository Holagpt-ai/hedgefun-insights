import { Link } from "react-router-dom";
import { PreMarketSymbolActions } from "./PreMarketSymbolActions";
import { formatPercent, formatPrice, formatVolume, numberOrDash } from "@/lib/pre-market/builders";
import { TopNReveal } from "@/components/session-intelligence/TopNReveal";
import type { PreMarketCatalyst, PreMarketVolumeLeader } from "@/types/pre-market";

export function VolumeLeaderList({
  rows,
  catalysts,
}: {
  rows: PreMarketVolumeLeader[];
  catalysts: PreMarketCatalyst[];
}) {
  // Enrichment only — the incoming volume-descending order is preserved as-is.
  const bySymbol = new Set(catalysts.map((c) => c.symbol));

  return (
    <TopNReveal items={rows}>
      {(visible) => (
        <div className="flex flex-col gap-2">
          {visible.map((r) => (
            <div key={r.symbol} className="flex flex-col gap-2 rounded-xl border bg-card p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Link to={`/stocks/${encodeURIComponent(r.symbol)}`} className="text-sm font-semibold hover:underline">
                    {r.symbol}
                  </Link>
                  {r.company_name && (
                    <span className="max-w-[200px] truncate text-xs text-muted-foreground">{r.company_name}</span>
                  )}
                  {bySymbol.has(r.symbol) && (
                    <span className="rounded-full bg-accent-blue/10 px-2 py-0.5 text-[10px] font-medium text-accent-blue">
                      Provider-reported catalyst
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs tabular-nums">
                  <span>{formatPrice(r.price)}</span>
                  <span
                    className={
                      r.change_percent === null
                        ? "text-muted-foreground"
                        : r.change_percent >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400"
                    }
                  >
                    {formatPercent(r.change_percent)}
                  </span>
                  <span className="text-muted-foreground">Vol {formatVolume(r.volume)}</span>
                  <span className="text-muted-foreground">RVOL {numberOrDash(r.rvol, (n) => n.toFixed(2))}</span>
                </div>
              </div>
              <PreMarketSymbolActions symbol={r.symbol} />
            </div>
          ))}
        </div>
      )}
    </TopNReveal>
  );
}
