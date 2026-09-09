// AlertEvent schema, builder, emitter, and in-memory queue.
// Persistence is internal only. Delivery goes through Notification Router.

import type { CatalystFlags } from "./flags.ts";
import { qualifyForAlert, type QualificationReason } from "./qualify.ts";
import type { NotificationRouter } from "./types.ts";
import type { AlertEvent, CatalystIntelligenceRecord } from "./types.ts";

export function alertDedupeKey(sourceEventDedupeKey: string): string {
  return `alert:v1:${sourceEventDedupeKey}`;
}

export function buildAlertEvent(
  record: CatalystIntelligenceRecord,
  nowIso: string,
): AlertEvent {
  return {
    dedupeKey: alertDedupeKey(record.source_dedupe_key),
    intelligenceId: record.id,
    sourceEventDedupeKey: record.source_dedupe_key,
    symbol: record.symbol,
    classification: record.classification,
    direction: record.direction,
    catalystScore: record.scores.catalyst_score,
    title: record.title,
    sourceUrl: record.source_url,
    sourceName: record.source_name,
    provider: record.provider,
    factState: record.fact_state,
    evidence: record.evidence,
    createdAt: nowIso,
    deliveryStatus: "queued",
    deliverySuppressedReason: null,
  };
}

export interface AlertQueue {
  get(dedupeKey: string): AlertEvent | undefined;
  upsert(event: AlertEvent): { inserted: boolean; event: AlertEvent };
  all(): AlertEvent[];
}

export function createMemoryAlertQueue(): AlertQueue {
  const store = new Map<string, AlertEvent>();
  return {
    get(dedupeKey) {
      return store.get(dedupeKey);
    },
    upsert(event) {
      const existing = store.get(event.dedupeKey);
      if (existing) return { inserted: false, event: existing };
      store.set(event.dedupeKey, event);
      return { inserted: true, event };
    },
    all() {
      return [...store.values()];
    },
  };
}

export interface EmitAlertResult {
  emitted: boolean;
  collapsed: boolean;
  reason: QualificationReason | "EMITTED" | "COLLAPSED";
  event: AlertEvent | null;
  delivered: boolean;
}

export function emitAlertEvent(
  record: CatalystIntelligenceRecord,
  deps: {
    flags: CatalystFlags;
    queue: AlertQueue;
    router: NotificationRouter;
    nowIso: string;
  },
): EmitAlertResult {
  const qualification = qualifyForAlert(record, deps.flags);
  if (!qualification.qualified) {
    return {
      emitted: false,
      collapsed: false,
      reason: qualification.reason,
      event: null,
      delivered: false,
    };
  }

  const built = buildAlertEvent(record, deps.nowIso);
  const routed = deps.router.route(built);
  const persisted: AlertEvent = {
    ...built,
    deliveryStatus: routed.delivered ? "queued" : "suppressed",
    deliverySuppressedReason: routed.delivered ? null : routed.reason,
  };

  const stored = deps.queue.upsert(persisted);
  if (!stored.inserted) {
    return {
      emitted: true,
      collapsed: true,
      reason: "COLLAPSED",
      event: stored.event,
      delivered: false,
    };
  }

  return {
    emitted: true,
    collapsed: false,
    reason: "EMITTED",
    event: stored.event,
    delivered: routed.delivered === true,
  };
}
