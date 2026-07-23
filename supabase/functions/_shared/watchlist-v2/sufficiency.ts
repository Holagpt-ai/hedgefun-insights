// Data sufficiency gate. Deterministic ordered checks producing controlled
// failure codes. `failure_reason` stores the code; `explanation` is a fixed
// human-readable lookup. First failing check wins.

import type { InputsQuality } from "./contract.ts";

export type SufficiencyCode =
  | "SNAPSHOT_MISSING"
  | "SNAPSHOT_STALE"
  | "SNAPSHOT_MALFORMED"
  | "PRICE_UNAVAILABLE"
  | "PRIOR_CLOSE_UNAVAILABLE"
  | "BARS_MISSING"
  | "BARS_INSUFFICIENT"
  | "BARS_MALFORMED"
  | "VOLUME_UNAVAILABLE"
  | "PROVIDER_UNAVAILABLE";

export interface SufficiencyInput {
  quality: InputsQuality;
  price: number | null;
  priorClose: number | null;
  volume: number | null;
  /** True when a required non-snapshot/bars provider surfaced a transport failure. */
  providerUnavailable?: boolean;
}

export interface SufficiencyResult {
  ok: boolean;
  failure_code: SufficiencyCode | null;
  explanation: string | null;
}

/** Minimum validated intraday bars required to run an AI read. */
export const MIN_BARS_FOR_AI = 10;

const EXPLANATIONS: Record<SufficiencyCode, string> = {
  SNAPSHOT_MISSING: "Market snapshot unavailable.",
  SNAPSHOT_STALE: "Market snapshot is stale.",
  SNAPSHOT_MALFORMED: "Market snapshot payload malformed.",
  PRICE_UNAVAILABLE: "Current price unavailable.",
  PRIOR_CLOSE_UNAVAILABLE: "Prior close unavailable.",
  BARS_MISSING: "Intraday bars unavailable.",
  BARS_INSUFFICIENT: "Not enough intraday bars for this session.",
  BARS_MALFORMED: "Intraday bar payload malformed.",
  VOLUME_UNAVAILABLE: "Volume unavailable.",
  PROVIDER_UNAVAILABLE: "Required upstream provider unavailable.",
};

export function explain(code: SufficiencyCode): string {
  return EXPLANATIONS[code];
}

function fail(code: SufficiencyCode): SufficiencyResult {
  return { ok: false, failure_code: code, explanation: EXPLANATIONS[code] };
}

export function evaluateSufficiency(input: SufficiencyInput): SufficiencyResult {
  const q = input.quality;

  // Ordered, fail-first
  if (q.snapshot === "malformed") return fail("SNAPSHOT_MALFORMED");
  if (q.snapshot === "missing") return fail("SNAPSHOT_MISSING");
  if (q.snapshot === "stale") return fail("SNAPSHOT_STALE");

  if (input.priorClose === null) return fail("PRIOR_CLOSE_UNAVAILABLE");

  if (q.bars === "malformed") return fail("BARS_MALFORMED");
  if (q.bars === "missing") return fail("BARS_MISSING");
  if (q.bars === "insufficient") return fail("BARS_INSUFFICIENT");
  if (q.bar_count < MIN_BARS_FOR_AI) return fail("BARS_INSUFFICIENT");

  if (input.price === null) return fail("PRICE_UNAVAILABLE");
  if (input.volume === null) return fail("VOLUME_UNAVAILABLE");

  if (input.providerUnavailable) return fail("PROVIDER_UNAVAILABLE");

  return { ok: true, failure_code: null, explanation: null };
}
