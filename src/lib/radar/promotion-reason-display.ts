import type { PromotionReason } from "@/lib/radar/radar-event-engine";

export function parsePromotionReason(value: unknown): PromotionReason | null {
  if (value === null || value === undefined || typeof value !== "object") return null;
  const rec = value as Record<string, unknown>;
  if (rec.version !== "v1") return null;
  const primary = rec.primaryEvent;
  const primaryEvent =
    primary !== null &&
    typeof primary === "object" &&
    typeof (primary as Record<string, unknown>).type === "string" &&
    typeof (primary as Record<string, unknown>).eventAt === "string"
      ? {
        type: (primary as Record<string, unknown>).type as string,
        eventAt: (primary as Record<string, unknown>).eventAt as string,
      }
      : null;
  return {
    version: "v1",
    primaryEvent: primaryEvent as PromotionReason["primaryEvent"],
    supportingEvents: Array.isArray(rec.supportingEvents)
      ? (rec.supportingEvents as PromotionReason["supportingEvents"])
      : [],
    triggerTimestamp: typeof rec.triggerTimestamp === "string"
      ? rec.triggerTimestamp
      : null,
    evidenceSnapshot: rec.evidenceSnapshot as PromotionReason["evidenceSnapshot"],
  };
}

export function formatPromotionReasonTitle(reason: PromotionReason | null): string | null {
  if (!reason?.primaryEvent) return null;
  return `Promotion: ${reason.primaryEvent.type.replace(/_/g, " ")}`;
}
