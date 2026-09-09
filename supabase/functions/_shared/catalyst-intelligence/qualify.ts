// Alert qualification. Fail closed. Commentary never qualifies.

import type { CatalystFlags } from "./flags.ts";
import { providerPolicy } from "./providers.ts";
import { HIGH_PRIORITY_THRESHOLD } from "./score.ts";
import type { CatalystIntelligenceRecord } from "./types.ts";

export type QualificationReason =
  | "QUALIFIED"
  | "INTELLIGENCE_DISABLED"
  | "ALERT_GENERATION_DISABLED"
  | "COMMENTARY"
  | "CONTEXT_ONLY"
  | "SCORE_BELOW_THRESHOLD"
  | "UNKNOWN_PROVIDER"
  | "NOT_TICKER_SPECIFIC"
  | "AI_INTERPRETATION"
  | "MISSING_SYMBOL"
  | "MISSING_SOURCE";

export interface QualificationResult {
  qualified: boolean;
  reason: QualificationReason;
}

export function qualifyForAlert(
  record: CatalystIntelligenceRecord,
  flags: CatalystFlags,
): QualificationResult {
  if (!flags.catalystIntelligenceEnabled) {
    return { qualified: false, reason: "INTELLIGENCE_DISABLED" };
  }
  if (!flags.catalystAlertGenerationEnabled) {
    return { qualified: false, reason: "ALERT_GENERATION_DISABLED" };
  }
  if (!record.symbol || record.symbol.trim().length === 0) {
    return { qualified: false, reason: "MISSING_SYMBOL" };
  }
  if (record.fact_state === "ai_interpretation") {
    return { qualified: false, reason: "AI_INTERPRETATION" };
  }
  const policy = providerPolicy(record.provider);
  if (!policy.known || !policy.allowAlerts) {
    return { qualified: false, reason: "UNKNOWN_PROVIDER" };
  }
  if (record.classification === "commentary") {
    return { qualified: false, reason: "COMMENTARY" };
  }
  if (record.classification === "context") {
    return { qualified: false, reason: "CONTEXT_ONLY" };
  }
  if (!record.evidence.ticker_specific) {
    return { qualified: false, reason: "NOT_TICKER_SPECIFIC" };
  }
  if (record.scores.catalyst_score < HIGH_PRIORITY_THRESHOLD) {
    return { qualified: false, reason: "SCORE_BELOW_THRESHOLD" };
  }
  if (!record.source_name && !record.source_url) {
    return { qualified: false, reason: "MISSING_SOURCE" };
  }
  return { qualified: true, reason: "QUALIFIED" };
}
