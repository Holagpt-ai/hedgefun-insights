/**
 * Batch 224 — bounded Penny Continuation integration entrypoint.
 * Not imported by live sync-screener-data, Fly, or Radar publication handlers.
 */

import { PENNY_CONTINUATION_MODEL_VERSION } from "../config/penny-continuation.config.ts";
import type { RadarV22CandidateRow } from "../radar-v22/persistence-v2.ts";
import { adaptDiscoveredCandidateToPennyInput } from "./penny-continuation-market-adapter.ts";
import {
  PENNY_CONTINUATION_INTEGRATION_VERSION,
  type PennyContinuationDiscoveredCandidate,
  type PennyContinuationIntegrationContext,
  type PennyContinuationIntegrationResult,
  type PennyIntegrationAdapterReason,
} from "./penny-continuation-integration-types.ts";
import {
  buildPennyAmInboxBadgePayload,
} from "./penny-continuation-handoff.ts";
import { rankPennyContinuationCandidates } from "./penny-continuation-ranking.ts";
import {
  evaluatePennyContinuationV1,
  type PennyContinuationEvaluateOptions,
} from "./penny-continuation-v1.ts";
import { normalizeSymbol } from "./selection.ts";

/** Align with Radar V2.2 candidate cap — integration is bounded, not a market rescan. */
export const PENNY_INTEGRATION_CANDIDATE_CAP = 200;

export interface EvaluateBoundedPennyContinuationOptions
  extends PennyContinuationEvaluateOptions {
  includeBadges?: boolean;
  maxCandidates?: number;
}

function parseSymbolsFromRadarRows(
  rows: readonly RadarV22CandidateRow[],
): PennyContinuationDiscoveredCandidate[] {
  return rows.map((row) => ({
    symbol: row.symbol,
    radarRow: row,
  }));
}

/**
 * Convenience: wrap existing Radar-discovered rows as bounded integration input.
 * Does not fetch or scan — caller supplies the list.
 */
export function pennyCandidatesFromRadarRows(
  rows: readonly RadarV22CandidateRow[],
): PennyContinuationDiscoveredCandidate[] {
  return parseSymbolsFromRadarRows(rows);
}

export function evaluateBoundedPennyContinuationV1(
  candidates: readonly PennyContinuationDiscoveredCandidate[],
  ctx: PennyContinuationIntegrationContext,
  options?: EvaluateBoundedPennyContinuationOptions,
): PennyContinuationIntegrationResult {
  const max = options?.maxCandidates ?? PENNY_INTEGRATION_CANDIDATE_CAP;
  const evaluatedAt = new Date(ctx.evaluationClockMs).toISOString();
  const duplicateSymbolsSkipped: string[] = [];
  const rejections: PennyContinuationIntegrationResult["rejections"] = [];
  const qualified: ReturnType<typeof evaluatePennyContinuationV1>[] = [];

  if (candidates.length === 0) {
    return emptyIntegrationResult(ctx, evaluatedAt, {
      adapterReason: "CANDIDATE_LIST_EMPTY",
    });
  }

  if (candidates.length > max) {
    return emptyIntegrationResult(ctx, evaluatedAt, {
      adapterReason: "CANDIDATE_LIST_EXCEEDS_CAP",
    });
  }

  const seen = new Set<string>();

  for (const candidate of candidates) {
    const symbol = normalizeSymbol(candidate.symbol);
    if (!symbol) {
      rejections.push({
        symbol: String(candidate.symbol),
        adapterReasons: ["INVALID_SYMBOL"],
        result: null,
      });
      continue;
    }
    if (seen.has(symbol)) {
      duplicateSymbolsSkipped.push(symbol);
      continue;
    }
    seen.add(symbol);

    const adapted = adaptDiscoveredCandidateToPennyInput(candidate, ctx);
    if (!adapted.input) {
      rejections.push({
        symbol,
        adapterReasons: adapted.adapterReasons,
        result: null,
      });
      continue;
    }

    const result = evaluatePennyContinuationV1(adapted.input, {
      enforcePublicationCooldown: options?.enforcePublicationCooldown,
    });

    if (result.continuationQualified) {
      qualified.push(result);
    } else {
      rejections.push({
        symbol,
        adapterReasons: [],
        result,
      });
    }
  }

  const rankedQualified = rankPennyContinuationCandidates(qualified);
  const badges = options?.includeBadges === false
    ? []
    : rankedQualified
      .map((r) => buildPennyAmInboxBadgePayload(r))
      .filter((b): b is NonNullable<typeof b> => b !== null);

  return {
    integration_version: PENNY_CONTINUATION_INTEGRATION_VERSION,
    model_version: PENNY_CONTINUATION_MODEL_VERSION,
    sessionDate: ctx.sessionDate,
    evaluatedAt,
    context: {
      dataDeliveryPolicy: ctx.dataDeliveryPolicy,
      verifiedExpectedProviderDelayMs: ctx.verifiedExpectedProviderDelayMs,
      observationGenerationId: ctx.observationGenerationId ?? null,
    },
    rankedQualified,
    rejections,
    duplicateSymbolsSkipped,
    badges,
    workflowHandoffReady: {
      radarEmphasis: rankedQualified.length > 0,
      amInboxBadge: badges.length > 0,
      watchlistSymbol: false,
      catalystSymbol: false,
      historicalIntelligence: false,
    },
  };
}

function emptyIntegrationResult(
  ctx: PennyContinuationIntegrationContext,
  evaluatedAt: string,
  meta: { adapterReason: PennyIntegrationAdapterReason },
): PennyContinuationIntegrationResult {
  return {
    integration_version: PENNY_CONTINUATION_INTEGRATION_VERSION,
    model_version: PENNY_CONTINUATION_MODEL_VERSION,
    sessionDate: ctx.sessionDate,
    evaluatedAt,
    context: {
      dataDeliveryPolicy: ctx.dataDeliveryPolicy,
      verifiedExpectedProviderDelayMs: ctx.verifiedExpectedProviderDelayMs,
      observationGenerationId: ctx.observationGenerationId ?? null,
    },
    rankedQualified: [],
    rejections: [{
      symbol: "*",
      adapterReasons: [meta.adapterReason],
      result: null,
    }],
    duplicateSymbolsSkipped: [],
    badges: [],
    workflowHandoffReady: {
      radarEmphasis: false,
      amInboxBadge: false,
      watchlistSymbol: false,
      catalystSymbol: false,
      historicalIntelligence: false,
    },
  };
}
