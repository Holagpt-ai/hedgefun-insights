import type { CalendarV4Event } from "@/lib/calendar-v4/contract";
import { Button } from "@/components/ui/button";
import { Star, NotebookPen } from "lucide-react";
import { Link } from "react-router-dom";
import { catalystSymbolWorkflowHref } from "@/lib/catalyst/sec-edgar-events";
import { useAddToWatchlist } from "@/hooks/useAddToWatchlist";
import { chipClassForCategory } from "@/components/calendar-v4/category-chip-class";
import { cn } from "@/lib/utils";

interface Props {
  date: string;
  events: CalendarV4Event[];
  onOpenChart: (symbol: string, event: CalendarV4Event) => void;
}

function journalHref(symbol: string, event: CalendarV4Event): string {
  const params = new URLSearchParams({
    symbol,
    catalyst: event.title.slice(0, 120),
    researchDate: event.eventDate,
  });
  return `/journal/trades/new?${params.toString()}`;
}

export function CalendarDayAgenda({ date, events, onOpenChart }: Props) {
  const { add, isAdded } = useAddToWatchlist();

  const heading = new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "America/New_York",
  });

  return (
    <section className="cal-side-card" aria-labelledby="cal-day-agenda-title">
      <h3 id="cal-day-agenda-title">Agenda · {heading}</h3>
      {!events.length ? (
        <p className="text-sm text-muted-foreground">No events on this day for the active filters.</p>
      ) : (
        <ul className="space-y-3">
          {events.map((ev) => {
            const sym = ev.symbols[0];
            return (
              <li key={ev.eventId} className="border-b border-border/60 pb-2 last:border-0">
                <div>
                  <div className="flex items-start gap-2">
                    <span className={cn("text-[10px] font-bold px-1 rounded", chipClassForCategory(ev.legendCategory))}>
                      {ev.legendCategory.replace("_", " ")}
                    </span>
                    <p className="text-sm font-semibold flex-1">{ev.title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {ev.eventTime ? `${ev.eventTime.slice(0, 5)} ET · ` : ""}
                    {ev.source}
                  </p>
                  {sym ? (
                    <div className="flex flex-wrap gap-1 mt-2">
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onOpenChart(sym, ev)}>
                        {sym} chart
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => add(sym)}
                        disabled={isAdded(sym)}
                      >
                        <Star className="h-3 w-3" />
                        {isAdded(sym) ? "On watchlist" : "Watchlist"}
                      </Button>
                      <Button asChild variant="outline" size="sm" className="h-7 text-xs gap-1">
                        <Link to={journalHref(sym, ev)}>
                          <NotebookPen className="h-3 w-3" />
                          Journal
                        </Link>
                      </Button>
                      <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                        <Link to={catalystSymbolWorkflowHref(sym, "ai")}>AI Analyst</Link>
                      </Button>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}