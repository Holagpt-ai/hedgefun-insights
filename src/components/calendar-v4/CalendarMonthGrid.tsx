import { useMemo } from "react";
import { buildMonthGrid, etTodayParts } from "@/lib/homepage/calendar-month";
import type { CalendarV4Event } from "@/lib/calendar-v4/contract";
import { eventsForDay } from "@/lib/calendar-v4/filters";
import { chipClassForCategory } from "@/components/calendar-v4/category-chip-class";
import { cn } from "@/lib/utils";

const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;
const MAX_CHIPS = 2;

interface Props {
  year: number;
  month: number;
  selectedDate: string;
  events: CalendarV4Event[];
  onSelectDate: (iso: string) => void;
}

export function CalendarMonthGrid({ year, month, selectedDate, events, onSelectDate }: Props) {
  const today = etTodayParts().iso;
  const grid = useMemo(() => buildMonthGrid(year, month, today), [year, month, today]);

  return (
    <div data-testid="calendar-month-grid">
      <div className="cal-month-grid" role="grid" aria-label="Month view">
        {DOW.map((d) => (
          <div key={d} className="cal-month-dow" role="columnheader">
            {d}
          </div>
        ))}
        {grid.map((cell) => {
          const dayEvents = eventsForDay(events, cell.iso);
          const chips = dayEvents.slice(0, MAX_CHIPS);
          const extra = dayEvents.length - chips.length;
          return (
            <button
              key={cell.iso}
              type="button"
              role="gridcell"
              className={cn(
                "cal-month-cell",
                !cell.inMonth && "cal-month-cell--muted",
                cell.isToday && "cal-month-cell--today",
                selectedDate === cell.iso && "cal-month-cell--selected",
              )}
              onClick={() => onSelectDate(cell.iso)}
              aria-pressed={selectedDate === cell.iso}
              aria-label={`${cell.iso}, ${dayEvents.length} events`}
            >
              <span className="cal-month-cell-num">{cell.day}</span>
              {cell.holidayName ? (
                <span className="cal-month-chip cal-chip--other" title={cell.holidayName}>
                  Holiday
                </span>
              ) : null}
              {cell.earlyClose ? (
                <span className="cal-month-chip cal-chip--other">Early close</span>
              ) : null}
              {chips.map((ev) => (
                <span
                  key={ev.eventId}
                  className={cn("cal-month-chip", chipClassForCategory(ev.legendCategory))}
                  title={ev.title}
                >
                  {ev.symbols[0] ? `${ev.symbols[0]} · ` : ""}
                  {ev.title}
                </span>
              ))}
              {extra > 0 ? <span className="cal-month-more">+{extra} more</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}