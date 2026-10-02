import { attributeCandidate, type AttributionDecision } from "./attribution.ts";
import { buildAttributionIndex } from "./attribution-index.ts";
import { attributionDiagnostics } from "./attribution-reasons.ts";
import { appendLifecycle } from "./lifecycle.ts";
import type { CatalystIntelStore } from "./persistence.ts";
import { applyScores } from "./pipeline.ts";
import { catalystPriority } from "./scoring.ts";
import type { CanonicalEvent, CompanyRecord, EvidenceRecord, RawItemRecord, SourceRecord } from "./types.ts";
import { verificationConfidence } from "./verification.ts";

export const ATTRIBUTION_CORRECTION_POLICY_VERSION = "news-attribution-correction-v1";
export const ATTRIBUTION_CORRECTION_RECHECK_FAILED = "ATTRIBUTION_CORRECTION_RECHECK_FAILED";

export interface AttributionCorrectionScope {
  rawItemId: string;
  eventId: string;
  wrongTicker: string;
}

export type AttributionCorrectionStatus =
  | "NO_CHANGE"
  | "WOULD_CORRECT"
  | "CORRECTED"
  | "WOULD_REPAIR"
  | "REPAIRED"
  | "CONFLICT"
  | "SCOPE_MISMATCH"
  | "VALIDATION_ERROR";

export interface AttributionCorrectionRecheck {
  previousTicker: string;
  correctedStatus: "resolved" | "unresolved";
  correctedTicker: string | null;
  correctedNote: string;
  correctedUnresolvedReason: string | null;
}

export interface AttributionCorrectionResult {
  status: AttributionCorrectionRunStatus;
  policyVersion: string;
  dryRun: boolean;
  item: {
    rawItemId: string;
    eventId: string;
    wrongTicker: string;
    correctionStatus: AttributionCorrectionStatus;
    proposedLifecycle: CanonicalEvent["lifecycle"] | null;
    proposedVerificationState: CanonicalEvent["verificationState"] | null;
    removedTickers: string[];
    concurrencyToken: string | null;
    recheck?: AttributionCorrectionRecheck;
    error?: string;
  } | null;
}

export type AttributionCorrectionRunStatus = "OK" | "SCOPE_MISMATCH" | "VALIDATION_ERROR";

export interface AttributionCorrectionInput {
  scope: AttributionCorrectionScope;
  dryRun: boolean;
  apply: boolean;
  concurrencyToken?: string | null;
  companies?: readonly CompanyRecord[];
  loadCompanies?: () => Promise<readonly CompanyRecord[]>;
  source?: SourceRecord;
  now?: Date;
}

