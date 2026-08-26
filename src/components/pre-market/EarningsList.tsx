import { PreMarketSymbolActions } from "./PreMarketSymbolActions";
import { numberOrDash } from "@/lib/pre-market/builders";
import { TopNReveal } from "@/components/session-intelligence/TopNReveal";
import type { PreMarketEarnings } from "@/types/pre-market";

export function EarningsList({ rows }: { rows: PreMarketEarnings[] }) {
  return (
    <TopNReveal items={rows}>
      {(visible) => (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {visible.map((e) => (
            <div key={e.id} className="flex flex-col gap-2 rounded-xl border bg-card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{e.symbol}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  Before Open
                </span>
                <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                  Earnings Calendar · provider reported
                </span>
              </div>
              <p className="break-words text-sm leading-snug">{e.title}</p>
              <div className="text-[11px] text-muted-foreground">
                {e.event_date}
                {" · EPS est "}{numberOrDash(e.estimate_eps, (n) => n.toFixed(2))}
                {" · EPS actual "}{numberOrDash(e.actual_eps, (n) => n.toFixed(2))}
                {" · Surprise "}{numberOrDash(e.surprise_percent, (n) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`)}
                {e.source_name ? ` · ${e.source_name}` : ""}
              </div>
              <PreMarketSymbolActions symbol={e.symbol} />
            </div>
          ))}
        </div>
      )}
    </TopNReveal>
  );
}
