import type { Classification } from "./classification.ts";
import type { IntelEventType } from "./types.ts";

/**
 * Materiality is independent of evidence confidence and of observed price.
 * Filings are not automatically strong catalysts.
 */
const BASE: Record<IntelEventType, number> = {
  EARNINGS: 80,
  GUIDANCE: 78,
  M_AND_A: 76,
  FDA_CLINICAL: 74,
  PRODUCT_STRATEGY_EVENT: 70,
  PRODUCT_LAUNCH: 68,
  FINANCING: 60,
  DILUTION: 64,
  EXECUTIVE_CHANGE: 58,
  REGULATORY: 62,
  LEGAL: 55,
  CONTRACT: 57,
  PARTNERSHIP: 54,
  INVESTOR_EVENT: 52,
  CONFERENCE: 42,
  ANALYST_ACTION: 40,
  SEC_FILING: 48,
  CORPORATE_ACTION: 46,
  OTHER_MATERIAL_EVENT: 30,
};

const SUBTYPE_ADJUST: Record<string, number> = {
  "8-K": 62,
  "10-K": 46,
  "10-Q": 44,
  "form-4": 28,
  "13D": 56,
  "13G": 40,
  "S-3": 60,
  "424B": 62,
  "S-4": 74,
  "DEFM14A": 74,
};

export function assessMateriality(classification: Classification): number {
  const subtype = classification.subtype ? SUBTYPE_ADJUST[classification.subtype] : undefined;
  let score = subtype ?? BASE[classification.eventType];
  if (classification.explicitProductUpdate && classification.eventType === "PRODUCT_STRATEGY_EVENT") {
    score = Math.max(score, 78);
  }
  return clamp(score);
}

export function timingUrgency(input: {
  bucket: string;
  lifecycle: string;
  scheduledStart: string | null;
  scheduledDate: string | null;
  now: Date;
}): number {
  if (input.lifecycle === "live" || input.lifecycle === "announced" || input.bucket === "immediate") return 90;
  if (input.lifecycle === "approaching") return 82;
  if (input.lifecycle === "reacting") return 88;
  if (input.lifecycle === "follow_through") return 70;
  const start = input.scheduledStart ? Date.parse(input.scheduledStart) : NaN;
  if (Number.isFinite(start)) {
    const days = (start - input.now.getTime()) / 86_400_000;
    if (days <= 1) return 80;
    if (days <= 7) return 68;
    if (days <= 30) return 52;
    return 40;
  }
  if (input.scheduledDate) return 50;
  if (input.bucket === "unknown") return 20;
  return 45;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}