export async function runAttributionCorrection(
  store: CatalystIntelStore,
  input: AttributionCorrectionInput,
): Promise<AttributionCorrectionResult> {
  const dryRun = input.apply ? false : input.dryRun;
  if (input.apply && input.dryRun) return validationError(false);
  if (!input.apply && !dryRun) return validationError(true);
  if (input.apply && !input.concurrencyToken) return validationError(false);

  const scope = normalizeScope(input.scope);
  const raw = await store.getRawItem(scope.rawItemId);
  const event = await store.getEvent(scope.eventId);
  if (!raw || !event) {
    return { status: "SCOPE_MISMATCH", policyVersion: ATTRIBUTION_CORRECTION_POLICY_VERSION, dryRun, item: null };
  }

  const tickers = await store.listTickers(event.id);
  const wrongLink = tickers.find((row) => row.ticker === scope.wrongTicker && row.isPrimary);
  const repairMode = !wrongLink && isIncompleteCorrection(event);
  if (!wrongLink && !repairMode) {
    if (event.lifecycle === "invalidated" && event.verificationState === "INVALIDATED") {
      return okItem(dryRun, {
        rawItemId: raw.id,
        eventId: event.id,
        wrongTicker: scope.wrongTicker,
        correctionStatus: "NO_CHANGE",
        proposedLifecycle: event.lifecycle,
        proposedVerificationState: event.verificationState,
        removedTickers: [],
        concurrencyToken: event.updatedAt ?? null,
      });
    }
    return { status: "SCOPE_MISMATCH", policyVersion: ATTRIBUTION_CORRECTION_POLICY_VERSION, dryRun, item: null };
  }

  const evidence = await store.findEvidenceByRaw(raw.id);
  if (!evidence || evidence.eventId !== event.id) {
    return { status: "SCOPE_MISMATCH", policyVersion: ATTRIBUTION_CORRECTION_POLICY_VERSION, dryRun, item: null };
  }

  const companies = await resolveCorrectionCompanies(input);
  if (companies.length === 0) {
    return {
      status: "VALIDATION_ERROR",
      policyVersion: ATTRIBUTION_CORRECTION_POLICY_VERSION,
      dryRun,
      item: {
        rawItemId: raw.id,
        eventId: event.id,
        wrongTicker: scope.wrongTicker,
        correctionStatus: "VALIDATION_ERROR",
        proposedLifecycle: null,
        proposedVerificationState: null,
        removedTickers: [],
        concurrencyToken: event.updatedAt ?? null,
        error: "MISSING_COMPANY_UNIVERSE",
      },
    };
  }

  const now = input.now ?? new Date();
  const token = event.updatedAt ?? null;
  if (input.apply && input.concurrencyToken !== token) {
    return okItem(false, {
      rawItemId: raw.id,
      eventId: event.id,
      wrongTicker: scope.wrongTicker,
      correctionStatus: "CONFLICT",
      proposedLifecycle: null,
      proposedVerificationState: null,
      removedTickers: [],
      concurrencyToken: token,
      error: "concurrency_token_mismatch",
    });
  }

  const source = await resolveCorrectionSource(store, raw, input.source);
  const decision = rerunNewsAttribution(raw, source, companies);
  const recheck = buildRecheck(scope.wrongTicker, decision);
  if (decision.status === "resolved" && decision.ticker === scope.wrongTicker) {
    return okItem(dryRun, {
      rawItemId: raw.id,
      eventId: event.id,
      wrongTicker: scope.wrongTicker,
      correctionStatus: "CONFLICT",
      proposedLifecycle: null,
      proposedVerificationState: null,
      removedTickers: [],
      concurrencyToken: token,
      recheck,
      error: ATTRIBUTION_CORRECTION_RECHECK_FAILED,
    });
  }

  if (repairMode) {
    return repairIncompleteVerification(store, {
      event,
      rawId: raw.id,
      wrongTicker: scope.wrongTicker,
      token,
      dryRun,
      now,
      recheck,
    });
  }

  const proposedLifecycle: CanonicalEvent["lifecycle"] = "invalidated";
  if (dryRun) {
    return okItem(true, {
      rawItemId: raw.id,
      eventId: event.id,
      wrongTicker: scope.wrongTicker,
      correctionStatus: "WOULD_CORRECT",
      proposedLifecycle,
      proposedVerificationState: "INVALIDATED",
      removedTickers: [scope.wrongTicker],
      concurrencyToken: token,
      recheck,
    });
  }

  await store.deleteEventTicker(event.id, scope.wrongTicker);
  event.lifecycleLog = appendLifecycle(
    event.lifecycleLog,
    event.lifecycle,
    proposedLifecycle,
    now.toISOString(),
    "attribution_correction",
  );
  event.lifecycle = proposedLifecycle;
  event.scoreComponents = {
    ...event.scoreComponents,
    attribution_correction: {
      policy_version: ATTRIBUTION_CORRECTION_POLICY_VERSION,
      raw_item_id: raw.id,
      event_id: event.id,
      removed_ticker: scope.wrongTicker,
      corrected_at: now.toISOString(),
      reason: "attribution_rules_no_longer_support_ticker",
      corrected_attribution_status: decision.status,
      corrected_attribution_ticker: decision.ticker,
      corrected_attribution_note: decision.note,
      corrected_unresolved_reason: recheck.correctedUnresolvedReason,
    },
  };
  const listed = await store.listEvidence(event.id);
  sealInvalidatedVerification(event, listed, now);
  const updated = await store.updateEventIfUnchanged(event, token);
  if (!updated) {
    return okItem(false, {
      rawItemId: raw.id,
      eventId: event.id,
      wrongTicker: scope.wrongTicker,
      correctionStatus: "CONFLICT",
      proposedLifecycle: null,
      proposedVerificationState: null,
      removedTickers: [],
      concurrencyToken: token,
      error: "event_update_conflict",
    });
  }
  const saved = await store.getEvent(event.id);
  return okItem(false, {
    rawItemId: raw.id,
    eventId: event.id,
    wrongTicker: scope.wrongTicker,
    correctionStatus: "CORRECTED",
    proposedLifecycle,
    proposedVerificationState: "INVALIDATED",
    removedTickers: [scope.wrongTicker],
    concurrencyToken: saved?.updatedAt ?? token,
    recheck,
  });
}

