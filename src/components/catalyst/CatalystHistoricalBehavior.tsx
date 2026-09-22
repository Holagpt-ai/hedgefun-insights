import { Badge } from "@/components/ui/badge";
import {
  CATALYST_CATEGORY_LABEL,
  catalystCategoryBadgeClass,
} from "@/lib/catalyst/catalyst-event-visuals";
import type { CatalystHistoricalSummary } from "@/lib/catalyst/catalyst-historical-facts";
import { cn } from "@/lib/utils";

export function CatalystHistoricalBehavior({
  summary,
  loading,
}: {
  summary: CatalystHistoricalSummary;
  loading?: boolean;
}) {
  return (
    <section className="space-y-2" data-testid="catalyst-historical-behavior">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Historical Catalyst Behavior
      </div>

      {loading && !summary.available && (
        <p className="text-[12px] text-muted-foreground">Loading historical context…</p>
      )}

      {!loading && !summary.available && (
        <p className="text-[12px] text-muted-foreground">Historical catalyst context unavailable</p>
      )}

      {summary.available && (
        <>
          {summary.lines.length > 0 ? (
            <ul className="space-y-1">
              {summary.lines.map((line) => (
                <li key={line} className="text-[12px] leading-snug text-foreground/85">
                  {line}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12px] text-muted-foreground">
              Historical catalyst context unavailable
            </p>
          )}

          <div className="pt-1">
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Prior Events
            </div>
            {summary.priorEvents.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">No linked prior episodes found</p>
            ) : (
              <div className="space-y-2">
                {summary.priorEvents.map((event) => (
                  <div
                    key={event.key}
                    className="min-w-0 rounded-md border border-border bg-muted/30 p-2.5"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className={cn(
                          "h-4 rounded px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wide",
                          catalystCategoryBadgeClass(event.category),
                        )}
                      >
                        {CATALYST_CATEGORY_LABEL[event.category]}
                      </Badge>
                      {event.eventDate && (
                        <span className="text-[11px] tabular-nums text-muted-foreground">
                          {event.eventDate}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 break-words text-[12px] font-medium leading-snug">
                      {event.title}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                      <span>{event.temporalRelationshipLabel}</span>
                      {event.source && <span>Source: {event.source}</span>}
                      {event.observedD1 && (
                        <span className="tabular-nums">Observed D1: {event.observedD1}</span>
                      )}
                      {event.observedD5 && (
                        <span className="tabular-nums">Observed D5: {event.observedD5}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
