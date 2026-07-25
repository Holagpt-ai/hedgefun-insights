import type { CatalystEvent } from "@/types/catalyst";
import { EVENT_TYPE_LABEL } from "@/lib/catalyst/parsers";
import { SymbolActions } from "./SymbolActions";

function fmtEtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      timeZone: "America/New_York",
      month: "short", day: "numeric", year: "numeric",
    });
  } catch { return iso; }
}

interface Props {
  events: CatalystEvent[];
  savedEventIds: Set<string>;
  reviewedEventIds: Set<string>;
}

export function CatalystWatch({ events, savedEventIds, reviewedEventIds }: Props) {
  if (events.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        No provider-reported catalyst events in the next 7 days or past 72 hours.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {events.map((e) => {
        const isSaved = savedEventIds.has(e.id);
        const isReviewed = reviewedEventIds.has(e.id);
        return (
          <div key={e.id} className="rounded-xl border bg-card p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-bold text-sm">{e.symbol}</span>
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {EVENT_TYPE_LABEL[e.event_type]}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {isSaved && <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent-blue-light text-accent-blue">Saved</span>}
                {isReviewed && <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Reviewed</span>}
              </div>
            </div>
            <div className="text-sm font-medium line-clamp-2">{e.title}</div>
            <div className="text-[11px] text-muted-foreground">
              {fmtEtDate(e.event_date)} · {e.source_name}
              {e.company_name ? ` · ${e.company_name}` : ""}
            </div>
            <SymbolActions symbol={e.symbol} showChart sourceUrl={e.source_url} />
          </div>
        );
      })}
    </div>
  );
}
