// Data sufficiency gate. Ordered check: snapshot → prior_close → bars.
// Returns data_unavailable classification when any hard gate fails.

import type { InputsQuality } from "./contract.ts";

export interface SufficiencyResult {
  ok: boolean;
  failure_reason: string | null;
}

/**
 * A canonical fixed-order sufficiency gate.
 * The first failing check wins to make failure explanations deterministic.
 */
export function evaluateSufficiency(q: InputsQuality): SufficiencyResult {
  if (q.snapshot === "missing" || q.snapshot === "malformed") {
    return { ok: false, failure_reason: "Market snapshot unavailable." };
  }
  if (q.snapshot === "stale") {
    return { ok: false, failure_reason: "Market snapshot is stale (>45 minutes)." };
  }
  if (q.prior_close === "missing") {
    return { ok: false, failure_reason: "Prior close unavailable." };
  }
  if (q.bars === "missing" || q.bars === "malformed") {
    return { ok: false, failure_reason: "Intraday bars unavailable." };
  }
  if (q.bars === "insufficient") {
    return { ok: false, failure_reason: "Insufficient intraday bars for this session." };
  }
  return { ok: true, failure_reason: null };
}
