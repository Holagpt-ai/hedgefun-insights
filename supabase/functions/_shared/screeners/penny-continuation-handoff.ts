/**
 * AM Inbox badge payload for Penny Continuation V1 (Batch 223).
 * UI wiring deferred; consumers merge this alongside existing Continuation V1 cards.
 */

import type {
  PennyAmInboxBadgePayload,
  PennyContinuationResult,
} from "./penny-continuation-types.ts";

export function buildPennyAmInboxBadgePayload(
  result: PennyContinuationResult,
): PennyAmInboxBadgePayload | null {
  if (!result.continuationQualified) return null;
  return {
    kind: "penny_continuation_v1",
    symbol: result.symbol,
    sessionDate: result.sessionDate ?? "",
    continuationQualified: true,
    corePassCount: result.corePassCount,
    dataFreshnessLabel: result.dataFreshnessLabel,
    score: result.score,
    supplementalLabels: result.supplementalLabels,
    model_version: result.model_version,
  };
}
