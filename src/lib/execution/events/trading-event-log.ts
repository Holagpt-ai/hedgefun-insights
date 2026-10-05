import type { TradingEvent } from "@/lib/execution/events/trading-event";

export interface TradingEventLog {
  append(event: TradingEvent): void;
  getEvents(): readonly TradingEvent[];
  getByCorrelationId(correlationId: string): readonly TradingEvent[];
}

/** Append-only in-memory log for Sprint 0; persistence behind interface later. */
export function createInMemoryTradingEventLog(): TradingEventLog {
  const events: TradingEvent[] = [];

  return {
    append(event) {
      events.push({ ...event, reasonCodes: [...event.reasonCodes], payload: { ...event.payload } });
    },
    getEvents: () => [...events],
    getByCorrelationId(correlationId) {
      return events.filter((e) => e.correlationId === correlationId);
    },
  };
}
