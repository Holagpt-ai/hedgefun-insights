import { companyIrAdapter } from "./adapters/company-ir.ts";
import { classifyCandidate } from "./classification.ts";
import { assessMateriality } from "./impact.ts";
import type { CatalystIntelStore } from "./persistence.ts";
import { applyScores } from "./pipeline.ts";
import { normalizeTiming } from "./timing.ts";
import type {
  CanonicalEvent,
  EvidenceRecord,
  RawItemRecord,
  RawSourceItem,
  SourceRecord,
  SourceRunContext,
} from "./types.ts";

/** Stable policy id for IR semantics reconciliation (classifier/timing v2). */
export const RECONCILIATION_POLICY_VERSION = "ir-semantics-v2";

export interface ReconciliationScope {
  ticker: string;
  sourceKey: string;
  expectedCount: number;
}

export type ReconciliationItemStatus =
  | "NO_CHANGE"
  | "WOULD_UPDATE"
  | "UPDATED"
  | "CONFLICT"
  | "ERROR";

export interface ReconciliationFieldSnapshot {
  eventType: CanonicalEvent["eventType"];
  eventSubtype: string | null;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  scheduledDate: string | null;
  timingBucket: CanonicalEvent["timingBucket"];
  timingUrgency: number;
  catalystState: CanonicalEvent["catalystState"];
  materiality: number;
  priorityScore: number;
  evidenceConfidence: number;
}

export interface ReconciliationItemResult {
  eventId: string;
  rawItemId: string;
  title: string;
  status: ReconciliationItemStatus;
  current: ReconciliationFieldSnapshot;
  proposed: ReconciliationFieldSnapshot;
  fieldsChanged: string[];
  preservedFields: string[];
  concurrencyToken: string;
  error?: string;
}

export type ReconciliationRunStatus =
  | "OK"
  | "RECONCILIATION_SCOPE_MISMATCH"
  | "VALIDATION_ERROR";

export interface ReconciliationResult {
  status: ReconciliationRunStatus;
  policyVersion: string;
  dryRun: boolean;
  ticker: string;
  sourceKey: string;
  expectedCount: number;
  actualCount: number | null;
  items: ReconciliationItemResult[];
}

const RECONCILABLE_KEYS: (keyof ReconciliationFieldSnapshot)[] = [
  "eventType",
  "eventSubtype",
  "scheduledStartAt",
  "scheduledEndAt",
  "scheduledDate",
  "timingBucket",
  "timingUrgency",
  "catalystState",
  "materiality",
  "priorityScore",
  "evidenceConfidence",
];

const PROTECTED_FIELD_LABELS = [
  "id",
  "canonicalKey",
  "rawItemId",
  "evidenceId",
  "tickerLinks",
  "lifecycle",
  "lifecycleLog",
  "firstDiscoveredAt",
  "verificationState",
  "distributionStatus",
  "reactionScore",
  "attributionConfidence",
  "announcementAt",
  "sourcePublishedAt",
] as const;

interface ScopedTarget {
  raw: RawItemRecord;
  event: CanonicalEvent;
  evidence: EvidenceRecord;
}

export interface ReconciliationRunInput {
  scope: ReconciliationScope;
  dryRun: boolean;
  apply: boolean;
  /** Required for apply: tokens from a prior dry-run (`eventId` → token). */
  concurrencyTokens?: Readonly<Record<string, string>>;
  now?: Date;
}

export async function runEventReconciliation(
  store: CatalystIntelStore,
  input: ReconciliationRunInput,
): Promise<ReconciliationResult> {
  const now = input.now ?? new Date();
  const scope = normalizeScope(input.scope);
  const dryRun = input.apply ? false : input.dryRun;

  if (input.apply && input.dryRun) {
    return emptyResult(scope, false, "VALIDATION_ERROR", null);
  }
  if (!input.apply && !dryRun) {
    return emptyResult(scope, true, "VALIDATION_ERROR", null);
  }
  if (input.apply && (!input.concurrencyTokens || Object.keys(input.concurrencyTokens).length === 0)) {
    return emptyResult(scope, false, "VALIDATION_ERROR", null);
  }

  const resolved = await resolveScope(store, scope);
  if ("error" in resolved) {
    return {
      status: "RECONCILIATION_SCOPE_MISMATCH",
      policyVersion: RECONCILIATION_POLICY_VERSION,
      dryRun,
      ticker: scope.ticker,
      sourceKey: scope.sourceKey,
      expectedCount: scope.expectedCount,
      actualCount: resolved.actualCount,
      items: [],
    };
  }

  const source = resolved.source;
  const items: ReconciliationItemResult[] = [];

  for (const target of resolved.targets) {
    items.push(await reconcileOne(store, {
      target,
      source,
      now,
      dryRun,
      apply: input.apply,
      expectedToken: input.concurrencyTokens?.[target.event.id],
    }));
  }

  items.sort((a, b) => a.eventId.localeCompare(b.eventId));

  return {
    status: "OK",
    policyVersion: RECONCILIATION_POLICY_VERSION,
    dryRun,
    ticker: scope.ticker,
    sourceKey: scope.sourceKey,
    expectedCount: scope.expectedCount,
    actualCount: resolved.targets.length,
    items,
  };
}

