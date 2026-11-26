import { useMemo } from "react";
import type { CalendarV4Event } from "@/lib/calendar-v4/contract";
import { chipClassForCategory } from "@/components/calendar-v4/category-chip-class";
import { cn } from "@/lib/utils";

interface Props {
  events: CalendarV4Event[];
  onSelectEvent: (event: CalendarV4Event) => void;
  onHoverSymbol: (symbol: string | null, event: CalendarV4Event | null) => void;
  highlightedEventId: string | null;
}

function groupByDate(events: CalendarV4Event[]): [string, CalendarV4Event[]][] {
  const map = new Map<string, CalendarV4Event[]>();
  for (const e of events) {
    const list = map.get(e.eventDate) ?? [];
    list.push(e);
    map.set(e.eventDate, list);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function formatTime(t: string | null): string {
  if (!t) return "—";
  return t.slice(0, 5);
}

export function CalendarListView({ events, onSelectEvent, onHoverSymbol, highlightedEventId }: Props) {
  const groups = useMemo(() => groupByDate(events), [events]);

  if (!groups.length) {
    return <p className="text-sm text-muted-foreground px-1">No events match the active filters.</p>;
  }

  return (
    <div data-testid="calendar-list-view">
      {groups.map(([date, rows]) => (
        <section key={date} className="cal-list-day" aria-label={date}>
          <h3>
            {new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
              weekday: "long",
              month: "short",
              day: "numeric",
              timeZone: "America/New_York",
            })}
          </h3>
          {rows.map((ev) => {
            const sym = ev.symbols[0] ?? "—";
            return (
              <ListRow
                key={ev.eventId}
                ev={ev}
                sym={sym}
                highlighted={highlightedEventId === ev.eventId}
                onSelectEvent={onSelectEvent}
                onHoverSymbol={onHoverSymbol}
              />
            );
          })}
        </section>
      ))}
    </div>
  );
}

function ListRow({
  ev,
  sym,
  highlighted,
  onSelectEvent,
  onHoverSymbol,
}: {
  ev: CalendarV4Event;
  sym: string;
  highlighted: boolean;
  onSelectEvent: (event: CalendarV4Event) => void;
  onHoverSymbol: (symbol: string | null, event: CalendarV4Event | null) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={cn("cal-list-row", highlighted && "ring-1 ring-[var(--hp-blue,#2563eb)]")}
      onClick={() => onSelectEvent(ev)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelectEvent(ev);
        }
      }}
      onMouseEnter={() => onHoverSymbol(sym !== "—" ? sym : null, ev)}
      onMouseLeave={() => onHoverSymbol(null, null)}
      onFocus={() => onHoverSymbol(sym !== "—" ? sym : null, ev)}
      onBlur={() => onHoverSymbol(null, null)}
    >
      <span className="text-xs font-bold text-muted-foreground">{formatTime(ev.eventTime)}</span>
      <span
        className={cn(
          "text-xs font-extrabold rounded px-1 py-0.5",
          chipClassForCategory(ev.legendCategory),
        )}
      >
        {sym}
      </span>
      <span className="text-sm font-semibold leading-snug">{ev.title}</span>
      <span className="text-[10px] text-muted-foreground text-right">
        {ev.hasImpactEvidence && ev.impact === "high" ? "High" : ev.impact === "unknown" ? "—" : ev.impact}
        <br />
        {ev.source}
      </span>
    </div>
  );
}