async function repairIncompleteVerification(
  store: CatalystIntelStore,
  input: {
    event: CanonicalEvent;
    rawId: string;
    wrongTicker: string;
    token: string | null;
    dryRun: boolean;
    now: Date;
    recheck: AttributionCorrectionRecheck;
  },
): Promise<AttributionCorrectionResult> {
  const from = input.event.verificationState;
  if (input.dryRun) {
    return okItem(true, {
      rawItemId: input.rawId,
      eventId: input.event.id,
      wrongTicker: input.wrongTicker,
      correctionStatus: "WOULD_REPAIR",
      proposedLifecycle: "invalidated",
      proposedVerificationState: "INVALIDATED",
      removedTickers: [],
      concurrencyToken: input.token,
      recheck: input.recheck,
    });
  }

  const prior = correctionProvenance(input.event) ?? {};
  input.event.lifecycleLog = [
    ...input.event.lifecycleLog,
    {
      from: input.event.lifecycle,
      to: "invalidated",
      at: input.now.toISOString(),
      reason: "verification_state_repair",
    },
  ];
  input.event.lifecycle = "invalidated";
  input.event.scoreComponents = {
    ...input.event.scoreComponents,
    attribution_correction: {
      ...prior,
      verification_state_repair: {
        repaired_at: input.now.toISOString(),
        from,
        to: "INVALIDATED",
        reason: "incomplete_attribution_correction",
      },
    },
  };
  const listed = await store.listEvidence(input.event.id);
  sealInvalidatedVerification(input.event, listed, input.now);
  const updated = await store.updateEventIfUnchanged(input.event, input.token);
  if (!updated) {
    return okItem(false, {
      rawItemId: input.rawId,
      eventId: input.event.id,
      wrongTicker: input.wrongTicker,
      correctionStatus: "CONFLICT",
      proposedLifecycle: null,
      proposedVerificationState: null,
      removedTickers: [],
      concurrencyToken: input.token,
      error: "event_update_conflict",
    });
  }
  const saved = await store.getEvent(input.event.id);
  return okItem(false, {
    rawItemId: input.rawId,
    eventId: input.event.id,
    wrongTicker: input.wrongTicker,
    correctionStatus: "REPAIRED",
    proposedLifecycle: "invalidated",
    proposedVerificationState: "INVALIDATED",
    removedTickers: [],
    concurrencyToken: saved?.updatedAt ?? input.token,
    recheck: input.recheck,
  });
}

/**
 * applyScores derives verification from remaining evidence. A single secondary
 * publisher becomes REPORTED and would undo an explicit INVALIDATED write.
 * Re-apply INVALIDATED after scoring so persistence stores the correction state.
 */
function sealInvalidatedVerification(
  event: CanonicalEvent,
  evidence: readonly EvidenceRecord[],
  now: Date,
): void {
  applyScores(event, evidence, now);
  event.verificationState = "INVALIDATED";
  event.evidenceConfidence = verificationConfidence("INVALIDATED");
  const scored = catalystPriority({
    evidenceConfidence: event.evidenceConfidence,
    materiality: event.materiality,
    timingUrgency: event.timingUrgency,
    attributionConfidence: event.attributionConfidence,
    reactionScore: event.reactionScore,
    verification: "INVALIDATED",
    lifecycle: event.lifecycle,
  });
  event.priorityScore = scored.priority;
  event.catalystState = scored.state;
  event.scoreComponents = { ...event.scoreComponents, ...scored.components };
}

