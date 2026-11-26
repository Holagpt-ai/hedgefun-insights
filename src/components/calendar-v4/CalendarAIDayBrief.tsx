import { Sparkles } from "lucide-react";
import { buildCalendarDayBrief } from "@/lib/calendar-v4/intelligence";
import type { CalendarV4Event } from "@/lib/calendar-v4/contract";
import { useCalendarCachedIntelligence } from "@/hooks/useCalendarCachedIntelligence";

interface Props {
  date: string;
  events: CalendarV4Event[];
}

export function CalendarAIDayBrief({ date, events }: Props) {
  const symbols = events.flatMap((e) => e.symbols).slice(0, 8);
  const { analysis } = useCalendarCachedIntelligence(symbols);
  const brief = buildCalendarDayBrief(date, events, analysis);

  return (
    <section
      className={`cal-brief ${brief.mode === "cached" ? "cal-brief--cached" : "cal-brief--factual"}`}
      aria-labelledby="cal-day-brief-title"
    >
      <div className="cal-brief-badge">
        <Sparkles className="h-4 w-4" />
        {brief.badge}
      </div>
      <div>
        <h2 id="cal-day-brief-title">
          {brief.title}
          {brief.mode === "cached" ? <span> · {date}</span> : null}
        </h2>
        <ul>
          {brief.bullets.map((b) => (
            <li key={b}>
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              <span>{b}</span>
            </li>
          ))}
        </ul>
        <p className="cal-brief-foot">{brief.footnote}</p>
      </div>
    </section>
  );
}