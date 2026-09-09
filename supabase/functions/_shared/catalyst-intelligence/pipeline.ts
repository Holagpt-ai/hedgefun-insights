// Catalyst Intelligence pipeline.
// normalized catalyst_events -> intelligence record -> optional AlertEvent.
// No UI consumers. No provider I/O. Failures fail closed.

import { classifyIntelligence } from "./classify.ts";
import { buildEvidenceTrail, evidenceHasAiInterpretation } from "./evidence.ts";
import type { CatalystFlags } from "./flags.ts";
import { emitAlertEvent, type AlertQueue, type EmitAlertResult } from "./alerts.ts";
import { createNotificationRouter } from "./router.ts";
import { scoreIntelligence } from "./score.ts";
import type {
  CatalystIntelligenceRecord,
  NormalizedCatalystInput,
} from "./types.ts";
import { SCORING_VERSION } from "./types.ts";

export function intelligenceId(sourceDedupeKey: string): string {
  return `intel:${sourceDedupeKey}`;
}

export function evaluateCatalystIntelligence(
  input: NormalizedCatalystInput,
  nowMs: number,
): CatalystIntelligenceRecord | null {
  if (!input.dedupe_key || !input.symbol || !input.title || !input.provider) {
    return null;
  }
  if (input.verification_state && input.verification_state !== "provider_reported") {
    return null;
  }

  const classified = classifyIntelligence(input);
  const scores = scoreIntelligence(input, classified, nowMs);
  const evidence = buildEvidenceTrail(input, classified, scores);
  if (evidenceHasAiInterpretation(evidence)) return null;

  const createdAt = Number.isFinite(nowMs) ? new Date(nowMs).toISOString() : new Date(0).toISOString();

  return {
    id: intelligenceId(input.dedupe_key),
    source_event_id: input.id ?? null,
    source_dedupe_key: input.dedupe_key,
    symbol: input.symbol,
    classification: classified.classification,
    direction: classified.direction,
    fact_state: classified.fact_state,
    scores,
    provider: input.provider,
    event_type: input.event_type,
    title: input.title,
    source_name: input.source_name,
    source_url: input.source_url ?? null,
    evidence,
    scoring_version: SCORING_VERSION,
    created_at: createdAt,
  };
}

export interface PipelineResult {
  skipped: boolean;
  skip_reason: string | null;
  record: CatalystIntelligenceRecord | null;
  alert: EmitAlertResult | null;
}

export function runIntelligencePipeline(
  input: NormalizedCatalystInput,
  flags: CatalystFlags,
  deps: {
    nowMs: number;
    queue: AlertQueue;
  },
): PipelineResult {
  if (!flags.catalystIntelligenceEnabled) {
    return {
      skipped: true,
      skip_reason: "CATALYST_INTELLIGENCE_ENABLED=false",
      record: null,
      alert: null,
    };
  }

  const record = evaluateCatalystIntelligence(input, deps.nowMs);
  if (!record) {
    return {
      skipped: true,
      skip_reason: "EVALUATION_FAILED_CLOSED",
      record: null,
      alert: null,
    };
  }

  const router = createNotificationRouter(flags);
  const alert = emitAlertEvent(record, {
    flags,
    queue: deps.queue,
    router,
    nowIso: record.created_at,
  });

  return {
    skipped: false,
    skip_reason: null,
    record,
    alert,
  };
}
