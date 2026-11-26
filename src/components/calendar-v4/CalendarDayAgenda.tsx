import { Star, NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import type { CalendarV4Event } from "@/lib/calendar-v4/contract";
import { useAddToWatchlist } from "@/hooks/useAddToWatchlist";
import { chipClassForCategory } from "@/components/calendar-v4/category-chip-class";
import { buildCalendarJournalHref } from "@/lib/calendar-v4/journal-handoff";
import { cn } from "@/lib/utils";

interface Props {
  date: string;
  events: CalendarV4Event[];
  onPin: (symbol: string, event: CalendarV4Event) => void;
  onOpenChart: (symbol: string, event: CalendarV4Event) => void;
  selectedEventId: string | null;
}

function formatTime(t: string | null): string {
  if (!t) return "—";
  return t.slice(0, 5);
}

export function CalendarDayAgenda({ date, events, onPin, onOpenChart, selectedEventId }: Props) {
  const { add, isAdded } = useAddToWatchlist();
  const heading = new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "America/New_York",
  });

  return (
    <section className="cal-panel" aria-labelledby="cal-day-agenda-title">
      <header className="cal-panel-head">
        <div>
          <h2 id="cal-day-agenda-title">Day view</h2>
          <p className="ph-sub">{heading}</p>
        </div>
      </header>
      {!events.length ? (
        <p className="cal-agenda-empty px-4 py-6 text-sm text-muted-foreground">
          No verified events on this day for the active filters.
        </p>
      ) : (
        <div className="cal-ev-list">
          {events.slice(0, 20).map((ev) => {
            const sym = ev.symbols[0];
            return (
              <article
                key={ev.eventId}
                className={cn("cal-ev-row", selectedEventId === ev.eventId && "cal-ev-row--selected")}
              >
                <span className="cal-ev-time">{formatTime(ev.eventTime)}</span>
                <span className={cn("cal-ev-dot", chipClassForCategory(ev.legendCategory))} aria-hidden />
                <div className="cal-ev-main">
                  <p className="cal-ev-title">
                    {sym ? (
                      <button type="button" className="cal-tickbtn" onClick={() => onPin(sym, ev)}>
                        {sym}
                      </button>
                    ) : null}
                    <span>{ev.title}</span>
                    <span className={cn("cal-badge type", chipClassForCategory(ev.legendCategory))}>
                      {ev.legendCategory.replace("_", " ")}
                    </span>
                    {ev.hasImpactEvidence && ev.impact === "high" ? (
                      <span className="cal-badge high">High</span>
                    ) : ev.impact !== "unknown" ? (
                      <span className="cal-badge low">{ev.impact}</span>
                    ) : null}
                  </p>
                  <p className="cal-ev-meta">
                    <span className="src">{ev.source}</span>
                    {ev.sourceUrl ? (
                      <a href={ev.sourceUrl} target="_blank" rel="noreferrer">
                        Source link
                      </a>
                    ) : null}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {sym ? (
                      <>
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onOpenChart(sym, ev)}>
                          Chart
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => add(sym)}
                          disabled={isAdded(sym)}
                        >
                          <Star className="h-3 w-3" />
                          Watchlist
                        </Button>
                        <Button asChild variant="outline" size="sm" className="h-7 text-xs gap-1">
                          <Link to={buildCalendarJournalHref({ symbol: sym, eventTitle: ev.title, eventDate: ev.eventDate })}>
                            <NotebookPen className="h-3 w-3" />
                            Journal
                          </Link>
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="cal-ev-side">
                  <span className="text-[10px] text-muted-foreground">{ev.status}</span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}