function normalizeScope(scope: ReconciliationScope): ReconciliationScope {
  return {
    ticker: scope.ticker.trim().toUpperCase(),
    sourceKey: scope.sourceKey.trim(),
    expectedCount: scope.expectedCount,
  };
}

function emptyResult(
  scope: ReconciliationScope,
  dryRun: boolean,
  status: ReconciliationRunStatus,
  actualCount: number | null,
): ReconciliationResult {
  return {
    status,
    policyVersion: RECONCILIATION_POLICY_VERSION,
    dryRun,
    ticker: scope.ticker,
    sourceKey: scope.sourceKey,
    expectedCount: scope.expectedCount,
    actualCount,
    items: [],
  };
}

async function resolveScope(
  store: CatalystIntelStore,
  scope: ReconciliationScope,
): Promise<
  | { source: SourceRecord; targets: ScopedTarget[] }
  | { error: "RECONCILIATION_SCOPE_MISMATCH"; actualCount: number | null }
> {
  const sources = await store.listSources({ sourceKeys: [scope.sourceKey] });
  const source = sources.find((row) => row.sourceKey === scope.sourceKey) ?? null;
  if (!source) return { error: "RECONCILIATION_SCOPE_MISMATCH", actualCount: null };
  if ((source.ticker ?? "").toUpperCase() !== scope.ticker) {
    return { error: "RECONCILIATION_SCOPE_MISMATCH", actualCount: null };
  }

  const raws = await store.listRawItemsForSource(source.id);
  if (raws.length !== scope.expectedCount) {
    return { error: "RECONCILIATION_SCOPE_MISMATCH", actualCount: raws.length };
  }

  const targets: ScopedTarget[] = [];
  for (const raw of raws) {
    const evidence = await store.findEvidenceByRaw(raw.id);
    if (!evidence || evidence.sourceId !== source.id) {
      return { error: "RECONCILIATION_SCOPE_MISMATCH", actualCount: raws.length };
    }
    const event = await store.getEvent(evidence.eventId);
    if (!event) return { error: "RECONCILIATION_SCOPE_MISMATCH", actualCount: raws.length };
    const links = await store.listTickers(event.id);
    const primary = links.find((row) => row.isPrimary) ?? links[0];
    if (!primary || primary.ticker.toUpperCase() !== scope.ticker) {
      return { error: "RECONCILIATION_SCOPE_MISMATCH", actualCount: raws.length };
    }
    targets.push({ raw, event, evidence });
  }

  return { source, targets };
}

