// Response and payload sanitizers for the Catalyst backbone.
// Guarantees no raw provider bodies, no secrets, and only whitelisted keys
// ever leave the edge function boundary.

export interface CatalystSummary {
  status: "completed";
  earnings_read: number;
  news_read: number;
  events_validated: number;
  events_upserted: number;
  events_rejected: number;
}

export function makeEmptySummary(): CatalystSummary {
  return {
    status: "completed",
    earnings_read: 0,
    news_read: 0,
    events_validated: 0,
    events_upserted: 0,
    events_rejected: 0,
  };
}

export function sanitizeSummary(s: CatalystSummary): CatalystSummary {
  return {
    status: "completed",
    earnings_read: nonNegInt(s.earnings_read),
    news_read: nonNegInt(s.news_read),
    events_validated: nonNegInt(s.events_validated),
    events_upserted: nonNegInt(s.events_upserted),
    events_rejected: nonNegInt(s.events_rejected),
  };
}

function nonNegInt(n: number): number {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/**
 * Strip any keys from a facts object that would smuggle score-like signals.
 * Also drops nested objects entirely to keep facts flat and auditable.
 */
export function sanitizeFacts(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: Record<string, unknown> = {};
  const forbidden = /(score|confidence|weight|weighted|rank|tier|band)/i;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (forbidden.test(k)) continue;
    if (v === null) continue;
    const t = typeof v;
    if (t === "string" || t === "number" || t === "boolean") {
      if (t === "number" && !Number.isFinite(v as number)) continue;
      out[k] = v;
    }
  }
  return out;
}