function isIncompleteCorrection(event: CanonicalEvent): boolean {
  return event.lifecycle === "invalidated" &&
    event.verificationState !== "INVALIDATED" &&
    correctionProvenance(event) != null;
}

function correctionProvenance(event: CanonicalEvent): Record<string, unknown> | null {
  const value = event.scoreComponents.attribution_correction;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function okItem(
  dryRun: boolean,
  item: NonNullable<AttributionCorrectionResult["item"]>,
): AttributionCorrectionResult {
  return {
    status: "OK",
    policyVersion: ATTRIBUTION_CORRECTION_POLICY_VERSION,
    dryRun,
    item,
  };
}

async function resolveCorrectionCompanies(input: AttributionCorrectionInput): Promise<readonly CompanyRecord[]> {
  if (input.companies && input.companies.length > 0) return input.companies;
  if (input.loadCompanies) return await input.loadCompanies();
  return [];
}

async function resolveCorrectionSource(
  store: CatalystIntelStore,
  raw: RawItemRecord,
  sourceHint: SourceRecord | undefined,
): Promise<SourceRecord> {
  if (sourceHint) return sourceHint;
  const sources = await store.listSources({ sourceKeys: [raw.sourceId] });
  const found = sources.find((row) => row.id === raw.sourceId);
  if (found) return found;
  return {
    id: raw.sourceId,
    sourceKey: "unknown",
    companyName: null,
    ticker: null,
    cik: null,
    sourceType: "NEWS_PR",
    url: raw.canonicalUrl ?? "https://news.invalid/",
    hostname: "news.invalid",
    feedFormat: "rss",
    pollIntervalSeconds: 0,
    enabled: true,
    priority: 10,
    evidenceTier: "TIER_2_STRONG_SECONDARY",
    authorityKey: "unknown",
    lastSuccessAt: null,
    lastContentHash: null,
    lastEtag: null,
    lastModified: null,
    failureCount: 0,
    backoffUntil: null,
    lastErrorCategory: null,
    metadata: {},
  };
}

function rerunNewsAttribution(
  raw: RawItemRecord,
  source: SourceRecord,
  companies: readonly CompanyRecord[],
): AttributionDecision {
  const index = buildAttributionIndex(companies);
  return attributeCandidate({
    raw: {
      sourceId: raw.sourceId,
      sourceType: "NEWS_PR",
      externalId: raw.externalId,
      canonicalUrl: raw.canonicalUrl,
      publishedAt: raw.publishedAt,
      discoveredAt: raw.discoveredAt,
      title: raw.title,
      summary: raw.bodyExcerpt,
      contentHash: raw.contentHash,
      metadata: raw.metadata,
    },
    title: raw.title ?? "",
    summary: raw.bodyExcerpt,
    suggestedType: null,
    subtype: null,
    scheduledStart: null,
    scheduledEnd: null,
    scheduledDate: null,
    isAnnouncement: true,
    evidenceTier: "TIER_2_STRONG_SECONDARY",
    metadata: raw.metadata,
  }, {
    sourceTicker: source.ticker,
    sourceCompanyName: source.companyName,
    sourceCik: source.cik,
    sourceType: "NEWS_PR",
    companies,
    attributionIndex: index,
  });
}

function buildRecheck(previousTicker: string, decision: AttributionDecision): AttributionCorrectionRecheck {
  const { unresolvedReason } = attributionDiagnostics(decision);
  return {
    previousTicker,
    correctedStatus: decision.status,
    correctedTicker: decision.ticker,
    correctedNote: decision.note,
    correctedUnresolvedReason: unresolvedReason,
  };
}

function normalizeScope(scope: AttributionCorrectionScope): AttributionCorrectionScope {
  return {
    rawItemId: scope.rawItemId.trim(),
    eventId: scope.eventId.trim(),
    wrongTicker: scope.wrongTicker.trim().toUpperCase(),
  };
}

function validationError(dryRun: boolean): AttributionCorrectionResult {
  return {
    status: "VALIDATION_ERROR",
    policyVersion: ATTRIBUTION_CORRECTION_POLICY_VERSION,
    dryRun,
    item: null,
  };
}
