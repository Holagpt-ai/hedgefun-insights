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
  now = new Date(),
): CalendarAiHandoffContext | null {
  const symbol = event.symbols[0]?.toUpperCase();
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
export function buildCalendarAiAnalystHref(ctx: CalendarAiHandoffContext): string {
  const lines = [
    `Analyze ${ctx.symbol} ahead of this catalyst.`,
    `Event: ${ctx.eventTitle}`,
    `Scheduled: ${ctx.eventDate}${ctx.eventTime ? ` ${ctx.eventTime} ET` : ""}`,
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