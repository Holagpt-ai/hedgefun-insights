import type { RadarV22EventRow } from "../../../../supabase/functions/_shared/radar-v22/persistence-v2.ts";

function eventKey(ev: RadarV22EventRow): string {
  return [
    ev.trading_date,
    ev.session_kind,
    ev.symbol,
    ev.event_type,
    ev.event_at,
  ].join("|");
}

export const RADAR_V2_MAX_EVENTS_PER_PUBLISH = 256;

export type RadarV2EventPublishQueue = {
  stageIncoming(events: readonly RadarV22EventRow[]): void;
  nextBatch(maxBatch?: number): RadarV22EventRow[];
  confirmPersisted(batch: readonly RadarV22EventRow[]): void;
  pendingCount(): number;
  reset(): void;
  pendingKeys(): string[];
};

/** Lossless bounded flush: overflow waits in-memory for later publishes (idempotent RPC). */
export function createRadarV2EventPublishQueue(
  maxBatch = RADAR_V2_MAX_EVENTS_PER_PUBLISH,
): RadarV2EventPublishQueue {
  const pending = new Map<string, RadarV22EventRow>();

  return {
    stageIncoming(events) {
      for (const ev of events) {
        const key = eventKey(ev);
        if (!pending.has(key)) pending.set(key, ev);
      }
    },
    nextBatch(batchSize = maxBatch) {
      if (pending.size === 0) return [];
      return [...pending.values()]
        .sort((a, b) => Date.parse(a.event_at) - Date.parse(b.event_at))
        .slice(0, batchSize);
    },
    confirmPersisted(batch) {
      for (const ev of batch) pending.delete(eventKey(ev));
    },
    pendingCount() {
      return pending.size;
    },
    reset() {
      pending.clear();
    },
    pendingKeys() {
      return [...pending.keys()];
    },
  };
}
