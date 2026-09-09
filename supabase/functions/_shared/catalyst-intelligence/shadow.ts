// Non-visible shadow logging only. No UI, no notifications, no cron.

import type { CatalystIntelligenceRecord } from "./types.ts";

export interface ShadowLogLine {
  tag: "catalyst-intelligence-shadow";
  scoring_version: string;
  source_dedupe_key: string;
  symbol: string;
  classification: string;
  direction: string;
  fact_state: string;
  catalyst_score: number;
  provider: string;
  event_type: string;
}

export function toShadowLog(record: CatalystIntelligenceRecord): ShadowLogLine {
  return {
    tag: "catalyst-intelligence-shadow",
    scoring_version: record.scoring_version,
    source_dedupe_key: record.source_dedupe_key,
    symbol: record.symbol,
    classification: record.classification,
    direction: record.direction,
    fact_state: record.fact_state,
    catalyst_score: record.scores.catalyst_score,
    provider: record.provider,
    event_type: record.event_type,
  };
}

export function shadowLogIntelligence(record: CatalystIntelligenceRecord): ShadowLogLine {
  const line = toShadowLog(record);
  console.log(`[catalyst-intelligence-shadow] ${JSON.stringify(line)}`);
  return line;
}
