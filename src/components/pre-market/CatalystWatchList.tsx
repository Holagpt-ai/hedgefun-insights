import { ExternalLink } from "lucide-react";
import { PreMarketSymbolActions } from "./PreMarketSymbolActions";
import { catalystTypeLabel, etTimestampLabel, timeOfDayLabel } from "@/lib/pre-market/builders";
import type { PreMarketCatalyst } from "@/types/pre-market";

export function CatalystWatchList({ rows, etDate }: { rows: PreMarketCatalyst[]; etDate: string }) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {rows.map((c) => (
        <div key={c.id} className="flex flex-col gap-2 rounded-xl border bg-card p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{c.symbol}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {catalystTypeLabel(c)}
            </span>
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
              Provider reported
            </span>
            {c.event_date === etDate && (
              <span className="rounded-full bg-accent-blue/10 px-2 py-0.5 text-[10px] font-medium text-accent-blue">Today</span>
            )}
          </div>
          <p className="break-words text-sm leading-snug">{c.title}</p>
          <div className="text-[11px] text-muted-foreground">
            {c.event_date}
            {c.event_time ? ` · ${etTimestampLabel(c.event_time)}` : ` · ${timeOfDayLabel(c.time_of_day)}`}
            {c.source_name ? ` · ${c.source_name}` : ""}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PreMarketSymbolActions symbol={c.symbol} />
            {c.source_url && (
              <a
                href={c.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-accent-blue hover:underline"
              >
                Source <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
