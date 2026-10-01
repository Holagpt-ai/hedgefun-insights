import { eventReferenceInstant, type EventPriceBar } from "./event-bars.ts";

export type EventReferenceField =
  | "announcement_at"
  | "effective_at"
  | "scheduled_start_at"
  | "first_discovered_at";

export interface ReferencePriceProvenance {
  provider: "polygon";
  ticker: string;
  reference_price: number;
  bar_resolution: "1m";
  bar_start_at: string;
  bar_end_at: string;
  event_reference_at: string;
  event_reference_field: EventReferenceField;
  resolved_at: string;
}

export interface LegacyReferenceProvenance {
  provider: "legacy_unavailable";
  note: "reference_price_present_without_persisted_provenance";
}

export type StoredReferenceProvenance = ReferencePriceProvenance | LegacyReferenceProvenance;

export function eventReferenceField(event: {
  announcementAt: string | null;
  effectiveAt: string | null;
  scheduledStartAt: string | null;
  firstDiscoveredAt: string | null;
}): EventReferenceField {
  if (event.announcementAt) return "announcement_at";
  if (event.effectiveAt) return "effective_at";
  if (event.scheduledStartAt) return "scheduled_start_at";
  return "first_discovered_at";
}

export function resolvePolygonReference(input: {
  bars: readonly EventPriceBar[];
  eventAtIso: string;
  ticker: string;
  event: {
    announcementAt: string | null;
    effectiveAt: string | null;
    scheduledStartAt: string | null;
    firstDiscoveredAt: string | null;
  };
  resolvedAt: Date;
}): { price: number | null; provenance: ReferencePriceProvenance | null } {
  const eventMs = Date.parse(input.eventAtIso);
  if (!Number.isFinite(eventMs)) return { price: null, provenance: null };
  let best: { end: number; start: number; durationMs: number; close: number } | null = null;
  for (const bar of input.bars) {
    if (!(bar.close > 0) || !Number.isFinite(bar.startMs) || bar.durationMs <= 0) continue;
    const end = bar.startMs + bar.durationMs;
    if (end > eventMs) continue;
    if (eventMs - end > 2 * 60_000) continue;
    if (!best || end > best.end) {
      best = { end, start: bar.startMs, durationMs: bar.durationMs, close: bar.close };
    }
  }
  if (!best) return { price: null, provenance: null };
  const refAt = eventReferenceInstant(input.event) ?? input.eventAtIso;
  return {
    price: best.close,
    provenance: {
      provider: "polygon",
      ticker: input.ticker.trim().toUpperCase(),
      reference_price: best.close,
      bar_resolution: "1m",
      bar_start_at: new Date(best.start).toISOString(),
      bar_end_at: new Date(best.end).toISOString(),
      event_reference_at: refAt,
      event_reference_field: eventReferenceField(input.event),
      resolved_at: input.resolvedAt.toISOString(),
    },
  };
}

export function readStoredProvenance(payload: Record<string, unknown>): StoredReferenceProvenance | null {
  const raw = payload.reference_provenance;
  if (!raw || typeof raw !== "object") return null;
  const prov = raw as Record<string, unknown>;
  if (prov.provider === "polygon") return prov as unknown as ReferencePriceProvenance;
  if (prov.provider === "legacy_unavailable") return prov as unknown as LegacyReferenceProvenance;
  return null;
}

export function legacyProvenanceIfNeeded(
  referencePrice: number | null,
  payload: Record<string, unknown>,
): LegacyReferenceProvenance | null {
  if (referencePrice == null || !(referencePrice > 0)) return null;
  if (readStoredProvenance(payload)) return null;
  return {
    provider: "legacy_unavailable",
    note: "reference_price_present_without_persisted_provenance",
  };
}
