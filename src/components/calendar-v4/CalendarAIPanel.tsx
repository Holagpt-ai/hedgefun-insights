import { Link } from "react-router-dom";
import type { CalendarV4Event } from "@/lib/calendar-v4/contract";
import { buildCalendarAiAnalystHref, buildCalendarAiHandoffContext } from "@/lib/calendar-v4/ai-handoff";

interface Props {
  symbol: string;
  event: CalendarV4Event | null;
  quoteObservedAt: string | null;
}

export function CalendarAIPanel({ symbol, event, quoteObservedAt }: Props) {
  const ctx = event ? buildCalendarAiHandoffContext(event, quoteObservedAt) : null;
  const href = ctx ? buildCalendarAiAnalystHref(ctx) : `/dashboard/ai?symbol=${encodeURIComponent(symbol)}`;

  return (
    <section className="rounded-lg border border-border p-3 bg-muted/20" aria-label="AI Analyst handoff">
      <h4 className="text-xs font-extrabold mb-1">AI Analyst</h4>
      <p className="text-xs text-muted-foreground mb-2">
        Opens AI Analyst with a structured prompt (symbol, catalyst, schedule, source, session). Free accounts
        prefill the prompt; Pro sends when you confirm.
      </p>
      {ctx ? (
        <ul className="text-[10px] text-muted-foreground list-disc pl-4 mb-2">
          <li>{ctx.eventTitle}</li>
          <li>
            {ctx.eventDate}
            {ctx.eventTime ? ` ${ctx.eventTime} ET` : ""}
          </li>
          <li>{ctx.source}</li>
        </ul>
      ) : null}
      <Link to={href} className="text-xs font-bold text-[var(--cal-blue,#1663d9)]">
        Continue in AI Analyst →
      </Link>
    </section>
  );
}