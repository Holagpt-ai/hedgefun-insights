import type { CalendarV4Event } from "@/lib/calendar-v4/contract";
import { resolveMarketSessionAt } from "@/lib/market-session";

export interface CalendarAiHandoffContext {
  symbol: string;
  eventId: string;
  eventTitle: string;
  eventDate: string;
  eventTime: string | null;
  source: string;
  quoteObservedAt: string | null;
  marketSession: string;
}

export function buildCalendarAiHandoffContext(
  event: CalendarV4Event,
  quoteObservedAt: string | null,
  selectedSymbol?: string | null,
  now = new Date(),
): CalendarAiHandoffContext | null {
  const preferred = selectedSymbol?.toUpperCase();
  const symbol =
    (preferred && event.symbols.map((s) => s.toUpperCase()).includes(preferred)
      ? preferred
      : event.symbols[0]?.toUpperCase()) ?? null;
  if (!symbol) return null;
  const marketSession = resolveMarketSessionAt(now.getTime());
  return {
    symbol,
    eventId: event.eventId,
    eventTitle: event.title,
    eventDate: event.eventDate,
    eventTime: event.eventTime,
    source: event.source,
    quoteObservedAt,
    marketSession,
  };
}

/** AI Analyst consumes `symbol` and optional `prompt` (Free: prefill; Pro: auto-send). */
export function buildCalendarAiAnalystHref(
  ctx: CalendarAiHandoffContext,
  eventStatus: CalendarV4Event["status"],
): string {
  const etToday = nowEtIsoDate();
  const tense =
    eventStatus === "reported" || ctx.eventDate < etToday
      ? "retrospective"
      : eventStatus === "scheduled" || ctx.eventDate >= etToday
        ? "upcoming"
        : "context";
  const scheduleLine =
    tense === "retrospective"
      ? `Reported: ${ctx.eventDate}${ctx.eventTime ? ` ${ctx.eventTime} ET` : ""} (verify against sources)`
      : `Scheduled: ${ctx.eventDate}${ctx.eventTime ? ` ${ctx.eventTime} ET` : ""}`;

  const lines = [
    tense === "retrospective"
      ? `Review how ${ctx.symbol} traded around this catalyst.`
      : `Analyze ${ctx.symbol} ahead of this catalyst.`,
    `Event: ${ctx.eventTitle}`,
    scheduleLine,
    `Source: ${ctx.source}`,
    `Market session: ${ctx.marketSession}`,
    ctx.quoteObservedAt ? `Quote observed: ${ctx.quoteObservedAt}` : null,
    `Event ID: ${ctx.eventId}`,
  ].filter(Boolean);
  const params = new URLSearchParams({
    symbol: ctx.symbol,
    prompt: lines.join("\n"),
  });
  return `/dashboard/ai?${params.toString()}`;
}

function nowEtIsoDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}