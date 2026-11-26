import { buildCalendarDayBrief } from "@/lib/calendar-v4/intelligence";
import type { CalendarV4Event } from "@/lib/calendar-v4/contract";

interface Props {
  date: string;
  events: CalendarV4Event[];
}

export function CalendarAIDayBrief({ date, events }: Props) {
  const brief = buildCalendarDayBrief(date, events);
  return (
    <section className="cal-side-card" aria-labelledby="cal-day-brief-title">
      <h3 id="cal-day-brief-title">AI Day Brief</h3>
      <p className="text-sm font-bold mb-2">{brief.headline}</p>
      <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4">
        {brief.bullets.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
      <p className="text-[10px] text-muted-foreground mt-2">
        Factual summary from scheduled events. Cached AI analysis loads per symbol when available — no live generation on this page.
      </p>
    </section>
  );
}