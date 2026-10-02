import { attributeCandidate } from "./attribution.ts";
import { buildAttributionIndex } from "./attribution-index.ts";
import { appendLifecycle } from "./lifecycle.ts";
import type { CatalystIntelStore } from "./persistence.ts";
import { applyScores } from "./pipeline.ts";
import type { CanonicalEvent, CompanyRecord, RawItemRecord, SourceRecord } from "./types.ts";

export const ATTRIBUTION_CORRECTION_POLICY_VERSION = "news-attribution-correction-v1";

export interface AttributionCorrectionScope {
  rawItemId: string;
  eventId: string;
  wrongTicker: string;
}

export type AttributionCorrectionStatus =
  | "NO_CHANGE"
  | "WOULD_CORRECT"
  | "CORRECTED"
  | "CONFLICT"
  | "SCOPE_MISMATCH"
  | "VALIDATION_ERROR";

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
    removedTickers: string[];
    concurrencyToken: string | null;
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
  source?: SourceRecord;
  now?: Date;
}

export async function runAttributionCorrection(
  store: CatalystIntelStore,
  input: AttributionCorrectionInput,
): Promise<AttributionCorrectionResult> {
  const dryRun = input.apply ? false : input.dryRun;
  if (input.apply && input.dryRun) {
    return validationError(false);
  }
  if (!input.apply && !dryRun) {
    return validationError(true);
  }
  if (input.apply && !input.concurrencyToken) {
    return validationError(false);
  }

  const scope = normalizeScope(input.scope);
  const raw = await store.getRawItem(scope.rawItemId);
  const event = await store.getEvent(scope.eventId);
  if (!raw || !event) {
    return { status: "SCOPE_MISMATCH", policyVersion: ATTRIBUTION_CORRECTION_POLICY_VERSION, dryRun, item: null };
  }

  const tickers = await store.listTickers(event.id);
  const wrongLink = tickers.find((row) => row.ticker === scope.wrongTicker && row.isPrimary);
  if (!wrongLink) {
    if (event.lifecycle === "invalidated") {
      return {
        status: "OK",
        policyVersion: ATTRIBUTION_CORRECTION_POLICY_VERSION,
        dryRun,
        item: {
          rawItemId: raw.id,
          eventId: event.id,
          wrongTicker: scope.wrongTicker,
          correctionStatus: "NO_CHANGE",
          proposedLifecycle: event.lifecycle,
          removedTickers: [],
          concurrencyToken: event.updatedAt ?? null,
        },
      };
    }
    return { status: "SCOPE_MISMATCH", policyVersion: ATTRIBUTION_CORRECTION_POLICY_VERSION, dryRun, item: null };
  }

  const evidence = await store.findEvidenceByRaw(raw.id);
  if (!evidence || evidence.eventId !== event.id) {
    return { status: "SCOPE_MISMATCH", policyVersion: ATTRIBUTION_CORRECTION_POLICY_VERSION, dryRun, item: null };
  }

  const now = input.now ?? new Date();
  const token = event.updatedAt ?? null;
  if (input.apply && input.concurrencyToken !== token) {
    return {
      status: "OK",
      policyVersion: ATTRIBUTION_CORRECTION_POLICY_VERSION,
      dryRun: false,
      item: {
        rawItemId: raw.id,
        eventId: event.id,
        wrongTicker: scope.wrongTicker,
        correctionStatus: "CONFLICT",
        proposedLifecycle: null,
        removedTickers: [],
        concurrencyToken: token,
        error: "concurrency_token_mismatch",
      },
    };
  }

  const companies = input.companies ?? [];
  const index = companies.length > 0 ? buildAttributionIndex(companies) : undefined;
  const source = input.source ?? ({
    id: raw.sourceId,
    sourceType: raw.metadata.source_type === "NEWS_PR" ? "NEWS_PR" : "NEWS_PR",
    ticker: null,
    companyName: null,
    cik: null,
  } as SourceRecord);
  const decision = attributeCandidate({
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

  if (decision.status === "resolved" && decision.ticker === scope.wrongTicker) {
    return {
      status: "OK",
      policyVersion: ATTRIBUTION_CORRECTION_POLICY_VERSION,
      dryRun,
      item: {
        rawItemId: raw.id,
        eventId: event.id,
        wrongTicker: scope.wrongTicker,
        correctionStatus: "SCOPE_MISMATCH",
        proposedLifecycle: null,
        removedTickers: [],
        concurrencyToken: token,
        error: "attribution_still_resolves_to_wrong_ticker",
      },
    };
  }

  if (event.lifecycle === "invalidated" && !tickers.some((row) => row.ticker === scope.wrongTicker)) {
    return {
      status: "OK",
      policyVersion: ATTRIBUTION_CORRECTION_POLICY_VERSION,
      dryRun,
      item: {
        rawItemId: raw.id,
        eventId: event.id,
        wrongTicker: scope.wrongTicker,
        correctionStatus: "NO_CHANGE",
        proposedLifecycle: event.lifecycle,
        removedTickers: [],
        concurrencyToken: token,
      },
    };
  }

  const proposedLifecycle: CanonicalEvent["lifecycle"] = "invalidated";
  const correctionStatus: AttributionCorrectionStatus = dryRun ? "WOULD_CORRECT" : "CORRECTED";
  if (dryRun) {
    return {
      status: "OK",
      policyVersion: ATTRIBUTION_CORRECTION_POLICY_VERSION,
      dryRun: true,
      item: {
        rawItemId: raw.id,
        eventId: event.id,
        wrongTicker: scope.wrongTicker,
        correctionStatus,
        proposedLifecycle,
        removedTickers: [scope.wrongTicker],
        concurrencyToken: token,
      },
    };
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
  event.verificationState = "INVALIDATED";
  event.scoreComponents = {
    ...event.scoreComponents,
    attribution_correction: {
      policy: ATTRIBUTION_CORRECTION_POLICY_VERSION,
      raw_item_id: raw.id,
      removed_ticker: scope.wrongTicker,
      corrected_at: now.toISOString(),
      rerun_status: decision.status,
      rerun_note: decision.note,
    },
  };
  applyScores(event, await store.listEvidence(event.id), now);
  const updated = await store.updateEventIfUnchanged(event, token);
  if (!updated) {
    return {
      status: "OK",
      policyVersion: ATTRIBUTION_CORRECTION_POLICY_VERSION,
      dryRun: false,
      item: {
        rawItemId: raw.id,
        eventId: event.id,
        wrongTicker: scope.wrongTicker,
        correctionStatus: "CONFLICT",
        proposedLifecycle: null,
        removedTickers: [],
        concurrencyToken: token,
        error: "event_update_conflict",
      },
    };
  }
  await store.mergeRawMetadata(raw.id, {
    attribution_correction_applied: ATTRIBUTION_CORRECTION_POLICY_VERSION,
    attribution_correction_at: now.toISOString(),
  });

  return {
    status: "OK",
    policyVersion: ATTRIBUTION_CORRECTION_POLICY_VERSION,
    dryRun: false,
    item: {
      rawItemId: raw.id,
      eventId: event.id,
      wrongTicker: scope.wrongTicker,
      correctionStatus,
      proposedLifecycle,
      removedTickers: [scope.wrongTicker],
      concurrencyToken: event.updatedAt ?? null,
    },
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
