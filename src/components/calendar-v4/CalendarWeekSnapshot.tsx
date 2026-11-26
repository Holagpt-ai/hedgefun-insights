import { buildWeekSnapshot } from "@/lib/calendar-v4/intelligence";
import type { CalendarV4Event } from "@/lib/calendar-v4/contract";

interface Props {
  anchorDate: string;
  events: CalendarV4Event[];
  onSelectDate: (iso: string) => void;
}

export function CalendarWeekSnapshot({ anchorDate, events, onSelectDate }: Props) {
  const rows = buildWeekSnapshot(events, anchorDate);
  return (
    <section className="cal-side-card" aria-labelledby="cal-week-snapshot-title">
      <h3 id="cal-week-snapshot-title">Week Snapshot</h3>
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.date}>
            <button
              type="button"
              className="w-full text-left text-xs flex justify-between gap-2 py-1 hover:text-[var(--hp-blue,#2563eb)]"
              onClick={() => onSelectDate(row.date)}
            >
              <span className="font-bold">{row.label}</span>
              <span className="text-muted-foreground">
                HI {row.highImpact} · E {row.earnings} · M {row.macro}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}