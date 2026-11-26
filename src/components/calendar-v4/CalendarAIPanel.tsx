import { Link } from "react-router-dom";
import type { CalendarV4Event } from "@/lib/calendar-v4/contract";
import { catalystSymbolWorkflowHref } from "@/lib/catalyst/sec-edgar-events";

interface Props {
  symbol: string;
  event: CalendarV4Event | null;
}

/** Calendar-scoped AI handoff — structured context via query; no Anthropic on this surface. */
export function CalendarAIPanel({ symbol, event }: Props) {
  const href = catalystSymbolWorkflowHref(symbol, "ai");
  return (
    <section className="rounded-lg border border-border p-3 bg-muted/20" aria-label="AI Analyst">
      <h4 className="text-xs font-extrabold mb-1">AI Analyst</h4>
      <p className="text-xs text-muted-foreground mb-2">
        Open AI Analyst with symbol and catalyst context. Trading stances (WAIT, LONG BIAS, AVOID, NO TRADE) appear only when cached analysis exists.
      </p>
      {event ? (
        <ul className="text-[10px] text-muted-foreground list-disc pl-4 mb-2">
          <li>Event: {event.title}</li>
          <li>Date: {event.eventDate}</li>
          <li>Source: {event.source}</li>
        </ul>
      ) : null}
      <Link to={href} className="text-xs font-bold text-[var(--hp-blue,#2563eb)]">
        Continue in AI Analyst →
      </Link>
    </section>
  );
}