import type { CatalystEvent } from "@/types/catalyst";

export interface CatalystReactionEvidence {
  window: string | null;
  observationAt: string | null;
  eventAt: string | null;
  priceChangePct: number | null;
  volumeRatio: number | null;
  sessionContext: string | null;
  followThrough: string | null;
  /** Stored observation reference — not a causal claim. */
  observationRef: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readString(obj: Record<string, unknown>, key: string): string | null {
  const raw = obj[key];
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function readNumber(obj: Record<string, unknown>, key: string): number | null {
  const raw = obj[key];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

/** Read persisted delayed-market reaction evidence from event facts only. */
export function readReactionEvidenceFromFacts(facts: Record<string, unknown>): CatalystReactionEvidence | null {
  const block = facts.reaction_evidence ?? facts.market_reaction ?? facts.observed_reaction;
  if (!isRecord(block)) return null;

  const observationRef = readString(block, "observation_id")
    ?? readString(block, "observation_ref")
    ?? readString(block, "bar_set_id");
  const hasMetric =
    readNumber(block, "price_change_pct") != null
    || readNumber(block, "volume_ratio") != null
    || readNumber(block, "rvol") != null;
  if (!observationRef && !hasMetric) return null;

  return {
    window: readString(block, "window") ?? readString(block, "reaction_window"),
    observationAt: readString(block, "observation_at") ?? readString(block, "observed_at"),
    eventAt: readString(block, "event_at") ?? readString(block, "reference_at"),
    priceChangePct: readNumber(block, "price_change_pct") ?? readNumber(block, "move_pct"),
    volumeRatio: readNumber(block, "volume_ratio") ?? readNumber(block, "rvol"),
    sessionContext: readString(block, "session_context") ?? readString(block, "session"),
    followThrough: readString(block, "follow_through") ?? readString(block, "continuation"),
    observationRef,
  };
}

export function readReactionEvidenceFromEvent(event: CatalystEvent): CatalystReactionEvidence | null {
  if (!isRecord(event.facts)) return null;
  return readReactionEvidenceFromFacts(event.facts);
}
