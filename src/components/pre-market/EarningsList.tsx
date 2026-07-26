import { PreMarketSymbolActions } from "./PreMarketSymbolActions";
import { numberOrDash, timeOfDayLabel } from "@/lib/pre-market/builders";
import type { PreMarketEarnings } from "@/types/pre-market";

export function EarningsList({ rows }: { rows: PreMarketEarnings[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {rows.map((e) => (
        <div key={e.id} className="flex flex-col gap-2 rounded-xl border bg-card p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{e.symbol}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {timeOfDayLabel(e.time_of_day)}
            </span>
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
              Provider reported
            </span>
          </div>
          <p className="break-words text-sm leading-snug">{e.title}</p>
          <div className="text-[11px] text-muted-foreground">
            {e.event_date}
            {" · EPS est "}{numberOrDash(e.eps_estimate, (n) => n.toFixed(2))}
            {" · EPS actual "}{numberOrDash(e.eps_actual, (n) => n.toFixed(2))}
            {e.source_name ? ` · ${e.source_name}` : ""}
          </div>
          <PreMarketSymbolActions symbol={e.symbol} />
        </div>
      ))}
    </div>
  );
}