async function reconcileOne(
  store: CatalystIntelStore,
  ctx: {
    target: ScopedTarget;
    source: SourceRecord;
    now: Date;
    dryRun: boolean;
    apply: boolean;
    expectedToken?: string;
  },
): Promise<ReconciliationItemResult> {
  const { target, source, now, dryRun, apply, expectedToken } = ctx;
  const title = target.raw.title ?? target.event.title;
  const currentSnap = snapshotFields(target.event);
  const token = await buildConcurrencyToken(target.event);

  try {
    let workingTarget = target;
    if (apply) {
      if (!expectedToken || expectedToken !== token) {
        return itemResult(target, title, currentSnap, currentSnap, "CONFLICT", token, [], []);
      }
      const fresh = await store.getEvent(target.event.id);
      if (!fresh) {
        return itemResult(target, title, currentSnap, currentSnap, "ERROR", token, [], [], "event_missing");
      }
      const freshToken = await buildConcurrencyToken(fresh);
      if (freshToken !== expectedToken) {
        return itemResult(target, title, snapshotFields(fresh), currentSnap, "CONFLICT", token, [], []);
      }
      workingTarget = { ...target, event: fresh };
    }

    const proposedEvent = await deriveReconciledEvent(store, workingTarget, source, now);
    const proposedSnap = snapshotFields(proposedEvent);
    const fieldsChanged = diffFields(currentSnap, proposedSnap);

    if (fieldsChanged.length === 0) {
      return itemResult(target, title, currentSnap, proposedSnap, "NO_CHANGE", token, fieldsChanged, [...PROTECTED_FIELD_LABELS]);
    }

    if (dryRun) {
      return itemResult(target, title, currentSnap, proposedSnap, "WOULD_UPDATE", token, fieldsChanged, [...PROTECTED_FIELD_LABELS]);
    }

    if (!apply) {
      return itemResult(target, title, currentSnap, proposedSnap, "WOULD_UPDATE", token, fieldsChanged, [...PROTECTED_FIELD_LABELS]);
    }

    const written = await store.updateEventIfUnchanged(proposedEvent, freshUpdatedAt(workingTarget.event));
    if (!written) {
      return itemResult(target, title, currentSnap, proposedSnap, "CONFLICT", token, fieldsChanged, [...PROTECTED_FIELD_LABELS]);
    }
    return itemResult(target, title, currentSnap, proposedSnap, "UPDATED", token, fieldsChanged, [...PROTECTED_FIELD_LABELS]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "reconcile_failed";
    return itemResult(target, title, currentSnap, currentSnap, "ERROR", token, [], [...PROTECTED_FIELD_LABELS], message);
  }
}

function freshUpdatedAt(event: CanonicalEvent): string | null {
  return event.updatedAt ?? null;
}

function itemResult(
  target: ScopedTarget,
  title: string,
  current: ReconciliationFieldSnapshot,
  proposed: ReconciliationFieldSnapshot,
  status: ReconciliationItemStatus,
  concurrencyToken: string,
  fieldsChanged: string[],
  preservedFields: string[],
  error?: string,
): ReconciliationItemResult {
  return {
    eventId: target.event.id,
    rawItemId: target.raw.id,
    title,
    status,
    current,
    proposed,
    fieldsChanged,
    preservedFields,
    concurrencyToken,
    error,
  };
}

export async function deriveReconciledEvent(
  store: CatalystIntelStore,
  target: ScopedTarget,
  source: SourceRecord,
  now: Date,
): Promise<CanonicalEvent> {
  const candidate = await candidateFromStoredRaw(target.raw, source, now);
  if (!candidate) throw new Error("normalize_failed");

  const classification = classifyCandidate(candidate);
  const timing = normalizeTiming(candidate, now);

  const event: CanonicalEvent = structuredClone(target.event);
  event.eventType = classification.eventType;
  event.eventSubtype = classification.subtype;
  event.timingBucket = timing.bucket;
  event.scheduledStartAt = timing.scheduledStart;
  event.scheduledEndAt = timing.scheduledEnd;
  event.scheduledDate = timing.scheduledDate;
  event.effectiveAt = timing.effectiveAt;
  event.materiality = assessMateriality(classification);
  event.scoreComponents = {
    ...event.scoreComponents,
    explicit_product_update: classification.explicitProductUpdate,
  };

  const evidence = await store.listEvidence(event.id);
  applyScores(event, evidence, now);

  restoreProtectedFields(event, target.event);

  event.scoreComponents = {
    ...event.scoreComponents,
    reconciliation: {
      policy_version: RECONCILIATION_POLICY_VERSION,
      reconciled_at: now.toISOString(),
      raw_item_id: target.raw.id,
      reason: "ir-semantics-v2",
    },
  };

  return event;
}

function restoreProtectedFields(next: CanonicalEvent, prev: CanonicalEvent): void {
  next.id = prev.id;
  next.canonicalKey = prev.canonicalKey;
  next.firstDiscoveredAt = prev.firstDiscoveredAt;
  next.lifecycle = prev.lifecycle;
  next.lifecycleLog = prev.lifecycleLog;
  next.verificationState = prev.verificationState;
  next.distributionStatus = prev.distributionStatus;
  next.reactionScore = prev.reactionScore;
  next.attributionConfidence = prev.attributionConfidence;
  next.sourcePublishedAt = prev.sourcePublishedAt ?? next.sourcePublishedAt;
  next.announcementAt = prev.announcementAt ?? next.announcementAt;
  next.updatedAt = prev.updatedAt;
}

export async function candidateFromStoredRaw(
  raw: RawItemRecord,
  source: SourceRecord,
  now: Date,
): Promise<Awaited<ReturnType<NonNullable<typeof companyIrAdapter.normalize>>>> {
  const item: RawSourceItem = {
    sourceId: raw.sourceId,
    sourceType: source.sourceType,
    externalId: raw.externalId,
    canonicalUrl: raw.canonicalUrl,
    publishedAt: raw.publishedAt,
    discoveredAt: raw.discoveredAt,
    title: raw.title,
    summary: raw.bodyExcerpt,
    contentHash: raw.contentHash,
    metadata: raw.metadata,
  };
  const ctx: SourceRunContext = {
    now,
    source,
    userAgent: "catalyst-reconcile",
    fetchImpl: fetch,
    itemLimit: 1,
    allowFixtures: false,
    fetchState: {
      unchanged: false,
      etag: null,
      lastModified: null,
      contentHash: null,
      checkpoint: null,
    },
  };
  return companyIrAdapter.normalize!(item, ctx);
}

function snapshotFields(event: CanonicalEvent): ReconciliationFieldSnapshot {
  return {
    eventType: event.eventType,
    eventSubtype: event.eventSubtype,
    scheduledStartAt: event.scheduledStartAt,
    scheduledEndAt: event.scheduledEndAt,
    scheduledDate: event.scheduledDate,
    timingBucket: event.timingBucket,
    timingUrgency: event.timingUrgency,
    catalystState: event.catalystState,
    materiality: event.materiality,
    priorityScore: event.priorityScore,
    evidenceConfidence: event.evidenceConfidence,
  };
}

function diffFields(
  current: ReconciliationFieldSnapshot,
  proposed: ReconciliationFieldSnapshot,
): string[] {
  const changed: string[] = [];
  for (const key of RECONCILABLE_KEYS) {
    if (current[key] !== proposed[key]) changed.push(key);
  }
  return changed;
}

export async function buildConcurrencyToken(event: CanonicalEvent): Promise<string> {
  const payload = JSON.stringify({
    updatedAt: event.updatedAt ?? null,
    fields: snapshotFields(event),
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
